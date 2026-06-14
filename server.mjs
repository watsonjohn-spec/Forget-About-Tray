import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const allowedCountries = (process.env.STRIPE_ALLOWED_COUNTRIES || "GB,US").split(",").map((country) => country.trim().toUpperCase()).filter(Boolean);
const allowedOrigin = process.env.CHECKOUT_ALLOWED_ORIGIN || "";
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";
const downloadTokenSecret = process.env.DOWNLOAD_TOKEN_SECRET || stripeKey;
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

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request too large");
  }
  return body;
}

async function readJson(request) {
  return JSON.parse((await readBody(request)) || "{}");
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

function printableTrayConfig(input) {
  return {
    ...priceTray(input).config,
    notchesEnabled: Boolean(input.notchesEnabled),
    notchWidth: numberInRange(input.notchWidth ?? 2, 0.5, 20)
  };
}

function segmentSpans(count, baseSize, gap, clearance, notch) {
  const total = count * baseSize + (count - 1) * gap + clearance * 2;
  if (!notch) return [{ start: 0, length: total }];
  const spans = [];
  let cursor = 0;
  for (let index = 1; index < count; index += 1) {
    const boundary = clearance + index * baseSize + (index - 0.5) * gap;
    const end = boundary - notch / 2;
    spans.push({ start: cursor, length: end - cursor });
    cursor = boundary + notch / 2;
  }
  spans.push({ start: cursor, length: total - cursor });
  return spans.filter((span) => span.length > 0.1);
}

function buildTrayBoxes(config) {
  const innerWidth = config.columns * config.baseSize + (config.columns - 1) * config.gap + config.clearance * 2;
  const innerDepth = config.rows * config.baseDepth + (config.rows - 1) * config.gap + config.clearance * 2;
  const wall = config.lipEnabled ? config.wallThickness : 0;
  const outerWidth = innerWidth + wall * 2;
  const outerDepth = innerDepth + wall * 2;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness }];
  if (!config.lipEnabled) return boxes;
  const z = config.plateThickness;
  const h = config.wallHeight;
  const notch = config.notchesEnabled ? Math.min(config.notchWidth, config.baseSize * 0.45) : 0;
  segmentSpans(config.columns, config.baseSize, config.gap, config.clearance, notch).forEach(({ start, length }) => {
    boxes.push({ x: wall + start, y: 0, z, w: length, d: wall, h });
    boxes.push({ x: wall + start, y: outerDepth - wall, z, w: length, d: wall, h });
  });
  segmentSpans(config.rows, config.baseDepth, config.gap, config.clearance, notch).forEach(({ start, length }) => {
    boxes.push({ x: 0, y: wall + start, z, w: wall, d: length, h });
    boxes.push({ x: outerWidth - wall, y: wall + start, z, w: wall, d: length, h });
  });
  boxes.push(
    { x: 0, y: 0, z, w: wall, d: wall, h },
    { x: outerWidth - wall, y: 0, z, w: wall, d: wall, h },
    { x: 0, y: outerDepth - wall, z, w: wall, d: wall, h },
    { x: outerWidth - wall, y: outerDepth - wall, z, w: wall, d: wall, h }
  );
  return boxes;
}

function boxTriangles({ x, y, z, w, d, h }) {
  const p = [
    [x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z],
    [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]
  ];
  return [
    [p[0], p[2], p[1]], [p[0], p[3], p[2]], [p[4], p[5], p[6]], [p[4], p[6], p[7]],
    [p[0], p[1], p[5]], [p[0], p[5], p[4]], [p[1], p[2], p[6]], [p[1], p[6], p[5]],
    [p[2], p[3], p[7]], [p[2], p[7], p[6]], [p[3], p[0], p[4]], [p[3], p[4], p[7]]
  ];
}

function triangleNormal([a, b, c]) {
  const u = b.map((value, index) => value - a[index]);
  const v = c.map((value, index) => value - a[index]);
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...cross) || 1;
  return cross.map((value) => value / length);
}

function trayStlText(config) {
  const facets = buildTrayBoxes(config).flatMap(boxTriangles).map((triangle) => {
    const normal = triangleNormal(triangle);
    return `  facet normal ${normal.join(" ")}\n    outer loop\n${triangle.map((vertex) => `      vertex ${vertex.join(" ")}`).join("\n")}\n    endloop\n  endfacet`;
  }).join("\n");
  return `solid movement_tray\n${facets}\nendsolid movement_tray\n`;
}

