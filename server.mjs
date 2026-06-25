import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { marketplacePolicy, publicPlatformConfig, resolvePlatformContext } from "./platform/registry.mjs";
import { assertPrintJobTransition } from "./platform/print-factory.mjs";
import { calibratedMaterialCm3, defaultPrintTimeModel, estimatedPrintHours, estimatedWeightGramsFromGeometry } from "./platform/print-estimates.mjs";
import { createStripeClient } from "./server/stripe-client.mjs";

const port = Number(process.env.PORT || 4173);
const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const allowLiveStripe = process.env.ALLOW_LIVE_STRIPE === "true";
const currency = (process.env.STRIPE_CURRENCY || "gbp").toLowerCase();
const basePrice = Number(process.env.PRINT_BASE_PRICE_PENCE || 800);
const pricePerCm3 = Number(process.env.PRINT_PRICE_PER_CM3_PENCE || 25);
const marketplacePlatformFeePence = Number(process.env.MARKETPLACE_PLATFORM_FEE_PENCE || 50);
const marketplaceCommissionPercent = Number(process.env.MARKETPLACE_COMMISSION_PERCENT || 10);
const marketplaceVatPercent = Number(process.env.MARKETPLACE_VAT_PERCENT || 20);
const marketplaceQuoteMinutes = Number(process.env.MARKETPLACE_QUOTE_MINUTES || 30);
const marketplaceIncludePending = process.env.MARKETPLACE_INCLUDE_PENDING === "true";
const plaCostPerGramPence = Number(process.env.PLA_COST_PER_GRAM_PENCE || 2);
const printAutoCompleteDays = Number(process.env.PRINT_AUTO_COMPLETE_DAYS || 14);
const printDeliveryFallbackDays = Number(process.env.PRINT_DELIVERY_FALLBACK_DAYS || 3);
const printConfirmationChaserDays = Number(process.env.PRINT_CONFIRMATION_CHASER_DAYS || 7);
const taskRunnerSecret = process.env.TASK_RUNNER_SECRET || "";
const unlimitedExportsPrice = Number(process.env.UNLIMITED_EXPORTS_PRICE_PENCE || 500);
const stripeApiBase = process.env.STRIPE_API_BASE || "https://api.stripe.com";
const stripeApiVersion = process.env.STRIPE_API_VERSION || "2026-05-27.dahlia";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const allowedCountries = (process.env.STRIPE_ALLOWED_COUNTRIES || "GB,US").split(",").map((country) => country.trim().toUpperCase()).filter(Boolean);
const allowedOrigins = (process.env.CHECKOUT_ALLOWED_ORIGIN || "https://forgetabout.im,https://watsonjohn-spec.github.io")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";
const hubAdminEmails = (process.env.HUB_ADMIN_EMAILS || "watson.john@live.co.uk")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const allowPrototypeSecretFallback = process.env.ALLOW_PROTOTYPE_SECRET_FALLBACK === "true";
const downloadTokenSecret = process.env.DOWNLOAD_TOKEN_SECRET || (allowPrototypeSecretFallback ? stripeKey : "");
const accountDeviceLimit = Number(process.env.ACCOUNT_DEVICE_LIMIT || 3);
const enforceAccountDeviceLimit = process.env.ENFORCE_ACCOUNT_DEVICE_LIMIT === "true";
const stlUploadBucket = process.env.STL_UPLOAD_BUCKET || "user-stl-uploads";
const stlUploadMaxBytes = Number(process.env.STL_UPLOAD_MAX_BYTES || 12_000_000);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};
const { stripeReady, stripeJson, stripeForm, stripeEventVerified } = createStripeClient({
  stripeKey,
  allowLiveStripe,
  stripeApiBase,
  stripeApiVersion,
  stripeWebhookSecret
});

const standardColours = [
  { key: "all", name: "All standard colours", hex: "#8b9499" },
  { key: "black", name: "Black", hex: "#202223" },
  { key: "white", name: "White", hex: "#f1f2ee" },
  { key: "grey", name: "Grey", hex: "#777c7d" },
  { key: "red", name: "Red", hex: "#b93636" },
  { key: "orange", name: "Orange", hex: "#e87524" },
  { key: "yellow", name: "Yellow", hex: "#f3c623" },
  { key: "green", name: "Green", hex: "#398052" },
  { key: "blue", name: "Blue", hex: "#32658c" },
  { key: "purple", name: "Purple", hex: "#6e4b8b" },
  { key: "pink", name: "Pink", hex: "#d98c9b" },
  { key: "rose-gold", name: "Rose Gold", hex: "#b76e79" },
  { key: "brown", name: "Brown", hex: "#6f4e37" }
];

const postageServices = [
  { key: "evri-standard", name: "Evri Standard 0-1kg", pricePence: 329, days: 3 },
  { key: "evri-next-day", name: "Evri Next Day 0-1kg", pricePence: 412, days: 1 },
  { key: "royal-mail-2nd", name: "Royal Mail 2nd Class small parcel", pricePence: 395, days: 3 },
  { key: "royal-mail-1st", name: "Royal Mail 1st Class small parcel", pricePence: 515, days: 1 }
];

function requestPlatformContext(request, body = {}) {
  return resolvePlatformContext({
    brandKey: body.brandKey || request.headers["x-forget-about-brand"] || "tray",
    generatorType: body.generatorType || request.headers["x-forget-about-generator"] || undefined
  });
}

function priceGeneratedDesign(generator, input) {
  const geometry = generator.buildGeometry(input);
  const uploaded = Boolean(geometry.config?.stlBase64 || Number.isFinite(Number(geometry.config?.estimatedWeightGrams)));
  const materialCm3 = calibratedMaterialCm3(Number(geometry.printMaterialCm3 ?? geometry.materialCm3 ?? 0), { uploaded });
  const amount = Math.max(50, Math.round(basePrice + materialCm3 * pricePerCm3));
  return { ...geometry, amount };
}

function geometryEnvelope(geometry) {
  const width = Math.max(Number(geometry.outerWidth || 0), ...geometry.boxes.map((box) => Number(box.x) + Number(box.w)));
  const depth = Math.max(Number(geometry.outerDepth || 0), ...geometry.boxes.map((box) => Number(box.y) + Number(box.d)));
  const height = Math.max(0, ...geometry.boxes.map((box) => Number(box.z) + Number(box.h)));
  return { width, depth, height };
}

function publicQuote(row, profile, capability) {
  return {
    id: row.id,
    printerProfileId: row.printer_profile_id,
    providerName: profile.display_name,
    description: profile.description || "",
    basedIn: profile.based_in,
    postcodeArea: profile.postcode_area,
    providerStatus: profile.status,
    acceptingJobs: profile.accepting_jobs,
    ratingAverage: Number(profile.rating_average || 0),
    ratingCount: Number(profile.rating_count || 0),
    leadTimeDays: Number(row.lead_time_days),
    colourKey: row.colour_key,
    colourName: capability.colour_name,
    colourHex: capability.colour_hex,
    material: row.material,
    estimatedWeightGrams: Number(row.estimated_weight_grams || row.design_snapshot?.estimatedWeightGrams || 0),
    estimatedPrintHours: Number(row.estimated_print_hours || row.design_snapshot?.estimatedPrintHours || 0),
    handlingDays: Number(row.handling_days || profile.lead_time_days || 0),
    postageService: row.postage_service || capability.postage_service || "",
    postageDays: Number(row.postage_days || capability.postage_days || 0),
    materialCostPence: Number(row.material_cost_pence || 0),
    printerFeePence: Number(row.printer_fee_pence || capability.base_price_pence || 0),
    commissionPence: Number(row.commission_pence || 0),
    productionPricePence: Number(row.production_price_pence),
    postagePence: Number(row.postage_pence),
    platformFeePence: Number(row.platform_fee_pence),
    vatAmountPence: Number(row.vat_amount_pence),
    totalIncVatPence: Number(row.total_inc_vat_pence),
    providerSharePence: Number(row.provider_share_pence),
    currency: row.currency,
    expiresAt: row.expires_at
  };
}

function sendJson(response, status, body, origin = "") {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {})
  });
  response.end(JSON.stringify(body));
}

function checkoutOriginAllowed(request) {
  const requestOrigin = String(request.headers.origin || "").replace(/\/$/, "");
  if (!requestOrigin) return true;
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const serviceOrigin = `${protocol}://${request.headers.host}`.replace(/\/$/, "");
  return requestOrigin === serviceOrigin || allowedOrigins.includes(requestOrigin);
}

function checkoutOrigin(request) {
  return checkoutOriginAllowed(request) ? request.headers.origin || "" : "";
}

async function readBody(request, maximumBytes = 1_000_000) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maximumBytes) throw new Error("Request too large");
  }
  return body;
}

async function readJson(request, maximumBytes) {
  return JSON.parse((await readBody(request, maximumBytes)) || "{}");
}

function downloadFingerprint(config, name, brandKey = "tray", generatorType = "movement_tray") {
  return createHmac("sha256", downloadTokenSecret).update(JSON.stringify({ brandKey, generatorType, config, name })).digest("base64url");
}

