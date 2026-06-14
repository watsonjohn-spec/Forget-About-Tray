import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 4173);
const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const allowLiveStripe = process.env.ALLOW_LIVE_STRIPE === "true";
const currency = (process.env.STRIPE_CURRENCY || "gbp").toLowerCase();
const basePrice = Number(process.env.PRINT_BASE_PRICE_PENCE || 800);
const pricePerCm3 = Number(process.env.PRINT_PRICE_PER_CM3_PENCE || 25);
const stripeApiBase = process.env.STRIPE_API_BASE || "https://api.stripe.com";
const allowedCountries = (process.env.STRIPE_ALLOWED_COUNTRIES || "GB,US").split(",").map((country) => country.trim().toUpperCase()).filter(Boolean);
const allowedOrigin = process.env.CHECKOUT_ALLOWED_ORIGIN || "";
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
  if (!testKey && !liveKey) return { ready: false, reason: "Stripe server key is not configured." };
  if (liveKey && !allowLiveStripe) return { ready: false, reason: "Live Stripe payments are disabled until ALLOW_LIVE_STRIPE=true." };
  return { ready: true, mode: liveKey ? "live" : "test" };
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
    const returnOrigin = process.env.CHECKOUT_RETURN_ORIGIN || origin || `http://${request.headers.host}`;
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
    sendJson(response, 400, { error: error.message || "Checkout request failed." }, origin);
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
      pricePerCm3
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