function safeTrayFileName(config, name) {
  const prefix = String(name || "movement-tray").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "movement-tray";
  const base = config.baseSize === config.baseDepth ? `${config.baseSize}mm` : `${config.baseSize}x${config.baseDepth}mm`;
  return `${prefix}-${config.columns}x${config.rows}-${base}.stl`;
}

function downloadFingerprint(config, name) {
  return createHmac("sha256", downloadTokenSecret).update(JSON.stringify({ config, name })).digest("base64url");
}

function createFreeDownloadToken(userId, config, name) {
  const payload = Buffer.from(JSON.stringify({ userId, fingerprint: downloadFingerprint(config, name), expiresAt: Date.now() + 5 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", downloadTokenSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function freeDownloadTokenValid(token, userId, config, name) {
  if (!downloadTokenSecret || typeof token !== "string") return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", downloadTokenSecret).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, "base64url");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed.userId !== userId || parsed.expiresAt < Date.now() || parsed.fingerprint !== downloadFingerprint(config, name)) return false;
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function stripeReady() {
  const testKey = stripeKey.startsWith("sk_test_") || stripeKey.startsWith("rk_test_");
  const liveKey = stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_");
  if ((!testKey && !liveKey) || stripeKey.includes("replace_me")) return { ready: false, reason: "Stripe server key is not configured." };
  if (liveKey && !allowLiveStripe) return { ready: false, reason: "Live Stripe payments are disabled until ALLOW_LIVE_STRIPE=true." };
  return { ready: true, mode: liveKey ? "live" : "test" };
}

function supabaseReady() {
  return Boolean(supabaseUrl && supabasePublishableKey && supabaseSecretKey);
}

async function authenticateUser(request) {
  if (!supabaseReady()) throw new Error("Account service is not configured.");
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Sign in to continue.");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabasePublishableKey, Authorization: authorization }
  });
  const user = await response.json();
  if (!response.ok || !user.id) throw new Error("Your session has expired. Sign in again.");
  return user;
}

async function supabaseAdmin(path, options = {}) {
  if (!supabaseReady()) throw new Error("Account service is not configured.");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseSecretKey,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || "Account database request failed.");
  return body;
}

function checkoutReturnOrigin(request, origin) {
  return process.env.CHECKOUT_RETURN_ORIGIN || origin || `http://${request.headers.host}`;
}

async function createStripeCheckout(request, response) {
  const origin = checkoutOrigin(request);
  if (!checkoutOriginAllowed(request)) return sendJson(response, 403, { error: "Origin is not allowed." });
  const readiness = stripeReady();
  if (!readiness.ready) return sendJson(response, 503, { error: readiness.reason }, origin);

  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const printable = printableTrayConfig(body.config || {});
    const priced = priceTray(printable);
    const prefix = String(body.name || "Printed movement tray").slice(0, 80);
    const orderId = randomUUID();
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
      "metadata[purchase_type]": "printed_tray",
      "metadata[user_id]": user.id,
      "metadata[order_id]": orderId,
      "metadata[columns]": String(priced.config.columns),
      "metadata[rows]": String(priced.config.rows),
      "metadata[base_width_mm]": String(priced.config.baseSize),
      "metadata[base_depth_mm]": String(priced.config.baseDepth),
      "metadata[outer_width_mm]": priced.outerWidth.toFixed(1),
      "metadata[outer_depth_mm]": priced.outerDepth.toFixed(1)
    });
    if (user.email) parameters.set("customer_email", user.email);
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
    await createPendingOrder({
      id: orderId,
      userId: user.id,
      sessionId: session.id,
      orderType: "printed_tray",
      amount: priced.amount,
      description: prefix,
      trayConfiguration: printable
    });
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
    const user = await authenticateUser(request);
    const orderId = randomUUID();
    const returnOrigin = checkoutReturnOrigin(request, origin);
    const parameters = new URLSearchParams({
      mode: "payment",
      success_url: `${returnOrigin}/?checkout=unlock-success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/?checkout=unlock-cancelled`,
      billing_address_collection: "required",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(unlimitedExportsPrice),
      "line_items[0][price_data][product_data][name]": "Unlimited STL exports",
      "line_items[0][price_data][product_data][description]": "One-off purchase for unlimited movement tray STL downloads",
      "line_items[0][quantity]": "1",
      "metadata[purchase_type]": "unlimited_stl",
      "metadata[user_id]": user.id,
      "metadata[order_id]": orderId
    });
    if (user.email) parameters.set("customer_email", user.email);
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
    await createPendingOrder({
      id: orderId,
      userId: user.id,
      sessionId: session.id,
      orderType: "unlimited_stl",
      amount: unlimitedExportsPrice,
      description: "Unlimited STL exports"
    });
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
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const sessionId = String(body.sessionId || "");
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid Stripe Checkout session.");
    const stripeResponse = await fetch(`${stripeApiBase}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${stripeKey}` }
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok) throw new Error(session.error?.message || "Stripe Checkout could not be verified.");
    if (session.payment_status !== "paid" || session.metadata?.purchase_type !== "unlimited_stl" || session.metadata?.user_id !== user.id) {
      return sendJson(response, 402, { error: "The unlimited STL purchase is not paid." }, origin);
    }
    await finalizeCheckoutSession(session);
    sendJson(response, 200, { unlocked: true }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.cause?.message || error.message || "Checkout verification failed." }, origin);
  }
}