function createFreeDownloadToken(userId, config, name, brandKey = "tray", generatorType = "movement_tray") {
  const payload = Buffer.from(JSON.stringify({ userId, fingerprint: downloadFingerprint(config, name, brandKey, generatorType), expiresAt: Date.now() + 5 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", downloadTokenSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function freeDownloadTokenValid(token, userId, config, name, brandKey = "tray", generatorType = "movement_tray") {
  if (!downloadTokenSecret || typeof token !== "string") return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", downloadTokenSecret).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, "base64url");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed.userId !== userId || parsed.expiresAt < Date.now() || parsed.fingerprint !== downloadFingerprint(config, name, brandKey, generatorType)) return false;
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
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
  await trackAccountDevice(user.id, request.headers["x-forget-about-device"]);
  return user;
}

async function authenticateHubAdmin(request) {
  const user = await authenticateUser(request);
  if (!hubAdminEmails.includes(String(user.email || "").toLowerCase())) {
    const error = new Error("Hub access is restricted to approved administrators.");
    error.status = 403;
    throw error;
  }
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

function safeStorageFileName(name) {
  const base = cleanText(name || "uploaded-model.stl", 120)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "uploaded-model.stl";
  return base.toLowerCase().endsWith(".stl") ? base : `${base}.stl`;
}

function encodeStoragePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function storageObjectUrl(path) {
  return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(stlUploadBucket)}/${encodeStoragePath(path)}`;
}

function stlUploadBytes(value) {
  const raw = String(value || "").replace(/^data:[^;]+;base64,/i, "");
  const bytes = Buffer.from(raw, "base64");
  if (!raw || bytes.length === 0) throw new Error("Upload an STL file before saving.");
  if (bytes.length > stlUploadMaxBytes) throw new Error(`STL uploads are limited to ${Math.round(stlUploadMaxBytes / 1_000_000)}MB.`);
  return bytes;
}

async function storageRequest(path, options = {}) {
  if (!supabaseReady()) throw new Error("Account service is not configured.");
  return fetch(storageObjectUrl(path), {
    ...options,
    headers: {
      apikey: supabaseSecretKey,
      Authorization: `Bearer ${supabaseSecretKey}`,
      ...(options.headers || {})
    }
  });
}

async function optionalSupabaseAdmin(path, options = {}) {
  try {
    return await supabaseAdmin(path, options);
  } catch {
    return [];
  }
}

function cleanText(value, maximum = 500) {
  return String(value || "").trim().slice(0, maximum);
}

function cleanEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function publicReturnPath(path) {
  const cleanPath = String(path || "").replace(/\/$/, "");
  if (cleanPath === "/tray") return "/trays";
  if (cleanPath.startsWith("/tray/")) return cleanPath.replace(/^\/tray\b/, "/trays");
  return cleanPath;
}

function cleanPositiveInteger(value, fallback, maximum = 100_000) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum ? number : fallback;
}

async function handleLaunchSignup(request, response) {
  const origin = checkoutOrigin(request);
  if (!checkoutOriginAllowed(request)) return sendJson(response, 403, { error: "Origin is not allowed." });
  try {
    const body = await readJson(request, 10_000);
    const firstName = cleanText(body.firstName, 80);
    const secondName = cleanText(body.secondName, 80);
    const email = cleanEmail(body.email);
    const sourcePath = publicReturnPath(body.sourcePath || request.headers["x-forget-about-path"] || "/") || "/";
    if (!firstName || !secondName || !validEmail(email)) throw new Error("Enter a first name, second name, and valid email address.");
    await supabaseAdmin("launch_signups?on_conflict=email", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        first_name: firstName,
        second_name: secondName,
        email,
        source_path: sourcePath,
        analytics_consent: Boolean(body.analyticsConsent),
        updated_at: new Date().toISOString()
      })
    });
    sendJson(response, 200, { ok: true, message: "You're on the launch list." }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Launch signup failed." }, origin);
  }
}

async function loadPrinterProfile(userId) {
  const profiles = await supabaseAdmin(`printer_profiles?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  return profiles?.[0] || null;
}

async function factoryDashboard(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const profile = await loadPrinterProfile(user.id);
    if (!profile) return sendJson(response, 200, { account: { email: user.email }, profile: null, capabilities: [], jobs: [], transfers: [], paymentAccount: null }, origin);
    const profileId = encodeURIComponent(profile.id);
    const [capabilities, jobs, transfers, paymentAccounts] = await Promise.all([
      supabaseAdmin(`printer_capabilities?select=*&printer_profile_id=eq.${profileId}&order=colour_name.asc`),
      supabaseAdmin(`print_jobs?select=*,print_job_events(*),print_quotes(*),orders(*,order_items(*),order_customer_snapshots(*))&printer_profile_id=eq.${profileId}&status=neq.pending_payment&order=created_at.desc`),
      supabaseAdmin(`provider_transfers?select=*&printer_profile_id=eq.${profileId}&order=created_at.desc`),
      supabaseAdmin(`printer_payment_accounts?select=charges_enabled,transfers_enabled,onboarding_complete,updated_at&printer_profile_id=eq.${profileId}&limit=1`)
    ]);
    sendJson(response, 200, {
      account: { email: user.email },
      profile,
      capabilities: capabilities || [],
      jobs: jobs || [],
      transfers: transfers || [],
      paymentAccount: paymentAccounts?.[0] || null
    }, origin);
  } catch (error) {
    sendJson(response, 401, { error: error.message }, origin);
  }
}

function countBy(rows, accessor) {
  return rows.reduce((counts, row) => {
    const key = accessor(row) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sumPence(rows, accessor) {
  return rows.reduce((total, row) => total + Number(accessor(row) || 0), 0);
}

function orderLocation(order) {
  const snapshot = nestedRow(order.order_customer_snapshots);
  const address = snapshot?.shipping_address || snapshot?.billing_address || {};
  return cleanText(address.city || address.postcode || address.country || "Unknown", 80) || "Unknown";
}

function hubProfileSummary(profile, capabilities, paymentAccounts) {
  const ownedCapabilities = capabilities.filter((capability) => capability.printer_profile_id === profile.id);
  const paymentAccount = paymentAccounts.find((account) => account.printer_profile_id === profile.id) || null;
  return {
    ...profile,
    capability_count: ownedCapabilities.length,
    active_capability_count: ownedCapabilities.filter((capability) => capability.active !== false).length,
    payment_account: paymentAccount
      ? {
          onboarding_complete: Boolean(paymentAccount.onboarding_complete),
          charges_enabled: Boolean(paymentAccount.charges_enabled),
          transfers_enabled: Boolean(paymentAccount.transfers_enabled)
        }
      : null
  };
}

async function hubDashboard(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateHubAdmin(request);
    const [orders, printJobs, profiles, capabilities, paymentAccounts, transfers, launchRows, privacyRows, emailRows] = await Promise.all([
      supabaseAdmin("orders?select=*,order_items(*),order_customer_snapshots(*),print_jobs(*,print_job_events(*),print_quotes(*))&order=created_at.desc&limit=100"),
      supabaseAdmin("print_jobs?select=*,print_quotes(*),orders(*,order_customer_snapshots(*))&order=created_at.desc&limit=100"),
      supabaseAdmin("printer_profiles?select=*&order=created_at.desc"),
      supabaseAdmin("printer_capabilities?select=*&order=created_at.desc"),
      optionalSupabaseAdmin("printer_payment_accounts?select=*&order=updated_at.desc"),
      optionalSupabaseAdmin("provider_transfers?select=*&order=created_at.desc&limit=100"),
      optionalSupabaseAdmin("launch_signups?select=*&order=created_at.desc&limit=100"),
      optionalSupabaseAdmin("privacy_requests?select=*&order=requested_at.desc&limit=100"),
      optionalSupabaseAdmin("email_outbox?select=*&order=created_at.desc&limit=100")
    ]);
    const safeOrders = orders || [];
    const safeJobs = printJobs || [];
    const safeProfiles = profiles || [];
    const safeCapabilities = capabilities || [];
    const safeTransfers = transfers || [];
    const providerSummaries = safeProfiles.map((profile) => hubProfileSummary(profile, safeCapabilities, paymentAccounts || []));
    sendJson(response, 200, {
      admin: { email: user.email },
      metrics: {
        totalOrders: safeOrders.length,
        paidOrders: safeOrders.filter((order) => order.paid_at || ["paid", "order_made", "producing", "posted", "complete"].includes(order.status)).length,
        grossPence: sumPence(safeOrders, (order) => order.total_inc_vat),
        heldPayoutPence: sumPence(safeTransfers.filter((transfer) => transfer.status === "held" || transfer.payout_status === "held"), (transfer) => transfer.amount_pence),
        pendingProviderProfiles: providerSummaries.filter((profile) => profile.status === "pending_review").length,
        activeProviderProfiles: providerSummaries.filter((profile) => profile.status === "active").length,
        activeJobs: safeJobs.filter((job) => !["complete", "cancelled", "refunded"].includes(job.status)).length,
        launchSignups: (launchRows || []).length,
        privacyRequests: (privacyRows || []).filter((requestRow) => requestRow.status !== "completed").length,
        queuedEmails: (emailRows || []).filter((email) => !email.sent_at && email.status !== "sent").length
      },
      breakdowns: {
        ordersByStatus: countBy(safeOrders, (order) => order.status),
        ordersByBrand: countBy(safeOrders, (order) => order.brand_key),
        ordersByLocation: countBy(safeOrders, orderLocation),
        jobsByStatus: countBy(safeJobs, (job) => job.status)
      },
      providerProfiles: providerSummaries,
      pendingProfiles: providerSummaries.filter((profile) => profile.status === "pending_review"),
      recentOrders: safeOrders.slice(0, 25),
      recentJobs: safeJobs.slice(0, 25),
      launchSignups: (launchRows || []).slice(0, 25),
      privacyRequests: (privacyRows || []).slice(0, 25)
    }, origin);
  } catch (error) {
    sendJson(response, error.status || 401, { error: error.message || "Hub dashboard could not be loaded." }, origin);
  }
}

async function updateHubPrinterProfile(request, response, profileId) {
  const origin = checkoutOrigin(request);
  try {
    await authenticateHubAdmin(request);
    const body = await readJson(request, 20_000);
    const status = cleanText(body.status, 40);
    if (!["pending_review", "active", "paused", "suspended"].includes(status)) throw new Error("Choose a valid provider status.");
    const update = {
      status,
      accepting_jobs: Object.hasOwn(body, "acceptingJobs") ? Boolean(body.acceptingJobs) : status === "active",
      updated_at: new Date().toISOString()
    };
    if (status !== "active" && !Object.hasOwn(body, "acceptingJobs")) update.accepting_jobs = false;
    const saved = await supabaseAdmin(`printer_profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(update)
    });
    if (!saved?.length) throw new Error("Provider profile was not found.");
    sendJson(response, 200, { profile: saved[0] }, origin);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || "Provider profile could not be updated." }, origin);
  }
}

async function accountOrders(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const { brand } = requestPlatformContext(request);
    const rows = await supabaseAdmin(`orders?select=*,order_items(*),order_customer_snapshots(*),print_jobs(*,print_job_events(*),print_quotes(*))&user_id=eq.${encodeURIComponent(user.id)}&brand_key=eq.${encodeURIComponent(brand.key)}&order=created_at.desc`);
    sendJson(response, 200, rows || [], origin);
  } catch (error) {
    sendJson(response, 401, { error: error.message || "Orders could not be loaded." }, origin);
  }
}

async function uploadAccountStl(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const uploadBodyLimit = Math.ceil(stlUploadMaxBytes * 1.45) + 4096;
    const body = await readJson(request, uploadBodyLimit);
    const bytes = stlUploadBytes(body.stlBase64);
    const fileName = safeStorageFileName(body.fileName);
    const path = `${user.id}/${Date.now()}-${randomUUID()}-${fileName}`;
    const storageResponse = await storageRequest(path, {
      method: "PUT",
      headers: {
        "Content-Type": "model/stl",
        "Cache-Control": "private, max-age=31536000",
        "x-upsert": "false"
      },
      body: bytes
    });
    if (!storageResponse.ok) {
      const detail = await storageResponse.json().catch(async () => ({ message: await storageResponse.text().catch(() => "") }));
      throw new Error(detail?.message || detail?.error || `Supabase Storage upload failed. Check bucket ${stlUploadBucket} exists.`);
    }
    sendJson(response, 200, {
      storageProvider: "supabase-storage",
      bucket: stlUploadBucket,
      path,
      fileName,
      sizeBytes: bytes.length,
      contentType: "model/stl"
    }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "STL upload failed." }, origin);
  }
}

async function downloadAccountStl(request, response, requestUrl) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const path = cleanText(requestUrl.searchParams.get("path"), 500);
    if (!path || !path.startsWith(`${user.id}/`)) {
      response.writeHead(403, {
        "Content-Type": "application/json; charset=utf-8",
        ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {})
      });
      response.end(JSON.stringify({ error: "Stored STL not found for this account." }));
      return;
    }
    const storageResponse = await storageRequest(path);
    if (!storageResponse.ok) throw new Error("Stored STL could not be loaded.");
    const bytes = Buffer.from(await storageResponse.arrayBuffer());
    response.writeHead(200, {
      "Content-Type": storageResponse.headers.get("content-type") || "model/stl",
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {})
    });
    response.end(bytes);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "STL download failed." }, origin);
  }
}

function recipientAccountReady(account) {
  const recipient = account.configuration?.recipient;
  const capabilities = recipient?.capabilities?.stripe_balance || {};
  const transfers = capabilities.stripe_transfers?.status === "active";
  const payouts = capabilities.payouts?.status === "active";
  return { transfers, payouts, onboardingComplete: transfers && payouts };
}

async function syncPrinterPaymentAccount(profile) {
  const rows = await supabaseAdmin(`printer_payment_accounts?select=*&printer_profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
  const paymentAccount = rows?.[0];
  if (!paymentAccount) return null;
  const account = await stripeJson(`/v2/core/accounts/${encodeURIComponent(paymentAccount.stripe_connected_account_id)}?include[0]=configuration.recipient&include[1]=requirements`);
  const ready = recipientAccountReady(account);
  const saved = await supabaseAdmin(`printer_payment_accounts?printer_profile_id=eq.${encodeURIComponent(profile.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      charges_enabled: false,
      transfers_enabled: ready.transfers,
      onboarding_complete: ready.onboardingComplete,
      updated_at: new Date().toISOString()
    })
  });
  return { paymentAccount: saved?.[0] || paymentAccount, account };
}

async function startFactoryConnect(request, response) {
  const origin = checkoutOrigin(request);
  const readiness = stripeReady();
  if (!readiness.ready) return sendJson(response, 503, { error: readiness.reason }, origin);
  try {
    const user = await authenticateUser(request);
    const profile = await loadPrinterProfile(user.id);
    if (!profile) throw new Error("Create your provider profile before starting Stripe onboarding.");
    let paymentAccounts = await supabaseAdmin(`printer_payment_accounts?select=*&printer_profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
    let paymentAccount = paymentAccounts?.[0];
    if (!paymentAccount) {
      const account = await stripeJson("/v2/core/accounts", {
        method: "POST",
        headers: { "Idempotency-Key": `printer-profile-${profile.id}` },
        body: JSON.stringify({
          contact_email: user.email,
          display_name: profile.display_name,
          dashboard: "express",
          identity: { country: "gb", entity_type: "individual" },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true }
                }
              }
            }
          },
          defaults: {
            currency,
            locales: ["en-GB"],
            responsibilities: {
              fees_collector: "application",
              losses_collector: "application"
            }
          },
          include: ["configuration.recipient", "requirements", "identity", "defaults"]
        })
      });
      const ready = recipientAccountReady(account);
      paymentAccounts = await supabaseAdmin("printer_payment_accounts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          printer_profile_id: profile.id,
          stripe_connected_account_id: account.id,
          charges_enabled: false,
          transfers_enabled: ready.transfers,
          onboarding_complete: ready.onboardingComplete
        })
      });
      paymentAccount = paymentAccounts?.[0];
    }
    if (paymentAccount.onboarding_complete) {
      const login = await stripeForm(`/v1/accounts/${encodeURIComponent(paymentAccount.stripe_connected_account_id)}/login_links`, new URLSearchParams());
      return sendJson(response, 200, { url: login.url, mode: "dashboard" }, origin);
    }
    const returnOrigin = checkoutReturnOrigin(request, origin);
    const factoryReturnOrigin = returnOrigin.endsWith("/factory") ? returnOrigin : `${returnOrigin}/factory`;
    const onboarding = await stripeForm("/v1/account_links", new URLSearchParams({
      account: paymentAccount.stripe_connected_account_id,
      refresh_url: `${factoryReturnOrigin}/?connect=refresh`,
      return_url: `${factoryReturnOrigin}/?connect=return`,
      type: "account_onboarding",
      "collection_options[fields]": "eventually_due"
    }));
    sendJson(response, 200, { url: onboarding.url, mode: "onboarding" }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Stripe Connect onboarding could not be started." }, origin);
  }
}

