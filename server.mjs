import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 4173);
const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const allowLiveStripe = process.env.ALLOW_LIVE_STRIPE === "true";
const currency = (process.env.STRIPE_CURRENCY || "gbp").toLowerCase();
const basePrice = Number(process.env.PRINT_BASE_PRICE_PENCE || 800);
const pricePerCm3 = Number(process.env.PRINT_PRICE_PER_CM3_PENCE || 25);
const unlimitedExportsPrice = Number(process.env.UNLIMITED_EXPORTS_PRICE_PENCE || 500);
const stripeApiBase = process.env.STRIPE_API_BASE || "https://api.stripe.com";
const allowedCountries = (process.env.STRIPE_ALLOWED_COUNTRIES || "GB,US").split(",").map((country) => country.trim().toUpperCase()).filter(Boolean);
const allowedOrigin = process.env.CHECKOUT_ALLOWED_ORIGIN || "";
const entitlementSecret = process.env.DOWNLOAD_ENTITLEMENT_SECRET || stripeKey;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, body, origin = "") {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {})
  });
  response.end(JSON.stringify(body));
}

function checkoutOriginAllowed(request) {
  const requestOrigin = request.headers.origin || "";
  if (!requestOrigin) return true;
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const expectedOrigin = allowedOrigin || `${protocol}://${request.headers.host}`;
  return requestOrigin === expectedOrigin;
}

function checkoutOrigin(request) {
  return checkoutOriginAllowed(request) ? request.headers.origin || "" : "";
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32_000) throw new Error("Request too large");
  }
  return JSON.parse(body || "{}");
}

function numberInRange(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error("Invalid tray dimensions");
  return number;
}

function priceTray(input) {
  const config = {
    columns: numberInRange(input.columns, 1, 12),
    rows: numberInRange(input.rows, 1, 12),
    baseSize: numberInRange(input.baseSize, 10, 150),
    baseDepth: numberInRange(input.baseDepth, 10, 150),
    gap: numberInRange(input.gap ?? 1, 0, 10),
    clearance: numberInRange(input.clearance ?? 1, 0, 10),
    plateThickness: numberInRange(input.plateThickness ?? 2, 0.8, 10),
    wallHeight: numberInRange(input.wallHeight ?? 3, 0, 20),
    wallThickness: numberInRange(input.wallThickness ?? 1.6, 0.8, 5),
    lipEnabled: Boolean(input.lipEnabled)
  };
  const wall = config.lipEnabled ? config.wallThickness : 0;
  const innerWidth = config.columns * config.baseSize + (config.columns - 1) * config.gap + config.clearance * 2;
  const innerDepth = config.rows * config.baseDepth + (config.rows - 1) * config.gap + config.clearance * 2;
  const outerWidth = innerWidth + wall * 2;
  const outerDepth = innerDepth + wall * 2;
  const plateVolume = outerWidth * outerDepth * config.plateThickness;
  const lipVolume = config.lipEnabled
    ? ((innerWidth * 2 + innerDepth * 2) * config.wallThickness + config.wallThickness ** 2 * 4) * config.wallHeight
    : 0;
  const materialCm3 = (plateVolume + lipVolume) / 1000;
  const amount = Math.max(50, Math.round(basePrice + materialCm3 * pricePerCm3));
  return { config, outerWidth, outerDepth, materialCm3, amount };
}

function stripeReady() {
  const testKey = stripeKey.startsWith("sk_test_") || stripeKey.startsWith("rk_test_");
  const liveKey = stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_");
  if ((!testKey && !liveKey) || stripeKey.includes("replace_me")) return { ready: false, reason: "Stripe server key is not configured." };
  if (liveKey && !allowLiveStripe) return { ready: false, reason: "Live Stripe payments are disabled until ALLOW_LIVE_STRIPE=true." };
  return { ready: true, mode: liveKey ? "live" : "test" };
}

function checkoutReturnOrigin(request, origin) {
  return process.env.CHECKOUT_RETURN_ORIGIN || origin || `http://${request.headers.host}`;
}