async function checkUnlockStatus(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const rows = await supabaseAdmin(`entitlements?select=id&user_id=eq.${encodeURIComponent(user.id)}&entitlement_type=eq.unlimited_stl&revoked_at=is.null&limit=1`);
    sendJson(response, 200, { unlocked: Boolean(rows?.length) }, origin);
  } catch {
    sendJson(response, 200, { unlocked: false }, origin);
  }
}

async function accountExportStatus(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const [profiles, entitlements] = await Promise.all([
      supabaseAdmin(`profiles?select=free_export_used&user_id=eq.${encodeURIComponent(user.id)}&limit=1`),
      supabaseAdmin(`entitlements?select=id&user_id=eq.${encodeURIComponent(user.id)}&entitlement_type=eq.unlimited_stl&revoked_at=is.null&limit=1`)
    ]);
    sendJson(response, 200, {
      freeExportUsed: Boolean(profiles?.[0]?.free_export_used),
      unlimitedExports: Boolean(entitlements?.length)
    }, origin);
  } catch (error) {
    sendJson(response, 401, { error: error.message }, origin);
  }
}

async function useFreeExport(request, response) {
  const origin = checkoutOrigin(request);
  try {
    if (!downloadTokenSecret) throw new Error("STL download signing is not configured.");
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const config = printableTrayConfig(body.config || {});
    const name = String(body.name || "movement-tray").slice(0, 80);
    const claimed = await supabaseAdmin(`profiles?user_id=eq.${encodeURIComponent(user.id)}&free_export_used=eq.false`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ free_export_used: true, updated_at: new Date().toISOString() })
    });
    if (!claimed?.length) return sendJson(response, 409, { error: "The sponsored STL download has already been used." }, origin);
    sendJson(response, 200, { allowed: true, downloadToken: createFreeDownloadToken(user.id, config, name) }, origin);
  } catch (error) {
    sendJson(response, 401, { error: error.message }, origin);
  }
}

async function exportStlDownload(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const config = printableTrayConfig(body.config || {});
    const name = String(body.name || "movement-tray").slice(0, 80);
    const entitlements = await supabaseAdmin(`entitlements?select=id&user_id=eq.${encodeURIComponent(user.id)}&entitlement_type=eq.unlimited_stl&revoked_at=is.null&limit=1`);
    if (!entitlements?.length && !freeDownloadTokenValid(body.downloadToken, user.id, config, name)) {
      return sendJson(response, 402, { error: "STL download access is not available for this account." }, origin);
    }
    const stl = trayStlText(config);
    response.writeHead(200, {
      "Content-Type": "model/stl",
      "Content-Disposition": `attachment; filename="${safeTrayFileName(config, name)}"`,
      ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {})
    });
    response.end(stl);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "STL export failed." }, origin);
  }
}

async function exportAccountData(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const userFilter = encodeURIComponent(user.id);
    const [profiles, trays, armies, orders, entitlements, privacyRequests] = await Promise.all([
      supabaseAdmin(`profiles?select=*&user_id=eq.${userFilter}&limit=1`),
      supabaseAdmin(`tray_designs?select=*&user_id=eq.${userFilter}&order=updated_at.desc`),
      supabaseAdmin(`army_lists?select=*&user_id=eq.${userFilter}&order=updated_at.desc`),
      supabaseAdmin(`orders?select=*,order_items(*),order_customer_snapshots(*)&user_id=eq.${userFilter}&order=created_at.desc`),
      supabaseAdmin(`entitlements?select=*&user_id=eq.${userFilter}`),
      supabaseAdmin(`privacy_requests?select=id,request_type,status,requested_at,completed_at&user_id=eq.${userFilter}`)
    ]);
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      profile: profiles?.[0] || null,
      trayDesigns: trays || [],
      armyLists: armies || [],
      orders: orders || [],
      entitlements: entitlements || [],
      privacyRequests: privacyRequests || []
    }, origin);
  } catch (error) {
    sendJson(response, 401, { error: error.message }, origin);
  }
}