async function factoryConnectStatus(request, response) {
  const origin = checkoutOrigin(request);
  const readiness = stripeReady();
  if (!readiness.ready) return sendJson(response, 503, { error: readiness.reason }, origin);
  try {
    const user = await authenticateUser(request);
    const profile = await loadPrinterProfile(user.id);
    if (!profile) throw new Error("Create your provider profile first.");
    const result = await syncPrinterPaymentAccount(profile);
    sendJson(response, 200, {
      connected: Boolean(result),
      paymentAccount: result?.paymentAccount || null,
      requirements: result?.account?.requirements || null
    }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Stripe Connect status could not be refreshed." }, origin);
  }
}

async function releaseProviderTransfer(job) {
  if (job.status !== "complete" || job.payout_status !== "held") return { released: false, reason: "not_eligible" };
  const paymentAccounts = await supabaseAdmin(`printer_payment_accounts?select=*&printer_profile_id=eq.${encodeURIComponent(job.printer_profile_id)}&limit=1`);
  const paymentAccount = paymentAccounts?.[0];
  if (!paymentAccount?.transfers_enabled) return { released: false, reason: "connect_not_ready" };
  const transferRecord = {
    print_job_id: job.id,
    printer_profile_id: job.printer_profile_id,
    amount_pence: job.provider_share_pence,
    currency,
    status: "held",
    updated_at: new Date().toISOString()
  };
  await supabaseAdmin("provider_transfers?on_conflict=print_job_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(transferRecord)
  });
  try {
    const parameters = new URLSearchParams({
      amount: String(job.provider_share_pence),
      currency,
      destination: paymentAccount.stripe_connected_account_id,
      transfer_group: `PRINT_JOB_${job.id}`,
      description: `Print job ${job.id}`,
      "metadata[print_job_id]": job.id
    });
    const transfer = await stripeForm("/v1/transfers", parameters, { headers: { "Idempotency-Key": `print-job-transfer-${job.id}` } });
    await Promise.all([
      supabaseAdmin(`provider_transfers?print_job_id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ stripe_transfer_id: transfer.id, status: "transferred", transferred_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      }),
      supabaseAdmin(`print_jobs?id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ payout_status: "transferred", updated_at: new Date().toISOString() })
      })
    ]);
    return { released: true, transferId: transfer.id };
  } catch (error) {
    await supabaseAdmin(`provider_transfers?print_job_id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed", updated_at: new Date().toISOString() })
    });
    return { released: false, reason: "stripe_transfer_failed", error: error.message };
  }
}

async function createPrintJobEvent(event) {
  const payload = {
    print_job_id: event.printJobId,
    actor_user_id: event.actorUserId || null,
    from_status: event.fromStatus || null,
    to_status: event.toStatus,
    note: event.note || null,
    event_type: event.eventType || "status"
  };
  try {
    await supabaseAdmin("print_job_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload)
    });
  } catch {
    const { event_type, ...legacyPayload } = payload;
    await supabaseAdmin("print_job_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(legacyPayload)
    });
  }
}

function oneDayMs() {
  return 24 * 60 * 60 * 1000;
}

function nestedRow(value) {
  return Array.isArray(value) ? value[0] : value;
}

function jobPostageDays(job) {
  const quote = nestedRow(job.print_quotes);
  const snapshotDays = job.design_snapshot?.fulfillment?.postageDays;
  const days = Number(quote?.postage_days || snapshotDays || printDeliveryFallbackDays);
  return Number.isFinite(days) && days > 0 ? days : printDeliveryFallbackDays;
}

function expectedDeliveryDate(job) {
  if (!job.posted_at) return null;
  return new Date(new Date(job.posted_at).getTime() + jobPostageDays(job) * oneDayMs());
}

function autoCompleteAfterDate(job) {
  const expected = expectedDeliveryDate(job);
  if (!expected) return null;
  return new Date(expected.getTime() + printConfirmationChaserDays * oneDayMs());
}

function customerSnapshot(job) {
  const order = nestedRow(job.orders);
  return nestedRow(order?.order_customer_snapshots);
}

function customerEmailForJob(job) {
  return cleanText(customerSnapshot(job)?.customer_email || job.design_snapshot?.customerEmail || "", 320);
}

function deliveryChaserEvents(job) {
  return (Array.isArray(job.print_job_events) ? job.print_job_events : [])
    .filter((event) => event.event_type === "delivery_chaser")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

async function queueEmailOutbox(row) {
  const saved = await supabaseAdmin("email_outbox", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: row.userId || null,
      print_job_id: row.printJobId || null,
      recipient_email: row.recipientEmail,
      email_type: row.emailType,
      subject: row.subject,
      body_text: row.bodyText,
      status: "queued"
    })
  });
  return saved?.[0] || null;
}

async function sendDeliveryConfirmationChaser(job, chaserNumber) {
  const recipientEmail = customerEmailForJob(job);
  if (!recipientEmail) throw new Error("Buyer email is missing, so a confirmation chaser cannot be sent.");
  const expected = expectedDeliveryDate(job);
  const releaseAt = autoCompleteAfterDate(job);
  const expectedLabel = expected ? expected.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }) : "the expected delivery date";
  const releaseLabel = releaseAt ? releaseAt.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }) : "the final reminder date";
  const name = cleanText(job.design_snapshot?.name || "your print order", 120);
  const subject = `Please confirm delivery for ${name}`;
  const bodyText = [
    `Your Forget About print order "${name}" was expected to arrive by ${expectedLabel}.`,
    "Please confirm receipt in your account order history, or reply/escalate if it has not arrived or there is a problem.",
    `This is reminder ${chaserNumber} of ${printConfirmationChaserDays}. If we do not receive confirmation or an escalation, the order will be marked complete and the printer payout released after ${releaseLabel}.`
  ].join("\n\n");
  const email = await queueEmailOutbox({
    userId: job.customer_user_id,
    printJobId: job.id,
    recipientEmail,
    emailType: "delivery_confirmation_chaser",
    subject,
    bodyText
  });
  await createPrintJobEvent({
    printJobId: job.id,
    fromStatus: job.status,
    toStatus: job.status,
    note: `Delivery confirmation chaser ${chaserNumber}/${printConfirmationChaserDays} queued for ${recipientEmail}.`,
    eventType: "delivery_chaser"
  });
  return { jobId: job.id, emailId: email?.id || null, chaserNumber };
}

async function updateProviderRating(printerProfileId) {
  const rows = await supabaseAdmin(`provider_reviews?select=rating&printer_profile_id=eq.${encodeURIComponent(printerProfileId)}`);
  const count = rows?.length || 0;
  const average = count ? rows.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count : 0;
  await supabaseAdmin(`printer_profiles?id=eq.${encodeURIComponent(printerProfileId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ rating_average: Number(average.toFixed(2)), rating_count: count, updated_at: new Date().toISOString() })
  });
}

