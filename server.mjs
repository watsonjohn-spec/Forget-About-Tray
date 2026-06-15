import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { marketplacePolicy, publicPlatformConfig, resolvePlatformContext } from "./platform/registry.mjs";
import { assertPrintJobTransition } from "./platform/print-factory.mjs";

const port = Number(process.env.PORT || 4173);
const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const allowLiveStripe = process.env.ALLOW_LIVE_STRIPE === "true";
const currency = (process.env.STRIPE_CURRENCY || "gbp").toLowerCase();
const basePrice = Number(process.env.PRINT_BASE_PRICE_PENCE || 800);
const pricePerCm3 = Number(process.env.PRINT_PRICE_PER_CM3_PENCE || 25);
const unlimitedExportsPrice = Number(process.env.UNLIMITED_EXPORTS_PRICE_PENCE || 500);
const stripeApiBase = process.env.STRIPE_API_BASE || "https://api.stripe.com";
const stripeApiVersion = process.env.STRIPE_API_VERSION || "2026-05-27.dahlia";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const allowedCountries = (process.env.STRIPE_ALLOWED_COUNTRIES || "GB,US").split(",").map((country) => country.trim().toUpperCase()).filter(Boolean);
const allowedOrigins = (process.env.CHECKOUT_ALLOWED_ORIGIN || "https://watsonjohn-spec.github.io")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";
const downloadTokenSecret = process.env.DOWNLOAD_TOKEN_SECRET || stripeKey;
const accountDeviceLimit = Number(process.env.ACCOUNT_DEVICE_LIMIT || 3);
const enforceAccountDeviceLimit = process.env.ENFORCE_ACCOUNT_DEVICE_LIMIT === "true";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function requestPlatformContext(request, body = {}) {
  return resolvePlatformContext({
    brandKey: body.brandKey || request.headers["x-forget-about-brand"] || "tray",
    generatorType: body.generatorType || request.headers["x-forget-about-generator"] || undefined
  });
}