async function requestAccountDeletion(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    await supabaseAdmin("privacy_requests", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: user.id, email: user.email, request_type: "account_deletion" })
    });
    sendJson(response, 200, {
      requested: true,
      message: "Account deletion requested. Legally required order and VAT records will be retained for their required period."
    }, origin);
  } catch (error) {
    sendJson(response, 401, { error: error.message }, origin);
  }
}

async function createPendingOrder({ id, userId, sessionId, orderType, amount, description, trayConfiguration = null }) {
  await supabaseAdmin("orders", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      user_id: userId,
      order_type: orderType,
      status: "pending_payment",
      currency,
      total_inc_vat: amount,
      stripe_checkout_session_id: sessionId
    })
  });
  await supabaseAdmin("order_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      order_id: id,
      description,
      quantity: 1,
      total_inc_vat: amount,
      tray_configuration: trayConfiguration
    })
  });
}

async function finalizeCheckoutSession(session) {
  const orderId = session.metadata?.order_id;
  const userId = session.metadata?.user_id;
  if (!orderId || !userId || session.payment_status !== "paid") return;
  const paidAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  await supabaseAdmin(`orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "paid",
      stripe_payment_intent_id: session.payment_intent || null,
      total_inc_vat: session.amount_total,
      paid_at: paidAt,
      tax_point: paidAt,
      updated_at: new Date().toISOString()
    })
  });
  const billing = session.customer_details?.address || {};
  const shipping = session.shipping_details || session.collected_information?.shipping_details;
  const delivery = shipping?.address || billing;
  await supabaseAdmin("order_customer_snapshots?on_conflict=order_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      order_id: orderId,
      customer_name: session.customer_details?.name || shipping?.name || null,
      customer_email: session.customer_details?.email || null,
      billing_address: billing,
      delivery_address: delivery,
      country_code: delivery.country || billing.country || null
    })
  });
  if (session.metadata?.purchase_type === "unlimited_stl") {
    await supabaseAdmin("entitlements?on_conflict=user_id,entitlement_type", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        entitlement_type: "unlimited_stl",
        source_order_id: orderId,
        stripe_checkout_session_id: session.id,
        granted_at: new Date().toISOString(),
        revoked_at: null
      })
    });
  }
}

function stripeEventVerified(rawBody, signatureHeader) {
  if (!stripeWebhookSecret || !signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac("sha256", stripeWebhookSecret).update(`${parts.t}.${rawBody}`).digest();
  const received = Buffer.from(parts.v1, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function handleStripeWebhook(request, response) {
  try {
    const rawBody = await readBody(request);
    if (!stripeEventVerified(rawBody, request.headers["stripe-signature"])) return sendJson(response, 400, { error: "Invalid Stripe webhook signature." });
    const event = JSON.parse(rawBody);
    const existing = await supabaseAdmin(`stripe_events?select=stripe_event_id&stripe_event_id=eq.${encodeURIComponent(event.id)}&limit=1`);
    if (existing?.length) return sendJson(response, 200, { received: true });
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await finalizeCheckoutSession(event.data.object);
    }
    await supabaseAdmin("stripe_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ stripe_event_id: event.id, event_type: event.type })
    });
    sendJson(response, 200, { received: true });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Stripe webhook failed." });
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

  if (request.method === "GET" && pathname === "/api/app-config") {
    sendJson(response, 200, {
      supabaseUrl,
      supabasePublishableKey,
      accountsEnabled: supabaseReady()
    }, origin);
    return;
  }
  if (request.method === "POST" && pathname === "/api/stripe/webhook") {
    await handleStripeWebhook(request, response);
    return;
  }
  if (request.method === "OPTIONS" && (pathname.startsWith("/api/checkout") || pathname.startsWith("/api/account"))) {
    response.writeHead(204, {
      ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  if (request.method === "GET" && pathname === "/api/account/export-status") {
    await accountExportStatus(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/account/use-free-export") {
    await useFreeExport(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/account/export-stl") {
    await exportStlDownload(request, response);
    return;
  }
  if (request.method === "GET" && pathname === "/api/account/data-export") {
    await exportAccountData(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/account/deletion-request") {
    await requestAccountDeletion(request, response);
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