async function completePrintJob(job, { actorUserId = null, note = "Customer confirmed delivery.", rating = null, reviewText = "", automatic = false } = {}) {
  assertPrintJobTransition(job.status, "complete");
  if (!automatic) {
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      throw new Error("Choose a rating from 1 to 5 before confirming delivery.");
    }
  }
  const completedAt = new Date().toISOString();
  const saved = await supabaseAdmin(`print_jobs?id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "complete", completed_at: completedAt, updated_at: completedAt })
  });
  if (!automatic) {
    await supabaseAdmin("provider_reviews?on_conflict=print_job_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        print_job_id: job.id,
        customer_user_id: job.customer_user_id,
        printer_profile_id: job.printer_profile_id,
        rating: Number(rating),
        review_text: cleanText(reviewText, 800) || null
      })
    });
    await updateProviderRating(job.printer_profile_id);
  }
  await createPrintJobEvent({
    printJobId: job.id,
    actorUserId,
    fromStatus: job.status,
    toStatus: "complete",
    note,
    eventType: automatic ? "auto_complete" : "status"
  });
  const completedJob = saved?.[0] || { ...job, status: "complete", completed_at: completedAt };
  const transfer = await releaseProviderTransfer(completedJob);
  return { job: completedJob, transfer };
}

async function autoCompleteStalePostedJobs() {
  if (!Number.isFinite(printConfirmationChaserDays) || printConfirmationChaserDays <= 0) return { completed: [], chasers: [] };
  const jobs = await optionalSupabaseAdmin("print_jobs?select=*,print_quotes(*),orders(*,order_customer_snapshots(*)),print_job_events(*)&status=eq.posted&payout_status=eq.held&order=posted_at.asc&limit=50");
  const completed = [];
  const chasers = [];
  const now = Date.now();
  for (const job of jobs || []) {
    try {
      const expectedDelivery = expectedDeliveryDate(job);
      if (!expectedDelivery || now < expectedDelivery.getTime()) continue;
      const chaserEvents = deliveryChaserEvents(job);
      const escalated = (Array.isArray(job.print_job_events) ? job.print_job_events : []).some((event) => event.event_type === "customer_escalation");
      if (escalated) continue;
      const lastChaserAt = chaserEvents.at(-1)?.created_at ? new Date(chaserEvents.at(-1).created_at).getTime() : 0;
      const releaseAt = autoCompleteAfterDate(job);
      if (chaserEvents.length >= printConfirmationChaserDays && releaseAt && now >= releaseAt.getTime()) {
        completed.push(await completePrintJob(job, {
          automatic: true,
          note: `Automatically completed after expected delivery and ${printConfirmationChaserDays} daily buyer confirmation chasers without confirmation or escalation.`
        }));
        continue;
      }
      if (chaserEvents.length < printConfirmationChaserDays && (!lastChaserAt || now - lastChaserAt >= oneDayMs())) {
        chasers.push(await sendDeliveryConfirmationChaser(job, chaserEvents.length + 1));
      }
    } catch {
      // A failed auto-release should not break ordinary dashboard or account loading.
    }
  }
  return { completed, chasers };
}

function taskSecretMatches(value) {
  const provided = Buffer.from(String(value || ""));
  const expected = Buffer.from(taskRunnerSecret);
  return Boolean(taskRunnerSecret) && provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function runAutoCompleteTask(request, response) {
  if (!taskRunnerSecret) return sendJson(response, 503, { error: "Scheduled task secret is not configured." });
  const authorization = String(request.headers.authorization || "");
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const headerSecret = request.headers["x-forget-about-task-secret"];
  if (!taskSecretMatches(bearer || headerSecret)) return sendJson(response, 403, { error: "Scheduled task is not authorized." });
  try {
    const { completed, chasers } = await autoCompleteStalePostedJobs();
    sendJson(response, 200, {
      completed: completed.length,
      chasers: chasers.length,
      chaserResults: chasers,
      results: completed.map((result) => ({
        jobId: result.job?.id,
        transferReleased: Boolean(result.transfer?.released),
        transferReason: result.transfer?.reason || ""
      }))
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Scheduled task failed." });
  }
}

async function completeCustomerPrintJob(request, response, jobId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const jobs = await supabaseAdmin(`print_jobs?select=*&id=eq.${encodeURIComponent(jobId)}&customer_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const job = jobs?.[0];
    if (!job) throw new Error("Print job not found.");
    const result = await completePrintJob(job, {
      actorUserId: user.id,
      rating: body.rating,
      reviewText: body.reviewText,
      note: `Customer confirmed delivery with a ${Number(body.rating)} / 5 rating.`
    });
    sendJson(response, 200, result, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Print job could not be completed." }, origin);
  }
}