function priceGeneratedDesign(generator, input) {
  const geometry = generator.buildGeometry(input);
  const amount = Math.max(50, Math.round(basePrice + geometry.materialCm3 * pricePerCm3));
  return { ...geometry, amount };
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

function stripeReady() {
  const testKey = stripeKey.startsWith("sk_test_") || stripeKey.startsWith("rk_test_");
  const liveKey = stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_");
  if ((!testKey && !liveKey) || stripeKey.includes("replace_me")) return { ready: false, reason: "Stripe server key is not configured." };
  if (liveKey && !allowLiveStripe) return { ready: false, reason: "Live Stripe payments are disabled until ALLOW_LIVE_STRIPE=true." };
  return { ready: true, mode: liveKey ? "live" : "test" };
}

async function stripeJson(path, options = {}) {
  const response = await fetch(`${stripeApiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Stripe-Version": stripeApiVersion,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.message || "Stripe request failed.");
  return body;
}

async function stripeForm(path, parameters, options = {}) {
  const response = await fetch(`${stripeApiBase}${path}`, {
    method: options.method || "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Stripe-Version": stripeApiVersion,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options.headers || {})
    },
    body: parameters
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.message || "Stripe request failed.");
  return body;
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

function cleanPositiveInteger(value, fallback, maximum = 100_000) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum ? number : fallback;
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
      supabaseAdmin(`print_jobs?select=*,print_job_events(*)&printer_profile_id=eq.${profileId}&order=created_at.desc`),
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
  const account = await stripeJson(`/v2/core/accounts/${encodeURIComponent(paymentAccount.stripe_connected_account_id)}?include[]=configuration.recipient&include[]=requirements`);
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
    const login = await stripeForm(`/v1/accounts/${encodeURIComponent(paymentAccount.stripe_connected_account_id)}/login_links`, new URLSearchParams());
    sendJson(response, 200, { url: login.url }, origin);
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

async function completeCustomerPrintJob(request, response, jobId) {
  const origin = checkoutOrigin(request);
  try {
    const user = await authenticateUser(request);
    const jobs = await supabaseAdmin(`print_jobs?select=*&id=eq.${encodeURIComponent(jobId)}&customer_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const job = jobs?.[0];
    if (!job) throw new Error("Print job not found.");
    assertPrintJobTransition(job.status, "complete");
    const completedAt = new Date().toISOString();
    const saved = await supabaseAdmin(`print_jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "complete", completed_at: completedAt, updated_at: completedAt })
    });
    await supabaseAdmin("print_job_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ print_job_id: job.id, actor_user_id: user.id, from_status: job.status, to_status: "complete", note: "Customer confirmed delivery." })
    });
    const transfer = await releaseProviderTransfer(saved?.[0] || { ...job, status: "complete", completed_at: completedAt });
    sendJson(response, 200, { job: saved?.[0] || null, transfer }, origin);
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
    const colourName = cleanText(body.colourName, 80);
    const colourKey = cleanText(body.colourKey || colourName, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!["pla", "petg"].includes(material) || !colourName || !colourKey) throw new Error("Choose PLA or PETG and provide a colour.");
    const capability = {
      printer_profile_id: profile.id,
      process: "fdm",
      material,
      colour_key: colourKey,
      colour_name: colourName,
      colour_hex: /^#[0-9a-f]{6}$/i.test(body.colourHex || "") ? body.colourHex : null,
      max_width_mm: cleanPositiveInteger(body.maxWidthMm, 256, 1000),
      max_depth_mm: cleanPositiveInteger(body.maxDepthMm, 256, 1000),
      max_height_mm: cleanPositiveInteger(body.maxHeightMm, 256, 1000),
      base_price_pence: cleanPositiveInteger(body.basePricePence, 0),
      price_per_cm3_pence: cleanPositiveInteger(body.pricePerCm3Pence, 0),
      postage_pence: cleanPositiveInteger(body.postagePence, 0),
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
    assertPrintJobTransition(job.status, nextStatus);
    const update = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      ...(nextStatus === "producing" ? { producing_at: new Date().toISOString() } : {}),
      ...(nextStatus === "posted" ? { posted_at: new Date().toISOString(), tracking_reference: cleanText(body.trackingReference, 120) || null } : {})
    };
    const saved = await supabaseAdmin(`print_jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(update)
    });
    await supabaseAdmin("print_job_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ print_job_id: job.id, actor_user_id: user.id, from_status: job.status, to_status: nextStatus, note: cleanText(body.note, 500) || null })
    });
    sendJson(response, 200, { job: saved?.[0] || null }, origin);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Print job could not be updated." }, origin);
  }
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
  const requestedPath = String(request.headers["x-forget-about-path"] || "").replace(/\/$/, "");
  const safePath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "";
  return `${baseOrigin}${safePath}`;
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
    const stripeResponse = await fetch(`${stripeApiBase}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${stripeKey}` }
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok) throw new Error(session.error?.message || "Stripe Checkout could not be verified.");
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
    if (!claimed) return sendJson(response, 409, { error: "The sponsored STL download has already been used." }, origin);
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
    const [profiles, designs, projects, trays, armies, orders, entitlements, usageAllowances, accountDevices, printQuotes, printJobs, privacyRequests] = await Promise.all([
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
      supabaseAdmin(`privacy_requests?select=id,request_type,status,requested_at,completed_at&user_id=eq.${userFilter}`)
    ]);
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
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

async function createPendingOrder({
  id, userId, sessionId, orderType, amount, description, brandKey = "tray", generatorType = "movement_tray",
  designSnapshot = null, trayConfiguration = null
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
    stripe_checkout_session_id: sessionId
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
  if (request.method === "POST" && pathname === "/api/stripe/webhook") {
    await handleStripeWebhook(request, response);
    return;
  }
  if (request.method === "OPTIONS" && (pathname.startsWith("/api/checkout") || pathname.startsWith("/api/account") || pathname.startsWith("/api/factory"))) {
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
  const customerCompleteJobRoute = pathname.match(/^\/api\/account\/print-jobs\/([0-9a-f-]+)\/complete$/i);
  if (request.method === "POST" && customerCompleteJobRoute) {
    await completeCustomerPrintJob(request, response, customerCompleteJobRoute[1]);
    return;
  }

  const brandRoute = publicPlatformConfig.brands.find((brand) => brand.enabled && (pathname === `/${brand.path}` || pathname === `/${brand.path}/`));
  if (brandRoute && pathname.endsWith("/")) {
    response.writeHead(308, { Location: `/${brandRoute.path}${requestUrl.search}` });
    response.end();
    return;
  }
  if (pathname === "/factory") {
    response.writeHead(308, { Location: `/factory/${requestUrl.search}` });
    response.end();
    return;
  }
  const relativePath = pathname === "/" || brandRoute ? "index.html" : pathname === "/factory/" ? "factory/index.html" : pathname.slice(1);
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