function createDownloadEntitlement(sessionId) {
  const payload = Buffer.from(JSON.stringify({ scope: "unlimited-stl", sessionId, version: 1 })).toString("base64url");
  const signature = createHmac("sha256", entitlementSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function downloadEntitlementValid(token) {
  if (!entitlementSecret || typeof token !== "string") return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", entitlementSecret).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, "base64url");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed.scope !== "unlimited-stl" || !parsed.sessionId) return false;
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function createStripeCheckout(request, response) {
  const origin = checkoutOrigin(request);
  if (!checkoutOriginAllowed(request)) return sendJson(response, 403, { error: "Origin is not allowed." });
  const readiness = stripeReady();
  if (!readiness.ready) return sendJson(response, 503, { error: readiness.reason }, origin);

  try {
    const body = await readJson(request);
    const priced = priceTray(body.config || {});
    const prefix = String(body.name || "Printed movement tray").slice(0, 80);
    const returnOrigin = checkoutReturnOrigin(request, origin);
    const parameters = new URLSearchParams({
      mode: "payment",
      success_url: `${returnOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/?checkout=cancelled`,
      billing_address_collection: "required",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(priced.amount),
      "line_items[0][price_data][product_data][name]": prefix,
      "line_items[0][price_data][product_data][description]": `${priced.config.columns} x ${priced.config.rows} tray for ${priced.config.baseSize} x ${priced.config.baseDepth}mm bases`,
      "line_items[0][quantity]": "1",
      "metadata[columns]": String(priced.config.columns),
      "metadata[rows]": String(priced.config.rows),
      "metadata[base_width_mm]": String(priced.config.baseSize),
      "metadata[base_depth_mm]": String(priced.config.baseDepth),
      "metadata[outer_width_mm]": priced.outerWidth.toFixed(1),
      "metadata[outer_depth_mm]": priced.outerDepth.toFixed(1)
    });
    allowedCountries.forEach((country, index) => parameters.set(`shipping_address_collection[allowed_countries][${index}]`, country));
    const stripeResponse = await fetch(`${stripeApiBase}/v1/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: parameters
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok || !session.url) throw new Error(session.error?.message || "Stripe Checkout could not be created.");
    sendJson(response, 200, { url: session.url, amount: priced.amount, currency, mode: readiness.mode }, origin);
  } catch (error) {
    const rawMessage = error.cause?.message || error.message || "Checkout request failed.";
    const message = rawMessage.includes("Invalid API Key")
      ? "Stripe rejected the server key. Restart the Movement Tray server after changing .env, or replace the key in Stripe."
      : rawMessage;
    sendJson(response, 400, { error: message }, origin);
  }
}

async function createUnlockCheckout(request, response) {
  const origin = checkoutOrigin(request);
  if (!checkoutOriginAllowed(request)) return sendJson(response, 403, { error: "Origin is not allowed." });
  const readiness = stripeReady();
  if (!readiness.ready) return sendJson(response, 503, { error: readiness.reason }, origin);

  try {
    const returnOrigin = checkoutReturnOrigin(request, origin);
    const parameters = new URLSearchParams({
      mode: "payment",
      success_url: `${returnOrigin}/?checkout=unlock-success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/?checkout=unlock-cancelled`,
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(unlimitedExportsPrice),
      "line_items[0][price_data][product_data][name]": "Unlimited STL exports",
      "line_items[0][price_data][product_data][description]": "One-off purchase for unlimited movement tray STL downloads",
      "line_items[0][quantity]": "1",
      "metadata[purchase_type]": "unlimited_stl"
    });
    const stripeResponse = await fetch(`${stripeApiBase}/v1/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: parameters
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok || !session.url) throw new Error(session.error?.message || "Stripe Checkout could not be created.");
    sendJson(response, 200, { url: session.url, amount: unlimitedExportsPrice, currency, mode: readiness.mode }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.cause?.message || error.message || "Checkout request failed." }, origin);
  }
}

async function verifyUnlockCheckout(request, response) {
  const origin = checkoutOrigin(request);
  if (!checkoutOriginAllowed(request)) return sendJson(response, 403, { error: "Origin is not allowed." });
  const readiness = stripeReady();
  if (!readiness.ready) return sendJson(response, 503, { error: readiness.reason }, origin);

  try {
    const body = await readJson(request);
    const sessionId = String(body.sessionId || "");
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid Stripe Checkout session.");
    const stripeResponse = await fetch(`${stripeApiBase}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${stripeKey}` }
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok) throw new Error(session.error?.message || "Stripe Checkout could not be verified.");
    if (session.payment_status !== "paid" || session.metadata?.purchase_type !== "unlimited_stl") {
      return sendJson(response, 402, { error: "The unlimited STL purchase is not paid." }, origin);
    }
    sendJson(response, 200, { unlocked: true, entitlement: createDownloadEntitlement(session.id) }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.cause?.message || error.message || "Checkout verification failed." }, origin);
  }
}

async function checkUnlockStatus(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const body = await readJson(request);
    sendJson(response, 200, { unlocked: downloadEntitlementValid(body.entitlement) }, origin);
  } catch {
    sendJson(response, 200, { unlocked: false }, origin);
  }
}

async function quoteStripeCheckout(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const body = await readJson(request);
    const priced = priceTray(body.config || {});
    sendJson(response, 200, { amount: priced.amount, currency }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Checkout quote failed." }, origin);
  }
}

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const origin = checkoutOrigin(request);

  if (request.method === "OPTIONS" && pathname.startsWith("/api/checkout")) {
    response.writeHead(204, {
      ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    response.end();
    return;
  }
  if (request.method === "GET" && pathname === "/api/checkout/config") {
    const readiness = stripeReady();
    sendJson(response, 200, {
      enabled: readiness.ready,
      mode: readiness.mode || "unconfigured",
      reason: readiness.reason || "",
      currency,
      basePrice,
      pricePerCm3,
      unlimitedExportsPrice
    }, origin);
    return;
  }
  if (request.method === "POST" && pathname === "/api/checkout/session") {
    await createStripeCheckout(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/checkout/quote") {
    await quoteStripeCheckout(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/checkout/unlock/session") {
    await createUnlockCheckout(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/checkout/unlock/verify") {
    await verifyUnlockCheckout(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/checkout/unlock/status") {
    await checkUnlockStatus(request, response);
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(normalize(root)) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Movement Tray Studio running at http://localhost:${port}`);
});