async function saveFactoryProfile(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const profile = await loadPrinterProfile(user.id);
    const editable = {
      display_name: cleanText(body.displayName, 80),
      description: cleanText(body.description, 800) || null,
      based_in: cleanText(body.basedIn, 120),
      postcode_area: cleanText(body.postcodeArea, 12).toUpperCase(),
      lead_time_days: cleanPositiveInteger(body.leadTimeDays, 7, 90),
      accepting_jobs: Boolean(body.acceptingJobs),
      updated_at: new Date().toISOString()
    };
    if (!editable.display_name || !editable.based_in || !editable.postcode_area || editable.lead_time_days < 1) {
      throw new Error("Display name, UK location, postcode area, and lead time are required.");
    }
    let saved;
    if (profile) {
      saved = await supabaseAdmin(`printer_profiles?id=eq.${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(editable)
      });
    } else {
      saved = await supabaseAdmin("printer_profiles", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ ...editable, user_id: user.id, status: "pending_review", accepting_jobs: false })
      });
    }
    sendJson(response, 200, { profile: saved?.[0] || null }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Printer profile could not be saved." }, origin);
  }
}

async function addFactoryCapability(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const profile = await loadPrinterProfile(user.id);
    if (!profile) throw new Error("Create your printer profile first.");
    const body = await readJson(request);
    const material = cleanText(body.material, 20).toLowerCase();
    const selectedColour = standardColours.find((colour) => colour.key === cleanText(body.colourKey, 80));
    const colourName = selectedColour?.name || "";
    const colourKey = selectedColour?.key || "";
    const postage = postageServices.find((service) => service.key === cleanText(body.postageService, 80));
    if (!["pla", "petg", "abs"].includes(material) || !colourName || !colourKey) throw new Error("Choose PLA, PETG, or ABS and provide a colour.");
    if (!postage) throw new Error("Choose a standard postage service.");
    const capability = {
      printer_profile_id: profile.id,
      process: "fdm",
      material,
      colour_key: colourKey,
      colour_name: colourName,
      colour_hex: selectedColour.hex,
      max_width_mm: cleanPositiveInteger(body.maxWidthMm, 256, 1000),
      max_depth_mm: cleanPositiveInteger(body.maxDepthMm, 256, 1000),
      max_height_mm: cleanPositiveInteger(body.maxHeightMm, 256, 1000),
      base_price_pence: cleanPositiveInteger(body.basePricePence, 0),
      price_per_cm3_pence: plaCostPerGramPence,
      grams_per_hour: cleanPositiveInteger(body.gramsPerHour, defaultPrintTimeModel.gramsPerHour, 1000),
      postage_service: postage.key,
      postage_days: postage.days,
      postage_pence: postage.pricePence,
      active: true
    };
    const saved = await supabaseAdmin("printer_capabilities?on_conflict=printer_profile_id,process,material,colour_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(capability)
    });
    sendJson(response, 200, { capability: saved?.[0] || null }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Printer capability could not be saved." }, origin);
  }
}

async function removeFactoryCapability(request, response, capabilityId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const profile = await loadPrinterProfile(user.id);
    if (!profile) throw new Error("Printer profile not found.");
    await supabaseAdmin(`printer_capabilities?id=eq.${encodeURIComponent(capabilityId)}&printer_profile_id=eq.${encodeURIComponent(profile.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    sendJson(response, 200, { deleted: true }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Printer capability could not be removed." }, origin);
  }
}

async function updateFactoryJob(request, response, jobId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const profile = await loadPrinterProfile(user.id);
    if (!profile) throw new Error("Printer profile not found.");
    const jobs = await supabaseAdmin(`print_jobs?select=*&id=eq.${encodeURIComponent(jobId)}&printer_profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
    const job = jobs?.[0];
    if (!job) throw new Error("Print job not found.");
    const body = await readJson(request);
    const nextStatus = cleanText(body.status, 30);
    if (!["producing", "posted"].includes(nextStatus)) throw new Error("Printers can only mark jobs as producing or posted.");
    const trackingReference = cleanText(body.trackingReference, 120);
    if (nextStatus === "posted" && !trackingReference) throw new Error("Add a tracking reference before marking the job as posted.");
    assertPrintJobTransition(job.status, nextStatus);
    const update = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      ...(nextStatus === "producing" ? { producing_at: new Date().toISOString() } : {}),
      ...(nextStatus === "posted" ? { posted_at: new Date().toISOString(), tracking_reference: trackingReference } : {})
    };
    const saved = await supabaseAdmin(`print_jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(update)
    });
    await createPrintJobEvent({
      printJobId: job.id,
      actorUserId: user.id,
      fromStatus: job.status,
      toStatus: nextStatus,
      note: cleanText(body.note, 500) || null,
      eventType: "status"
    });
    if (nextStatus === "producing") {
      await supabaseAdmin(`orders?id=eq.${encodeURIComponent(job.order_id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ refund_locked_at: update.producing_at, updated_at: update.updated_at })
      });
    }
    sendJson(response, 200, { job: saved?.[0] || null }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Print job could not be updated." }, origin);
  }
}

async function declineFactoryJob(request, response, jobId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const profile = await loadPrinterProfile(user.id);
    if (!profile) throw new Error("Printer profile not found.");
    const jobs = await supabaseAdmin(`print_jobs?select=*,orders(*)&id=eq.${encodeURIComponent(jobId)}&printer_profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
    const job = jobs?.[0];
    if (!job) throw new Error("Print job not found.");
    if (job.status !== "order_made") throw new Error("Jobs can only be declined before production starts.");
    const order = Array.isArray(job.orders) ? job.orders[0] : job.orders;
    if (!order?.stripe_payment_intent_id) throw new Error("The original payment could not be found for refund.");
    const body = await readJson(request);
    const reason = cleanText(body.reason, 500) || "Provider declined the job before production.";
    const refund = await stripeForm("/v1/refunds", new URLSearchParams({
      payment_intent: order.stripe_payment_intent_id,
      "metadata[print_job_id]": job.id,
      "metadata[order_id]": job.order_id,
      "metadata[declined_by_printer_profile_id]": profile.id
    }), { headers: { "Idempotency-Key": `print-job-decline-refund-${job.id}` } });
    const updatedAt = new Date().toISOString();
    await Promise.all([
      supabaseAdmin(`print_jobs?id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "refunded", payout_status: "reversed", cancelled_at: updatedAt, updated_at: updatedAt })
      }),
      supabaseAdmin(`orders?id=eq.${encodeURIComponent(job.order_id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "refunded", updated_at: updatedAt })
      }),
      supabaseAdmin(`provider_transfers?print_job_id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "reversed", updated_at: updatedAt })
      }),
      createPrintJobEvent({
        printJobId: job.id,
        actorUserId: user.id,
        fromStatus: job.status,
        toStatus: "refunded",
        note: `${reason} Refund ${refund.id || "created"} has been issued to the buyer.`,
        eventType: "decline"
      })
    ]);
    sendJson(response, 200, { declined: true, refundId: refund.id || null }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Print job could not be declined." }, origin);
  }
}

async function factoryJobForUser(userId, jobId) {
  const profile = await loadPrinterProfile(userId);
  if (!profile) throw new Error("Printer profile not found.");
  const jobs = await supabaseAdmin(`print_jobs?select=*,orders(*,order_items(*),order_customer_snapshots(*)),print_quotes(*)&id=eq.${encodeURIComponent(jobId)}&printer_profile_id=eq.${encodeURIComponent(profile.id)}&status=neq.pending_payment&limit=1`);
  const job = jobs?.[0];
  if (!job) throw new Error("Print job not found.");
  return job;
}

async function addFactoryJobNote(request, response, jobId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const job = await factoryJobForUser(user.id, jobId);
    const body = await readJson(request);
    const note = cleanText(body.note, 500);
    if (!note) throw new Error("Enter a note first.");
    if (["complete", "refunded", "cancelled"].includes(job.status)) throw new Error("Messages are closed for this job.");
    await createPrintJobEvent({ printJobId: job.id, actorUserId: user.id, fromStatus: job.status, toStatus: job.status, note, eventType: "provider_message" });
    sendJson(response, 200, { saved: true }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Job note could not be saved." }, origin);
  }
}

async function addCustomerJobMessage(request, response, jobId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const jobs = await supabaseAdmin(`print_jobs?select=*&id=eq.${encodeURIComponent(jobId)}&customer_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const job = jobs?.[0];
    if (!job) throw new Error("Print job not found.");
    if (["complete", "refunded", "cancelled"].includes(job.status)) throw new Error("Messages are closed for this job.");
    const body = await readJson(request);
    const note = cleanText(body.note, 500);
    if (!note) throw new Error("Enter a message first.");
    await createPrintJobEvent({ printJobId: job.id, actorUserId: user.id, fromStatus: job.status, toStatus: job.status, note, eventType: "customer_message" });
    sendJson(response, 200, { saved: true }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Message could not be sent." }, origin);
  }
}

async function escalateCustomerPrintJob(request, response, jobId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const jobs = await supabaseAdmin(`print_jobs?select=*&id=eq.${encodeURIComponent(jobId)}&customer_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const job = jobs?.[0];
    if (!job) throw new Error("Print job not found.");
    if (["complete", "refunded", "cancelled"].includes(job.status)) throw new Error("This order is already closed.");
    const body = await readJson(request);
    const note = cleanText(body.reason || body.note, 800);
    if (!note) throw new Error("Tell us what needs escalating.");
    await createPrintJobEvent({
      printJobId: job.id,
      actorUserId: user.id,
      fromStatus: job.status,
      toStatus: job.status,
      note,
      eventType: "customer_escalation"
    });
    sendJson(response, 200, { escalated: true }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Order escalation could not be saved." }, origin);
  }
}

async function downloadFactoryJobStl(request, response, jobId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const job = await factoryJobForUser(user.id, jobId);
    const { generator } = resolvePlatformContext({ brandKey: job.brand_key, generatorType: job.generator_type });
    const parameters = job.design_snapshot?.parameters;
    const name = job.design_snapshot?.name || `${job.brand_key}-${job.id}`;
    const stl = generator.renderStl(parameters);
    response.writeHead(200, {
      "Content-Type": "model/stl",
      "Content-Disposition": `attachment; filename="${generator.safeFileName(parameters, name)}"`,
      ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {})
    });
    response.end(stl);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Job STL could not be downloaded." }, origin);
  }
}

async function factoryPostageLabel(request, response, jobId) {
  try {
    const user = await authenticateUser(request);
    const job = await factoryJobForUser(user.id, jobId);
    const order = Array.isArray(job.orders) ? job.orders[0] : job.orders;
    const snapshot = Array.isArray(order?.order_customer_snapshots) ? order.order_customer_snapshots[0] : order?.order_customer_snapshots;
    const address = snapshot?.delivery_address || {};
    const lines = [
      snapshot?.customer_name,
      address.line1,
      address.line2,
      address.city || address.town,
      address.county || address.state,
      address.postal_code || address.postcode,
      address.country
    ].filter(Boolean);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Postage label ${job.id}</title><style>body{font:18px Arial;margin:40px}.label{width:145mm;min-height:90mm;padding:12mm;border:2px solid #111}.brand{font-weight:800;font-size:13px;text-transform:uppercase}.address{margin-top:20px;font-size:24px;line-height:1.45}.meta{margin-top:25px;padding-top:12px;border-top:1px solid #777;font-size:12px}</style></head><body><section class="label"><div class="brand">Forget About Print Factory</div><div class="address">${lines.map((line) => `<div>${escapeHtmlServer(line)}</div>`).join("") || "Delivery address pending payment confirmation"}</div><div class="meta">Job ${escapeHtmlServer(job.id)} · ${escapeHtmlServer(job.brand_key)} · ${escapeHtmlServer(job.colour_key)}</div></section><script>window.print()</script></body></html>`;
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(html);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Postage label could not be created." });
  }
}

function escapeHtmlServer(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

async function trackAccountDevice(userId, deviceHash) {
  if (!/^[a-f0-9]{64}$/.test(String(deviceHash || ""))) {
    if (enforceAccountDeviceLimit) throw new Error("This browser must be registered before continuing.");
    return;
  }
  try {
    const active = await supabaseAdmin(`account_devices?select=id,device_hash&user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null`);
    const existing = active.find((device) => device.device_hash === deviceHash);
    if (existing) {
      await supabaseAdmin(`account_devices?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_seen_at: new Date().toISOString() })
      });
      return;
    }
    if (enforceAccountDeviceLimit && active.length >= accountDeviceLimit) {
      throw new Error(`This account already has ${accountDeviceLimit} active devices. Revoke one before adding another.`);
    }
    await supabaseAdmin("account_devices", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, device_hash: deviceHash })
    });
  } catch (error) {
    if (enforceAccountDeviceLimit) throw error;
  }
}

async function freeExportUsedForScope(userId, brandKey, generatorType) {
  try {
    const rows = await supabaseAdmin(`usage_allowances?select=used_count&user_id=eq.${encodeURIComponent(userId)}&brand_key=eq.${encodeURIComponent(brandKey)}&generator_type=eq.${encodeURIComponent(generatorType)}&allowance_type=eq.sponsored_stl&limit=1`);
    return Number(rows?.[0]?.used_count || 0) > 0;
  } catch {
    const profiles = await supabaseAdmin(`profiles?select=free_export_used&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
    return Boolean(profiles?.[0]?.free_export_used);
  }
}

async function claimFreeExportForScope(userId, brandKey, generatorType) {
  try {
    await supabaseAdmin("usage_allowances?on_conflict=user_id,brand_key,generator_type,allowance_type", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        brand_key: brandKey,
        generator_type: generatorType,
        allowance_type: "sponsored_stl",
        used_count: 0,
        limit_count: 1
      })
    });
    const claimed = await supabaseAdmin(`usage_allowances?user_id=eq.${encodeURIComponent(userId)}&brand_key=eq.${encodeURIComponent(brandKey)}&generator_type=eq.${encodeURIComponent(generatorType)}&allowance_type=eq.sponsored_stl&used_count=eq.0`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ used_count: 1, updated_at: new Date().toISOString() })
    });
    return Boolean(claimed?.length);
  } catch {
    const claimed = await supabaseAdmin(`profiles?user_id=eq.${encodeURIComponent(userId)}&free_export_used=eq.false`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ free_export_used: true, updated_at: new Date().toISOString() })
    });
    return Boolean(claimed?.length);
  }
}

async function loadUnlimitedEntitlements(userId, brand, generator) {
  try {
    const generatorFilter = brand.entitlementScope === "generator"
      ? `generator_type=eq.${encodeURIComponent(generator.type)}`
      : "generator_type=is.null";
    return await supabaseAdmin(`entitlements?select=id&user_id=eq.${encodeURIComponent(userId)}&entitlement_type=eq.unlimited_stl&brand_key=eq.${encodeURIComponent(brand.key)}&${generatorFilter}&revoked_at=is.null&limit=1`);
  } catch {
    return supabaseAdmin(`entitlements?select=id&user_id=eq.${encodeURIComponent(userId)}&entitlement_type=eq.unlimited_stl&revoked_at=is.null&limit=1`);
  }
}

function checkoutReturnOrigin(request, origin) {
  if (process.env.CHECKOUT_RETURN_ORIGIN) return process.env.CHECKOUT_RETURN_ORIGIN.replace(/\/$/, "");
  const baseOrigin = origin || `http://${request.headers.host}`;
  const requestedPath = publicReturnPath(request.headers["x-forget-about-path"] || "");
  const safePath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "";
  return `${baseOrigin}${safePath}`;
}

async function createMarketplaceQuotes(request, response) {
  const origin = checkoutOrigin(request);
  if (!checkoutOriginAllowed(request)) return sendJson(response, 403, { error: "Origin is not allowed." });
  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const { brand, generator } = requestPlatformContext(request, body);
    const rawParameters = body.config || body.parameters || {};
    const parameters = generator.normalizeParameters(rawParameters);
    const desiredColourKey = cleanText(rawParameters.desiredColourKey || parameters.desiredColourKey || "", 80);
    const preferredPrinterProfileId = cleanText(rawParameters.preferredPrinterProfileId || parameters.preferredPrinterProfileId || "", 80);
    const geometry = generator.buildGeometry(parameters);
    const envelope = geometryEnvelope(geometry);
    const [profiles, capabilities] = await Promise.all([
      supabaseAdmin("printer_profiles?select=*&status=neq.suspended&order=rating_average.desc,lead_time_days.asc"),
      supabaseAdmin("printer_capabilities?select=*&active=eq.true&order=colour_name.asc")
    ]);
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const expandedCapabilities = (capabilities || []).flatMap((capability) => (
      capability.colour_key === "all"
        ? standardColours.filter((colour) => colour.key !== "all").map((colour) => ({
          ...capability,
          colour_key: colour.key,
          colour_name: colour.name,
          colour_hex: colour.hex
        }))
        : [capability]
    ));
    const eligible = expandedCapabilities.filter((capability) => {
      const profile = profileMap.get(capability.printer_profile_id);
      const available = profile && (
        (profile.status === "active" && profile.accepting_jobs)
        || (marketplaceIncludePending && profile.status === "pending_review")
      );
      return available
        && capability.material === (parameters.filamentMaterial || "pla")
        && (!desiredColourKey || desiredColourKey === "all" || capability.colour_key === desiredColourKey)
        && (!preferredPrinterProfileId || capability.printer_profile_id === preferredPrinterProfileId)
        && Number(capability.max_width_mm) >= envelope.width
        && Number(capability.max_depth_mm) >= envelope.depth
        && Number(capability.max_height_mm) >= envelope.height;
    });
    const now = Date.now();
    const expiresAt = new Date(now + marketplaceQuoteMinutes * 60_000).toISOString();
    const name = cleanText(body.name || generator.name, 80);
    const designSnapshot = {
      name,
      generatorVersion: generator.version,
      parameters,
      dimensions: envelope,
      materialCm3: geometry.materialCm3
    };
    const quoteRows = eligible.map((capability) => {
      const profile = profileMap.get(capability.printer_profile_id);
      const weightGrams = estimatedWeightGramsFromGeometry(geometry, capability.material);
      const materialCost = Math.round(weightGrams * plaCostPerGramPence);
      const printerFee = Number(capability.base_price_pence);
      const productionPrice = materialCost + printerFee;
      const postage = Number(capability.postage_pence);
      const providerShare = productionPrice + postage;
      const commission = Math.max(0, Math.round(providerShare * marketplaceCommissionPercent / 100));
      const platformFee = marketplacePlatformFeePence;
      const vatAmount = Math.max(0, Math.round((providerShare + commission + platformFee) * marketplaceVatPercent / 100));
      const printHours = estimatedPrintHours(weightGrams, Number(capability.grams_per_hour || defaultPrintTimeModel.gramsPerHour), defaultPrintTimeModel.setupMinutes);
      const printDays = Math.max(1, Math.ceil(printHours / 24));
      const handlingDays = Number(profile.lead_time_days);
      const postageDays = Number(capability.postage_days || 3);
      const fulfillment = {
        handlingDays,
        printDays,
        postageService: capability.postage_service || "",
        postageDays,
        leadTimeDays: handlingDays + printDays + postageDays
      };
      return {
        customer_user_id: user.id,
        printer_profile_id: profile.id,
        brand_key: brand.key,
        generator_type: generator.type,
        design_snapshot: { ...designSnapshot, estimatedWeightGrams: weightGrams, estimatedPrintHours: Number(printHours.toFixed(1)), fulfillment },
        colour_key: capability.colour_key,
        material: capability.material,
        estimated_weight_grams: weightGrams,
        estimated_print_hours: Number(printHours.toFixed(1)),
        handling_days: handlingDays,
        postage_service: capability.postage_service,
        postage_days: postageDays,
        material_cost_pence: materialCost,
        printer_fee_pence: printerFee,
        commission_pence: commission,
        production_price_pence: productionPrice,
        postage_pence: postage,
        platform_fee_pence: platformFee,
        vat_amount_pence: vatAmount,
        total_inc_vat_pence: providerShare + commission + platformFee + vatAmount,
        provider_share_pence: providerShare,
        currency,
        lead_time_days: fulfillment.leadTimeDays,
        expires_at: expiresAt
      };
    });
    if (!quoteRows.length) {
      return sendJson(response, 200, {
        quotes: [],
        dimensions: envelope,
        message: "No providers currently have an active printer capability large enough for this design."
      }, origin);
    }
    const saved = await supabaseAdmin("print_quotes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(quoteRows)
    });
    const savedQuotes = (saved || []).map((quote) => {
      const profile = profileMap.get(quote.printer_profile_id);
      const capability = eligible.find((candidate) => (
        candidate.printer_profile_id === quote.printer_profile_id
        && candidate.colour_key === quote.colour_key
        && candidate.material === quote.material
      ));
      return publicQuote(quote, profile, capability);
    });
    sendJson(response, 200, { quotes: savedQuotes, dimensions: envelope, expiresAt }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Printer quotes could not be created." }, origin);
  }
}

async function createMarketplaceCheckout(request, response) {
  const origin = checkoutOrigin(request);
  if (!checkoutOriginAllowed(request)) return sendJson(response, 403, { error: "Origin is not allowed." });
  const readiness = stripeReady();
  if (!readiness.ready) return sendJson(response, 503, { error: readiness.reason }, origin);
  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const quoteId = cleanText(body.quoteId, 80);
    const quotes = await supabaseAdmin(`print_quotes?select=*&id=eq.${encodeURIComponent(quoteId)}&customer_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const quote = quotes?.[0];
    if (!quote) throw new Error("The selected printer quote could not be found.");
    if (new Date(quote.expires_at).getTime() <= Date.now()) throw new Error("That printer quote has expired. Refresh the available providers.");
    const { brand, generator } = resolvePlatformContext({ brandKey: quote.brand_key, generatorType: quote.generator_type });
    const profiles = await supabaseAdmin(`printer_profiles?select=*&id=eq.${encodeURIComponent(quote.printer_profile_id)}&limit=1`);
    const profile = profiles?.[0];
    if (!profile || profile.status === "suspended") throw new Error("That printer is no longer available.");
    const orderId = randomUUID();
    const printJobId = randomUUID();
    const returnOrigin = checkoutReturnOrigin(request, origin);
    const designName = cleanText(quote.design_snapshot?.name || generator.name, 80);
    const parameters = new URLSearchParams({
      mode: "payment",
      success_url: `${returnOrigin}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}?checkout=cancelled`,
      billing_address_collection: "required",
      "line_items[0][price_data][currency]": quote.currency,
      "line_items[0][price_data][unit_amount]": String(quote.total_inc_vat_pence),
      "line_items[0][price_data][product_data][name]": `${designName} printed by ${profile.display_name}`.slice(0, 120),
      "line_items[0][price_data][product_data][description]": generator.describe(quote.design_snapshot.parameters).slice(0, 500),
      "line_items[0][quantity]": "1",
      "payment_intent_data[transfer_group]": `PRINT_JOB_${printJobId}`,
      "metadata[purchase_type]": "marketplace_print",
      "metadata[user_id]": user.id,
      "metadata[order_id]": orderId,
      "metadata[print_job_id]": printJobId,
      "metadata[quote_id]": quote.id,
      "metadata[brand_key]": brand.key,
      "metadata[generator_type]": generator.type,
      "metadata[printer_profile_id]": profile.id
    });
    if (user.email) parameters.set("customer_email", user.email);
    parameters.set("shipping_address_collection[allowed_countries][0]", marketplacePolicy.countryCode);
    const session = await stripeForm("/v1/checkout/sessions", parameters);
    if (!session.url) throw new Error("Stripe Checkout could not be created.");
    await createPendingOrder({
      id: orderId,
      userId: user.id,
      sessionId: session.id,
      orderType: "printed_design",
      amount: quote.total_inc_vat_pence,
      description: `${designName} printed by ${profile.display_name}`,
      brandKey: brand.key,
      generatorType: generator.type,
      designSnapshot: quote.design_snapshot,
      trayConfiguration: generator.type === "movement_tray" ? quote.design_snapshot.parameters : null,
      financials: {
        subtotalExVat: Number(quote.production_price_pence) + Number(quote.platform_fee_pence) + Number(quote.commission_pence || 0),
        postageExVat: Number(quote.postage_pence),
        vatRate: marketplaceVatPercent,
        vatAmount: Number(quote.vat_amount_pence)
      }
    });
    await supabaseAdmin("print_jobs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: printJobId,
        order_id: orderId,
        customer_user_id: user.id,
        printer_profile_id: profile.id,
        quote_id: quote.id,
        brand_key: brand.key,
        generator_type: generator.type,
        design_snapshot: quote.design_snapshot,
        colour_key: quote.colour_key,
        material: quote.material,
        status: "pending_payment",
        provider_share_pence: quote.provider_share_pence,
        material_cost_pence: quote.material_cost_pence || 0,
        printer_fee_pence: quote.printer_fee_pence || 0,
        platform_fee_pence: quote.platform_fee_pence || 0,
        commission_pence: quote.commission_pence || 0,
        postage_pence: quote.postage_pence || 0,
        payout_status: "held"
      })
    });
    await supabaseAdmin("provider_transfers", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        print_job_id: printJobId,
        printer_profile_id: profile.id,
        amount_pence: quote.provider_share_pence,
        currency: quote.currency,
        status: "held"
      })
    });
    sendJson(response, 200, { url: session.url, amount: quote.total_inc_vat_pence, currency: quote.currency, mode: readiness.mode }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Printer checkout could not be created." }, origin);
  }
}

async function createStripeCheckout(request, response) {
  const origin = checkoutOrigin(request);
  if (!checkoutOriginAllowed(request)) return sendJson(response, 403, { error: "Origin is not allowed." });
  const readiness = stripeReady();
  if (!readiness.ready) return sendJson(response, 503, { error: readiness.reason }, origin);

  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const { brand, generator } = requestPlatformContext(request, body);
    const printable = generator.normalizeParameters(body.config || body.parameters || {});
    const priced = priceGeneratedDesign(generator, printable);
    const prefix = String(body.name || "Printed design").slice(0, 80);
    const orderId = randomUUID();
    const returnOrigin = checkoutReturnOrigin(request, origin);
    const parameters = new URLSearchParams({
      mode: "payment",
      success_url: `${returnOrigin}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}?checkout=cancelled`,
      billing_address_collection: "required",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(priced.amount),
      "line_items[0][price_data][product_data][name]": prefix,
      "line_items[0][price_data][product_data][description]": generator.describe(priced.config),
      "line_items[0][quantity]": "1",
      "metadata[purchase_type]": "printed_tray",
      "metadata[user_id]": user.id,
      "metadata[order_id]": orderId,
      "metadata[brand_key]": brand.key,
      "metadata[generator_type]": generator.type,
      "metadata[generator_version]": String(generator.version),
      "metadata[columns]": String(priced.config.columns),
      "metadata[rows]": String(priced.config.rows),
      "metadata[base_width_mm]": String(priced.config.baseSize),
      "metadata[base_depth_mm]": String(priced.config.baseDepth),
      "metadata[outer_width_mm]": priced.outerWidth.toFixed(1),
      "metadata[outer_depth_mm]": priced.outerDepth.toFixed(1)
    });
    if (user.email) parameters.set("customer_email", user.email);
    allowedCountries.forEach((country, index) => parameters.set(`shipping_address_collection[allowed_countries][${index}]`, country));
    const session = await stripeForm("/v1/checkout/sessions", parameters);
    if (!session.url) throw new Error("Stripe Checkout could not be created.");
    await createPendingOrder({
      id: orderId,
      userId: user.id,
      sessionId: session.id,
      orderType: "printed_tray",
      amount: priced.amount,
      description: prefix,
      brandKey: brand.key,
      generatorType: generator.type,
      designSnapshot: { generatorVersion: generator.version, parameters: printable },
      trayConfiguration: generator.type === "movement_tray" ? printable : null
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
    const { brand, generator } = requestPlatformContext(request);
    const orderId = randomUUID();
    const returnOrigin = checkoutReturnOrigin(request, origin);
    const parameters = new URLSearchParams({
      mode: "payment",
      success_url: `${returnOrigin}?checkout=unlock-success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}?checkout=unlock-cancelled`,
      billing_address_collection: "required",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(unlimitedExportsPrice),
      "line_items[0][price_data][product_data][name]": "Unlimited STL exports",
      "line_items[0][price_data][product_data][description]": `One-off purchase for unlimited ${brand.name} STL downloads`,
      "line_items[0][quantity]": "1",
      "metadata[purchase_type]": "unlimited_stl",
      "metadata[user_id]": user.id,
      "metadata[order_id]": orderId,
      "metadata[brand_key]": brand.key,
      "metadata[generator_type]": generator.type
    });
    if (user.email) parameters.set("customer_email", user.email);
    const session = await stripeForm("/v1/checkout/sessions", parameters);
    if (!session.url) throw new Error("Stripe Checkout could not be created.");
    await createPendingOrder({
      id: orderId,
      userId: user.id,
      sessionId: session.id,
      orderType: "unlimited_stl",
      amount: unlimitedExportsPrice,
      description: `Unlimited ${brand.name} STL exports`,
      brandKey: brand.key,
      generatorType: generator.type
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
    const { brand, generator } = requestPlatformContext(request);
    const body = await readJson(request);
    const sessionId = String(body.sessionId || "");
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid Stripe Checkout session.");
    const session = await stripeJson(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (session.payment_status !== "paid" || session.metadata?.purchase_type !== "unlimited_stl" || session.metadata?.user_id !== user.id
      || session.metadata?.brand_key !== brand.key || session.metadata?.generator_type !== generator.type) {
      return sendJson(response, 402, { error: "The unlimited STL purchase is not paid." }, origin);
    }
    await finalizeCheckoutSession(session);
    sendJson(response, 200, { unlocked: true }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.cause?.message || error.message || "Checkout verification failed." }, origin);
  }
}

async function verifyPrintCheckout(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const sessionId = String(body.sessionId || "");
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid Stripe Checkout session.");
    const session = await stripeJson(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (session.payment_status !== "paid" || session.metadata?.purchase_type !== "marketplace_print" || session.metadata?.user_id !== user.id) {
      return sendJson(response, 402, { error: "The print order payment is not confirmed." }, origin);
    }
    await finalizeCheckoutSession(session);
    sendJson(response, 200, { paid: true, orderId: session.metadata?.order_id }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Print checkout could not be verified." }, origin);
  }
}

async function checkUnlockStatus(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const { brand, generator } = requestPlatformContext(request);
    const rows = await loadUnlimitedEntitlements(user.id, brand, generator);
    sendJson(response, 200, { unlocked: Boolean(rows?.length) }, origin);
  } catch {
    sendJson(response, 200, { unlocked: false }, origin);
  }
}

async function accountExportStatus(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const { brand, generator } = requestPlatformContext(request);
    const [freeExportUsed, entitlements] = await Promise.all([
      freeExportUsedForScope(user.id, brand.key, generator.type),
      loadUnlimitedEntitlements(user.id, brand, generator)
    ]);
    sendJson(response, 200, {
      freeExportUsed,
      unlimitedExports: Boolean(entitlements?.length)
    }, origin);
  } catch (error) {
    sendJson(response, 401, { error: error.message }, origin);
  }
}

async function accountSecurityStatus(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const currentDeviceHash = /^[a-f0-9]{64}$/.test(String(request.headers["x-forget-about-device"] || ""))
      ? String(request.headers["x-forget-about-device"])
      : "";
    const devices = await optionalSupabaseAdmin(`account_devices?select=id,device_hash,friendly_name,first_seen_at,last_seen_at,revoked_at&user_id=eq.${encodeURIComponent(user.id)}&order=last_seen_at.desc`);
    const activeDevices = (devices || []).filter((device) => !device.revoked_at);
    sendJson(response, 200, {
      deviceLimit: accountDeviceLimit,
      enforcementEnabled: enforceAccountDeviceLimit,
      activeDeviceCount: activeDevices.length,
      currentDeviceRegistered: Boolean(currentDeviceHash && activeDevices.some((device) => device.device_hash === currentDeviceHash)),
      sharingWarning: activeDevices.length > accountDeviceLimit,
      devices: activeDevices.map((device) => ({
        id: device.id,
        friendlyName: device.friendly_name || "",
        firstSeenAt: device.first_seen_at,
        lastSeenAt: device.last_seen_at,
        current: Boolean(currentDeviceHash && device.device_hash === currentDeviceHash)
      }))
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
    const { brand, generator } = requestPlatformContext(request, body);
    const config = generator.normalizeParameters(body.config || body.parameters || {});
    const name = String(body.name || "movement-tray").slice(0, 80);
    const claimed = await claimFreeExportForScope(user.id, brand.key, generator.type);
    if (!claimed) return sendJson(response, 409, { error: "The first free STL export has already been used." }, origin);
    sendJson(response, 200, { allowed: true, downloadToken: createFreeDownloadToken(user.id, config, name, brand.key, generator.type) }, origin);
  } catch (error) {
    sendJson(response, 401, { error: error.message }, origin);
  }
}

async function exportStlDownload(request, response) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const body = await readJson(request);
    const { brand, generator } = requestPlatformContext(request, body);
    const config = generator.normalizeParameters(body.config || body.parameters || {});
    const name = String(body.name || "movement-tray").slice(0, 80);
    const entitlements = await loadUnlimitedEntitlements(user.id, brand, generator);
    if (!entitlements?.length && !freeDownloadTokenValid(body.downloadToken, user.id, config, name, brand.key, generator.type)) {
      return sendJson(response, 402, { error: "STL download access is not available for this account." }, origin);
    }
    const stl = generator.renderStl(config);
    response.writeHead(200, {
      "Content-Type": "model/stl",
      "Content-Disposition": `attachment; filename="${generator.safeFileName(config, name)}"`,
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
    const [profiles, designs, projects, trays, armies, orders, entitlements, usageAllowances, accountDevices, printQuotes, printJobs, emailOutbox, privacyRequests] = await Promise.all([
      supabaseAdmin(`profiles?select=*&user_id=eq.${userFilter}&limit=1`),
      optionalSupabaseAdmin(`designs?select=*&user_id=eq.${userFilter}&order=updated_at.desc`),
      optionalSupabaseAdmin(`projects?select=*&user_id=eq.${userFilter}&order=updated_at.desc`),
      supabaseAdmin(`tray_designs?select=*&user_id=eq.${userFilter}&order=updated_at.desc`),
      supabaseAdmin(`army_lists?select=*&user_id=eq.${userFilter}&order=updated_at.desc`),
      supabaseAdmin(`orders?select=*,order_items(*),order_customer_snapshots(*)&user_id=eq.${userFilter}&order=created_at.desc`),
      supabaseAdmin(`entitlements?select=*&user_id=eq.${userFilter}`),
      optionalSupabaseAdmin(`usage_allowances?select=*&user_id=eq.${userFilter}`),
      optionalSupabaseAdmin(`account_devices?select=id,friendly_name,first_seen_at,last_seen_at,revoked_at&user_id=eq.${userFilter}`),
      optionalSupabaseAdmin(`print_quotes?select=*&customer_user_id=eq.${userFilter}`),
      optionalSupabaseAdmin(`print_jobs?select=*,print_job_events(*)&customer_user_id=eq.${userFilter}`),
      optionalSupabaseAdmin(`email_outbox?select=id,print_job_id,recipient_email,email_type,subject,body_text,status,created_at,sent_at,error&user_id=eq.${userFilter}&order=created_at.desc`),
      supabaseAdmin(`privacy_requests?select=id,request_type,status,requested_at,completed_at&user_id=eq.${userFilter}`)
    ]);
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      exportFormat: "forget-about-account-data.v1",
      retentionNotice: "Order, VAT, payment, refund, and fulfilment records may be retained until their retention_until date even if account deletion is requested.",
      account: { id: user.id, email: user.email },
      profile: profiles?.[0] || null,
      designs: designs || [],
      projects: projects || [],
      trayDesigns: trays || [],
      armyLists: armies || [],
      orders: orders || [],
      entitlements: entitlements || [],
      usageAllowances: usageAllowances || [],
      accountDevices: accountDevices || [],
      printQuotes: printQuotes || [],
      printJobs: printJobs || [],
      emailOutbox: emailOutbox || [],
      privacyRequests: privacyRequests || [],
      retainedOrderRecords: (orders || []).map((order) => ({
        id: order.id,
        invoiceNumber: order.invoice_number || null,
        status: order.status,
        taxPoint: order.tax_point || null,
        paidAt: order.paid_at || null,
        retentionUntil: order.retention_until || null
      }))
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

async function createPendingOrder({
  id, userId, sessionId, orderType, amount, description, brandKey = "tray", generatorType = "movement_tray",
  designSnapshot = null, trayConfiguration = null, financials = null
}) {
  const order = {
    id,
    user_id: userId,
    order_type: orderType,
    brand_key: brandKey,
    generator_type: generatorType,
    status: "pending_payment",
    currency,
    total_inc_vat: amount,
    stripe_checkout_session_id: sessionId,
    ...(financials ? {
      subtotal_ex_vat: financials.subtotalExVat,
      postage_ex_vat: financials.postageExVat,
      vat_rate: financials.vatRate,
      vat_amount: financials.vatAmount
    } : {})
  };
  try {
    await supabaseAdmin("orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(order)
    });
  } catch {
    const { brand_key, generator_type, ...legacyOrder } = order;
    await supabaseAdmin("orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(legacyOrder)
    });
  }
  const item = { order_id: id, description, quantity: 1, total_inc_vat: amount, design_snapshot: designSnapshot, tray_configuration: trayConfiguration };
  try {
    await supabaseAdmin("order_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(item)
    });
  } catch {
    const { design_snapshot, ...legacyItem } = item;
    await supabaseAdmin("order_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(legacyItem)
    });
  }
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
    const { brand, generator } = resolvePlatformContext({
      brandKey: session.metadata?.brand_key || "tray",
      generatorType: session.metadata?.generator_type || undefined
    });
    const entitlement = {
      user_id: userId,
      entitlement_type: "unlimited_stl",
      brand_key: brand.key,
      generator_type: brand.entitlementScope === "generator" ? generator.type : null,
      source_order_id: orderId,
      stripe_checkout_session_id: session.id,
      granted_at: new Date().toISOString(),
      revoked_at: null
    };
    try {
      await supabaseAdmin("entitlements?on_conflict=user_id,entitlement_type,brand_key,generator_type", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(entitlement)
      });
    } catch {
      const { brand_key, generator_type, ...legacyEntitlement } = entitlement;
      await supabaseAdmin("entitlements?on_conflict=user_id,entitlement_type", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(legacyEntitlement)
      });
    }
  }
  if (session.metadata?.purchase_type === "marketplace_print" && session.metadata?.print_job_id) {
    const printJobId = session.metadata.print_job_id;
    const jobs = await supabaseAdmin(`print_jobs?select=*&id=eq.${encodeURIComponent(printJobId)}&order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
    const job = jobs?.[0];
    if (job?.status === "pending_payment") {
      const updatedAt = new Date().toISOString();
      await Promise.all([
        supabaseAdmin(`print_jobs?id=eq.${encodeURIComponent(printJobId)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "order_made", updated_at: updatedAt })
        }),
        supabaseAdmin("print_job_events", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            print_job_id: printJobId,
            actor_user_id: userId,
            from_status: "pending_payment",
            to_status: "order_made",
            note: "Stripe confirmed customer payment."
          })
        })
      ]);
    }
  }
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
    const { generator } = requestPlatformContext(request, body);
    const priced = priceGeneratedDesign(generator, body.config || body.parameters || {});
    sendJson(response, 200, { amount: priced.amount, currency }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Checkout quote failed." }, origin);
  }
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const origin = checkoutOrigin(request);

  if (request.method === "GET" && pathname === "/api/app-config") {
    sendJson(response, 200, {
      supabaseUrl,
      supabasePublishableKey,
      accountsEnabled: supabaseReady(),
      platform: publicPlatformConfig
    }, origin);
    return;
  }
  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, { status: "ok", service: "forget-about-platform" }, origin);
    return;
  }
  if (request.method === "POST" && pathname === "/api/launch-signup") {
    await handleLaunchSignup(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/stripe/webhook") {
    await handleStripeWebhook(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/tasks/auto-complete-posted") {
    await runAutoCompleteTask(request, response);
    return;
  }
  if (request.method === "OPTIONS" && (pathname.startsWith("/api/checkout") || pathname.startsWith("/api/account") || pathname.startsWith("/api/factory") || pathname.startsWith("/api/hub") || pathname.startsWith("/api/marketplace") || pathname === "/api/launch-signup")) {
    response.writeHead(204, {
      ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Forget-About-Brand, X-Forget-About-Generator, X-Forget-About-Path, X-Forget-About-Device",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
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
      unlimitedExportsPrice,
      marketplace: marketplacePolicy
    }, origin);
    return;
  }
  if (request.method === "POST" && pathname === "/api/checkout/session") {
    await createStripeCheckout(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/marketplace/quotes") {
    await createMarketplaceQuotes(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/marketplace/checkout/session") {
    await createMarketplaceCheckout(request, response);
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
  if (request.method === "POST" && pathname === "/api/checkout/print/verify") {
    await verifyPrintCheckout(request, response);
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
  if (request.method === "GET" && pathname === "/api/account/security-status") {
    await accountSecurityStatus(request, response);
    return;
  }
  if (request.method === "GET" && pathname === "/api/account/orders") {
    await accountOrders(request, response);
    return;
  }
  if (request.method === "GET" && pathname === "/api/hub/dashboard") {
    await hubDashboard(request, response);
    return;
  }
  const hubProfileStatusRoute = pathname.match(/^\/api\/hub\/printer-profiles\/([0-9a-f-]+)\/status$/i);
  if (request.method === "POST" && hubProfileStatusRoute) {
    await updateHubPrinterProfile(request, response, hubProfileStatusRoute[1]);
    return;
  }
  if (request.method === "POST" && pathname === "/api/account/stl-upload") {
    await uploadAccountStl(request, response);
    return;
  }
  if (request.method === "GET" && pathname === "/api/account/stl-upload") {
    await downloadAccountStl(request, response, requestUrl);
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
  if (request.method === "GET" && pathname === "/api/factory/dashboard") {
    await factoryDashboard(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/factory/profile") {
    await saveFactoryProfile(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/factory/connect/start") {
    await startFactoryConnect(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/factory/connect/status") {
    await factoryConnectStatus(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/factory/capabilities") {
    await addFactoryCapability(request, response);
    return;
  }
  const factoryCapabilityRoute = pathname.match(/^\/api\/factory\/capabilities\/([0-9a-f-]+)$/i);
  if (request.method === "DELETE" && factoryCapabilityRoute) {
    await removeFactoryCapability(request, response, factoryCapabilityRoute[1]);
    return;
  }
  const factoryJobStatusRoute = pathname.match(/^\/api\/factory\/jobs\/([0-9a-f-]+)\/status$/i);
  if (request.method === "POST" && factoryJobStatusRoute) {
    await updateFactoryJob(request, response, factoryJobStatusRoute[1]);
    return;
  }
  const factoryJobDeclineRoute = pathname.match(/^\/api\/factory\/jobs\/([0-9a-f-]+)\/decline$/i);
  if (request.method === "POST" && factoryJobDeclineRoute) {
    await declineFactoryJob(request, response, factoryJobDeclineRoute[1]);
    return;
  }
  const factoryJobNoteRoute = pathname.match(/^\/api\/factory\/jobs\/([0-9a-f-]+)\/note$/i);
  if (request.method === "POST" && factoryJobNoteRoute) {
    await addFactoryJobNote(request, response, factoryJobNoteRoute[1]);
    return;
  }
  const factoryJobStlRoute = pathname.match(/^\/api\/factory\/jobs\/([0-9a-f-]+)\/stl$/i);
  if (request.method === "GET" && factoryJobStlRoute) {
    await downloadFactoryJobStl(request, response, factoryJobStlRoute[1]);
    return;
  }
  const factoryJobLabelRoute = pathname.match(/^\/api\/factory\/jobs\/([0-9a-f-]+)\/label$/i);
  if (request.method === "GET" && factoryJobLabelRoute) {
    await factoryPostageLabel(request, response, factoryJobLabelRoute[1]);
    return;
  }
  const customerCompleteJobRoute = pathname.match(/^\/api\/account\/print-jobs\/([0-9a-f-]+)\/complete$/i);
  if (request.method === "POST" && customerCompleteJobRoute) {
    await completeCustomerPrintJob(request, response, customerCompleteJobRoute[1]);
    return;
  }
  const customerMessageJobRoute = pathname.match(/^\/api\/account\/print-jobs\/([0-9a-f-]+)\/message$/i);
  if (request.method === "POST" && customerMessageJobRoute) {
    await addCustomerJobMessage(request, response, customerMessageJobRoute[1]);
    return;
  }
  const customerEscalateJobRoute = pathname.match(/^\/api\/account\/print-jobs\/([0-9a-f-]+)\/escalate$/i);
  if (request.method === "POST" && customerEscalateJobRoute) {
    await escalateCustomerPrintJob(request, response, customerEscalateJobRoute[1]);
    return;
  }

  if (pathname === "/tray" || pathname === "/tray/") {
    response.writeHead(308, { Location: `/trays/${requestUrl.search}` });
    response.end();
    return;
  }
  const brandRoute = publicPlatformConfig.brands.find((brand) => brand.enabled && (pathname === `/${brand.path}` || pathname === `/${brand.path}/`));
  if (brandRoute && !pathname.endsWith("/")) {
    response.writeHead(308, { Location: `/${brandRoute.path}/${requestUrl.search}` });
    response.end();
    return;
  }
  if (pathname === "/factory") {
    response.writeHead(308, { Location: `/factory/${requestUrl.search}` });
    response.end();
    return;
  }
  if (pathname === "/hub") {
    response.writeHead(308, { Location: `/hub/${requestUrl.search}` });
    response.end();
    return;
  }
  const brandDirectory = brandRoute?.key === "tray" ? "tray" : brandRoute?.path;
  const brandEntry = brandRoute ? `${brandDirectory}/index.html` : "index.html";
  const relativePath = pathname === "/" ? "index.html" : brandRoute ? brandEntry : pathname === "/factory/" ? "factory/index.html" : pathname === "/hub/" ? "hub/index.html" : pathname.slice(1);
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
  console.log(`Forget About Tray running at http://localhost:${port}`);
});
