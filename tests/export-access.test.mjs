import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mockPort = 4191;
const appPort = 4192;
const baseUrl = `http://127.0.0.1:${appPort}`;
const freeUserId = "00000000-0000-4000-8000-000000000001";
const paidUserId = "00000000-0000-4000-8000-000000000002";
const concurrentUserId = "00000000-0000-4000-8000-000000000003";
const profiles = new Map([[freeUserId, false], [paidUserId, true], [concurrentUserId, false]]);
const orders = [];
const orderItems = [];
const orderCustomerSnapshots = [];
const designs = [];
const projects = [];
const accountDevices = [];
const checkoutRequests = [];
const printQuotes = [];
const printJobs = [];
const printJobEvents = [];
const providerTransfers = [];
const providerReviews = [];
const stripeTransfers = [];
const refundRequests = [];
const privacyRequests = [];
const storageObjects = new Map();
const emailOutbox = [];
const webhookSecret = "whsec_test_webhook_secret";
const paymentAccounts = [];
const stripeAccountRequests = [];
const printerProfile = {
  id: "10000000-0000-4000-8000-000000000001",
  user_id: paidUserId,
  display_name: "Prototype Printer",
  description: "Local test provider",
  based_in: "Leeds",
  postcode_area: "LS1",
  rating_average: 4.8,
  rating_count: 12,
  lead_time_days: 4,
  status: "active",
  accepting_jobs: true
};

function userFromToken(header = "") {
  if (header === "Bearer free-token") return { id: freeUserId, email: "free@example.test" };
  if (header === "Bearer paid-token") return { id: paidUserId, email: "paid@example.test" };
  if (header === "Bearer concurrent-token") return { id: concurrentUserId, email: "concurrent@example.test" };
  return null;
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function requestJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || "{}");
}

function eqParam(url, name) {
  return url.searchParams.get(name)?.replace("eq.", "") || "";
}

function applyPatch(rows, predicate, patch) {
  const updated = [];
  for (const row of rows) {
    if (predicate(row)) {
      Object.assign(row, patch);
      updated.push(row);
    }
  }
  return updated;
}

function orderRowsForUser(userId, brandKey = "") {
  return orders
    .filter((order) => order.user_id === userId && (!brandKey || order.brand_key === brandKey))
    .map((order) => ({
      ...order,
      order_items: orderItems.filter((item) => item.order_id === order.id),
      order_customer_snapshots: orderCustomerSnapshots.filter((snapshot) => snapshot.order_id === order.id),
      print_jobs: printJobs
        .filter((job) => job.order_id === order.id)
        .map((job) => ({ ...job, print_job_events: printJobEvents.filter((event) => event.print_job_id === job.id) }))
    }));
}

function selectedPrintJobs(url) {
  const id = eqParam(url, "id");
  const orderId = eqParam(url, "order_id");
  const customerUserId = eqParam(url, "customer_user_id");
  const printerProfileId = eqParam(url, "printer_profile_id");
  const statusFilter = url.searchParams.get("status") || "";
  return printJobs.filter((job) => (
    (!id || job.id === id)
    && (!orderId || job.order_id === orderId)
    && (!customerUserId || job.customer_user_id === customerUserId)
    && (!printerProfileId || job.printer_profile_id === printerProfileId)
    && (!statusFilter.startsWith("neq.") || job.status !== statusFilter.replace("neq.", ""))
    && (!statusFilter.startsWith("eq.") || job.status === statusFilter.replace("eq.", ""))
  )).map((job) => {
    const order = orders.find((candidate) => candidate.id === job.order_id);
    return {
      ...job,
      orders: order ? { ...order, order_customer_snapshots: orderCustomerSnapshots.filter((snapshot) => snapshot.order_id === order.id) } : null,
      print_quotes: printQuotes.find((quote) => quote.id === job.quote_id) || null,
      print_job_events: printJobEvents.filter((event) => event.print_job_id === job.id)
    };
  });
}

function stripeSignature(rawBody) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function latestCheckoutMetadata() {
  const checkout = checkoutRequests.at(-1);
  return {
    orderId: checkout.get("metadata[order_id]"),
    printJobId: checkout.get("metadata[print_job_id]"),
    quoteId: checkout.get("metadata[quote_id]"),
    amount: Number(checkout.get("line_items[0][price_data][unit_amount]") || 0),
    purchaseType: checkout.get("metadata[purchase_type]"),
    brandKey: checkout.get("metadata[brand_key]"),
    generatorType: checkout.get("metadata[generator_type]"),
    printerProfileId: checkout.get("metadata[printer_profile_id]")
  };
}

async function postCheckoutCompletedWebhook(metadata, extraSession = {}) {
  const event = {
    id: `evt_${metadata.printJobId || metadata.orderId || Date.now()}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${metadata.orderId || Date.now()}`,
        payment_status: "paid",
        amount_total: metadata.amount,
        payment_intent: `pi_${metadata.orderId || Date.now()}`,
        created: Math.floor(Date.now() / 1000),
        metadata: {
          purchase_type: metadata.purchaseType,
          user_id: paidUserId,
          order_id: metadata.orderId,
          print_job_id: metadata.printJobId,
          quote_id: metadata.quoteId,
          brand_key: metadata.brandKey,
          generator_type: metadata.generatorType,
          printer_profile_id: metadata.printerProfileId
        },
        customer_details: {
          name: "Paid Customer",
          email: "paid@example.test",
          address: { line1: "1 Test Street", city: "Leeds", postal_code: "LS1 1AA", country: "GB" }
        },
        shipping_details: {
          name: "Paid Customer",
          address: { line1: "1 Test Street", city: "Leeds", postal_code: "LS1 1AA", country: "GB" }
        },
        ...extraSession
      }
    }
  };
  const rawBody = JSON.stringify(event);
  return fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": stripeSignature(rawBody) },
    body: rawBody
  });
}

const mockSupabase = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${mockPort}`);
  if (url.pathname === "/v1/checkout/sessions") {
    let body = "";
    for await (const chunk of request) body += chunk;
    checkoutRequests.push(new URLSearchParams(body));
    return sendJson(response, 200, { id: `cs_test_${Date.now()}`, url: "https://checkout.stripe.test/session" });
  }
  if (url.pathname === "/v2/core/accounts" && request.method === "POST") {
    const body = await requestJson(request);
    stripeAccountRequests.push(body);
    return sendJson(response, 200, {
      id: "acct_test_factory_provider",
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "inactive" }, payouts: { status: "inactive" } } } } }
    });
  }
  if (url.pathname === "/v1/account_links" && request.method === "POST") {
    return sendJson(response, 200, { url: "https://connect.stripe.test/onboarding" });
  }
  if (url.pathname === "/v1/transfers" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const parameters = new URLSearchParams(body);
    const saved = { id: `tr_test_${String(stripeTransfers.length + 1).padStart(4, "0")}`, parameters };
    stripeTransfers.push(saved);
    return sendJson(response, 200, saved);
  }
  if (url.pathname === "/v1/refunds" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const parameters = new URLSearchParams(body);
    const saved = { id: `re_test_${String(refundRequests.length + 1).padStart(4, "0")}`, parameters };
    refundRequests.push(saved);
    return sendJson(response, 200, saved);
  }
  if (url.pathname === "/auth/v1/user") {
    const user = userFromToken(request.headers.authorization);
    return sendJson(response, user ? 200 : 401, user || { message: "invalid token" });
  }

  if (url.pathname.startsWith("/storage/v1/object/user-stl-uploads/")) {
    const objectPath = decodeURIComponent(url.pathname.replace("/storage/v1/object/user-stl-uploads/", ""));
    if (request.method === "PUT") {
      const chunks = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      storageObjects.set(objectPath, { bytes, contentType: request.headers["content-type"] || "model/stl" });
      return sendJson(response, 200, { Key: objectPath });
    }
    if (request.method === "GET") {
      const object = storageObjects.get(objectPath);
      if (!object) return sendJson(response, 404, { message: "Object not found" });
      response.writeHead(200, { "Content-Type": object.contentType });
      response.end(object.bytes);
      return undefined;
    }
  }

  if (url.pathname === "/rest/v1/profiles") {
    const userId = url.searchParams.get("user_id")?.replace("eq.", "");
    if (request.method === "PATCH") {
      if (url.searchParams.get("free_export_used") === "eq.false" && profiles.get(userId)) {
        return sendJson(response, 200, []);
      }
      profiles.set(userId, true);
      return sendJson(response, 200, [{ free_export_used: true }]);
    }
    return sendJson(response, 200, [{
      user_id: userId,
      email: userId === paidUserId ? "paid@example.test" : "free@example.test",
      display_name: userId === paidUserId ? "Paid Customer" : null,
      default_address: { line1: "1 Test Street", city: "Leeds", postcode: "LS1 1AA", country: "GB" },
      free_export_used: profiles.get(userId) || false
    }]);
  }

  if (url.pathname === "/rest/v1/entitlements") {
    const userId = url.searchParams.get("user_id")?.replace("eq.", "");
    return sendJson(response, 200, userId === paidUserId ? [{ id: "paid-entitlement" }] : []);
  }

  if (url.pathname === "/rest/v1/designs") {
    const userId = eqParam(url, "user_id");
    return sendJson(response, 200, designs.filter((design) => !userId || design.user_id === userId));
  }

  if (url.pathname === "/rest/v1/projects") {
    const userId = eqParam(url, "user_id");
    return sendJson(response, 200, projects.filter((project) => !userId || project.user_id === userId));
  }

  if (url.pathname === "/rest/v1/tray_designs" || url.pathname === "/rest/v1/army_lists") {
    return sendJson(response, 200, []);
  }

  if (url.pathname === "/rest/v1/account_devices") {
    if (request.method === "POST") {
      const saved = {
        ...(await requestJson(request)),
        id: `90000000-0000-4000-8000-${String(accountDevices.length + 1).padStart(12, "0")}`,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        revoked_at: null
      };
      accountDevices.push(saved);
      return sendJson(response, 200, [saved]);
    }
    if (request.method === "PATCH") {
      const patch = await requestJson(request);
      const updated = applyPatch(accountDevices, (device) => !eqParam(url, "id") || device.id === eqParam(url, "id"), patch);
      return sendJson(response, 200, updated);
    }
    const userId = eqParam(url, "user_id");
    return sendJson(response, 200, accountDevices.filter((device) => (!userId || device.user_id === userId) && !device.revoked_at));
  }

  if (url.pathname === "/rest/v1/printer_profiles") {
    if (request.method === "PATCH") {
      Object.assign(printerProfile, await requestJson(request));
      return sendJson(response, 200, [printerProfile]);
    }
    const id = eqParam(url, "id");
    const userId = eqParam(url, "user_id");
    const rows = (!id || id === printerProfile.id) && (!userId || userId === printerProfile.user_id)
      ? [printerProfile]
      : [];
    return sendJson(response, 200, rows);
  }

  if (url.pathname === "/rest/v1/printer_capabilities") {
    return sendJson(response, 200, [{
      id: "20000000-0000-4000-8000-000000000001",
      printer_profile_id: printerProfile.id,
      material: "pla",
      colour_key: "forest-green",
      colour_name: "Forest Green",
      colour_hex: "#31543a",
      max_width_mm: 256,
      max_depth_mm: 256,
      max_height_mm: 256,
      base_price_pence: 500,
      price_per_cm3_pence: 20,
      postage_pence: 350,
      active: true
    }]);
  }

  if (url.pathname === "/rest/v1/printer_payment_accounts") {
    if (request.method === "POST") {
      const saved = { ...(await requestJson(request)), id: "50000000-0000-4000-8000-000000000001" };
      paymentAccounts.push(saved);
      return sendJson(response, 200, [saved]);
    }
    const printerProfileId = eqParam(url, "printer_profile_id");
    return sendJson(response, 200, paymentAccounts.filter((account) => !printerProfileId || account.printer_profile_id === printerProfileId));
  }

  if (url.pathname === "/rest/v1/print_quotes") {
    if (request.method === "POST") {
      const rows = await requestJson(request);
      const saved = rows.map((row, index) => ({ ...row, id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, created_at: new Date().toISOString() }));
      printQuotes.push(...saved);
      return sendJson(response, 200, saved);
    }
    const id = url.searchParams.get("id")?.replace("eq.", "");
    return sendJson(response, 200, id ? printQuotes.filter((quote) => quote.id === id) : printQuotes);
  }

  if (url.pathname === "/rest/v1/print_jobs") {
    if (request.method === "POST") {
      printJobs.push(await requestJson(request));
      return sendJson(response, 200, {});
    }
    if (request.method === "PATCH") {
      const patch = await requestJson(request);
      const updated = applyPatch(printJobs, (job) => (
        (!eqParam(url, "id") || job.id === eqParam(url, "id"))
        && (!eqParam(url, "order_id") || job.order_id === eqParam(url, "order_id"))
        && (!eqParam(url, "customer_user_id") || job.customer_user_id === eqParam(url, "customer_user_id"))
        && (!eqParam(url, "printer_profile_id") || job.printer_profile_id === eqParam(url, "printer_profile_id"))
      ), patch);
      return sendJson(response, 200, updated);
    }
    return sendJson(response, 200, selectedPrintJobs(url));
  }

  if (url.pathname === "/rest/v1/stripe_events") {
    if (request.method === "GET") return sendJson(response, 200, []);
    await requestJson(request);
    return sendJson(response, 200, {});
  }

  if (url.pathname === "/rest/v1/order_customer_snapshots" && request.method === "POST") {
    const saved = await requestJson(request);
    const existing = orderCustomerSnapshots.find((snapshot) => snapshot.order_id === saved.order_id);
    if (existing) Object.assign(existing, saved);
    else orderCustomerSnapshots.push(saved);
    return sendJson(response, 200, [saved]);
  }

  if (url.pathname === "/rest/v1/provider_transfers") {
    if (request.method === "POST") {
      const saved = await requestJson(request);
      const existing = providerTransfers.find((transfer) => transfer.print_job_id === saved.print_job_id);
      if (existing) Object.assign(existing, saved);
      else providerTransfers.push(saved);
      return sendJson(response, 200, [saved]);
    }
    if (request.method === "PATCH") {
      const patch = await requestJson(request);
      const updated = applyPatch(providerTransfers, (transfer) => (
        (!eqParam(url, "id") || transfer.id === eqParam(url, "id"))
        && (!eqParam(url, "print_job_id") || transfer.print_job_id === eqParam(url, "print_job_id"))
        && (!eqParam(url, "printer_profile_id") || transfer.printer_profile_id === eqParam(url, "printer_profile_id"))
      ), patch);
      return sendJson(response, 200, updated);
    }
    const printerProfileId = eqParam(url, "printer_profile_id");
    return sendJson(response, 200, providerTransfers.filter((transfer) => !printerProfileId || transfer.printer_profile_id === printerProfileId));
  }

  if (url.pathname === "/rest/v1/orders") {
    if (request.method === "POST") {
      const saved = await requestJson(request);
      orders.push(saved);
      return sendJson(response, 200, [saved]);
    }
    if (request.method === "PATCH") {
      const patch = await requestJson(request);
      const updated = applyPatch(orders, (order) => (
        (!eqParam(url, "id") || order.id === eqParam(url, "id"))
        && (!eqParam(url, "user_id") || order.user_id === eqParam(url, "user_id"))
      ), patch);
      return sendJson(response, 200, updated);
    }
    return sendJson(response, 200, orderRowsForUser(eqParam(url, "user_id"), eqParam(url, "brand_key")));
  }

  if (url.pathname === "/rest/v1/order_items" && request.method === "POST") {
    orderItems.push(await requestJson(request));
    return sendJson(response, 200, {});
  }

  if (url.pathname === "/rest/v1/print_job_events") {
    if (request.method === "POST") {
      const saved = {
        ...(await requestJson(request)),
        id: `60000000-0000-4000-8000-${String(printJobEvents.length + 1).padStart(12, "0")}`,
        created_at: new Date().toISOString()
      };
      printJobEvents.push(saved);
      return sendJson(response, 200, [saved]);
    }
    const printJobId = eqParam(url, "print_job_id");
    return sendJson(response, 200, printJobEvents.filter((event) => !printJobId || event.print_job_id === printJobId));
  }

  if (url.pathname === "/rest/v1/email_outbox") {
    if (request.method === "POST") {
      const saved = {
        ...(await requestJson(request)),
        id: `61000000-0000-4000-8000-${String(emailOutbox.length + 1).padStart(12, "0")}`,
        created_at: new Date().toISOString()
      };
      emailOutbox.push(saved);
      return sendJson(response, 200, [saved]);
    }
    const userId = eqParam(url, "user_id");
    return sendJson(response, 200, emailOutbox.filter((email) => !userId || email.user_id === userId));
  }

  if (url.pathname === "/rest/v1/provider_reviews") {
    if (request.method === "POST") {
      const saved = await requestJson(request);
      const existing = providerReviews.find((review) => review.print_job_id === saved.print_job_id);
      if (existing) Object.assign(existing, saved);
      else providerReviews.push(saved);
      return sendJson(response, 200, [saved]);
    }
    const printerProfileId = eqParam(url, "printer_profile_id");
    return sendJson(response, 200, providerReviews.filter((review) => !printerProfileId || review.printer_profile_id === printerProfileId));
  }

  if (url.pathname === "/rest/v1/privacy_requests") {
    if (request.method === "POST") {
      const saved = {
        ...(await requestJson(request)),
        id: `70000000-0000-4000-8000-${String(privacyRequests.length + 1).padStart(12, "0")}`,
        status: "requested",
        requested_at: new Date().toISOString(),
        completed_at: null
      };
      privacyRequests.push(saved);
      return sendJson(response, 200, [saved]);
    }
    const userId = eqParam(url, "user_id");
    return sendJson(response, 200, privacyRequests.filter((request) => !userId || request.user_id === userId));
  }

  sendJson(response, 404, { message: "mock route not found" });
});

let app;

async function api(path, token, body, extraHeaders = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function trayPrintConfig(overrides = {}) {
  return {
    columns: 2,
    rows: 2,
    baseSize: 25,
    baseDepth: 25,
    gap: 1,
    clearance: 1,
    plateThickness: 2,
    lipEnabled: true,
    wallHeight: 3,
    wallThickness: 1.6,
    notchesEnabled: false,
    notchWidth: 2,
    ...overrides
  };
}

async function createPaidMarketplacePrint(name, config = trayPrintConfig()) {
  const quoteResponse = await api("/api/marketplace/quotes", "paid-token", { config, name });
  assert.equal(quoteResponse.status, 200);
  const quoteResult = await quoteResponse.json();
  assert.equal(quoteResult.quotes.length, 1);
  const quote = quoteResult.quotes[0];
  const checkoutResponse = await api("/api/marketplace/checkout/session", "paid-token", { quoteId: quote.id });
  assert.equal(checkoutResponse.status, 200);
  const metadata = latestCheckoutMetadata();
  const webhookResponse = await postCheckoutCompletedWebhook(metadata);
  assert.equal(webhookResponse.status, 200);
  return { quote, metadata };
}

test.before(async () => {
  mockSupabase.listen(mockPort, "127.0.0.1");
  await once(mockSupabase, "listening");
  app = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(appPort),
      SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
      SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
      SUPABASE_SECRET_KEY: "secret-test-key",
      DOWNLOAD_TOKEN_SECRET: "test-download-secret",
      TASK_RUNNER_SECRET: "test-task-secret",
      STRIPE_SECRET_KEY: "rk_test_abcdefghijklmnopqrstuvwxyz123456",
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      STRIPE_API_BASE: `http://127.0.0.1:${mockPort}`
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("App server did not start.")), 5000);
    app.stdout.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
    app.once("exit", (code) => reject(new Error(`App server exited with ${code}.`)));
  });
});

test.after(async () => {
  app?.kill();
  mockSupabase.close();
  await once(mockSupabase, "close");
});

test("sponsored permit is tray-specific and paid access remains available", async () => {
  const config = {
    columns: 5,
    rows: 4,
    baseSize: 25,
    baseDepth: 25,
    gap: 1,
    clearance: 1,
    plateThickness: 2,
    lipEnabled: true,
    wallHeight: 3,
    wallThickness: 1.6,
    notchesEnabled: true,
    notchWidth: 2
  };

  const permitResponse = await api("/api/account/use-free-export", "free-token", { config, name: "Ungor Raiders" });
  assert.equal(permitResponse.status, 200);
  const permit = await permitResponse.json();
  assert.equal(permit.allowed, true);

  const freeDownload = await api("/api/account/export-stl", "free-token", { config, name: "Ungor Raiders", downloadToken: permit.downloadToken });
  assert.equal(freeDownload.status, 200);
  assert.match(freeDownload.headers.get("content-type"), /model\/stl/);
  assert.match(await freeDownload.text(), /^solid movement_tray/);

  const changedTray = await api("/api/account/export-stl", "free-token", {
    config: { ...config, columns: 6 },
    name: "Ungor Raiders",
    downloadToken: permit.downloadToken
  });
  assert.equal(changedTray.status, 402);

  const secondPermit = await api("/api/account/use-free-export", "free-token", { config, name: "Ungor Raiders" });
  assert.equal(secondPermit.status, 409);

  const unpaidDownload = await api("/api/account/export-stl", "free-token", { config, name: "Ungor Raiders" });
  assert.equal(unpaidDownload.status, 402);

  const paidDownload = await api("/api/account/export-stl", "paid-token", { config, name: "Ungor Raiders" });
  assert.equal(paidDownload.status, 200);
  assert.match(await paidDownload.text(), /^solid movement_tray/);
});

test("download and physical print are both presented as fulfilment options", async () => {
  const html = await readFile(new URL("../tray/index.html", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(html, /id="chooseUnlockedExport"[\s\S]*?<strong>Download STL<\/strong>/);
  assert.match(html, /id="choosePrintOrder"[\s\S]*?<strong>Have it printed<\/strong>/);
  assert.match(appSource, /document\.getElementById\("chooseUnlockedExport"\)\.hidden = !unlimited/);
  assert.doesNotMatch(appSource, /document\.getElementById\("choosePrintOrder"\)\.hidden/);
});

test("enabled brand route serves the shared app shell", async () => {
  const response = await fetch(`${baseUrl}/tray/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<script src="\.\.\/platform\.js"><\/script>/);
});

test("corporate landing page links to active generators", async () => {
  const landing = await fetch(`${baseUrl}/`);
  assert.equal(landing.status, 200);
  const html = await landing.text();
  assert.match(html, /Forget About/);
  for (const route of ["/tray/", "/makeup/", "/print/", "/paint/", "/stitch/", "/factory/"]) {
    assert.match(html, new RegExp(`href="${route.slice(1).replace("/", "\\/")}`));
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200);
  }
});

test("makeup route serves the rose-gold caddy generator", async () => {
  const response = await fetch(`${baseUrl}/makeup`);
  assert.equal(response.status, 200);
  assert.match(response.url, /\/makeup\/$/);
  const html = await response.text();
  assert.match(html, /Forget About Makeup/);
  assert.match(html, /id="slotList"/);
  assert.match(html, /src="makeup\.js"/);
  assert.equal((await fetch(`${baseUrl}/makeup/makeup.css`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/makeup/makeup.js`)).status, 200);
});

test("factory route serves the dedicated provider login", async () => {
  const response = await fetch(`${baseUrl}/factory/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Forget About Print Factory/);
  assert.match(html, /id="createFactoryAccount"/);
  assert.match(html, /src="\.\.\/account\.js"/);
});

test("factory Stripe Connect onboarding uses Accounts v2 and a hosted account link", async () => {
  const response = await api("/api/factory/connect/start", "paid-token", {}, { "X-Forget-About-Path": "/factory/" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: "https://connect.stripe.test/onboarding", mode: "onboarding" });
  assert.equal(stripeAccountRequests.length, 1);
  assert.equal(stripeAccountRequests[0].defaults.responsibilities.requirements_collector, undefined);
  assert.equal(stripeAccountRequests[0].configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested, true);
});

test("node host exposes a deployment health check", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "forget-about-platform" });
});

test("scheduled auto-complete task is protected by a task secret", async () => {
  const response = await fetch(`${baseUrl}/api/tasks/auto-complete-posted`, { method: "POST" });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /not authorized/i);
});

test("physical print checkout preserves the complete tray configuration", async () => {
  const config = {
    columns: 4,
    rows: 3,
    baseSize: 25,
    baseDepth: 25,
    gap: 1,
    clearance: 1,
    plateThickness: 2,
    lipEnabled: true,
    wallHeight: 3,
    wallThickness: 1.6,
    notchesEnabled: true,
    notchWidth: 7,
    includeBases: true
  };
  const response = await api("/api/checkout/session", "paid-token", { config, name: "Notched print order" });
  assert.equal(response.status, 200);
  assert.equal(orderItems.at(-1).tray_configuration.notchesEnabled, true);
  assert.equal(orderItems.at(-1).tray_configuration.notchWidth, 7);
  assert.equal(orderItems.at(-1).tray_configuration.includeBases, true);
});

test("marketplace quotes expose selectable providers and create held print jobs", async () => {
  const config = {
    columns: 2, rows: 2, baseSize: 25, baseDepth: 25, gap: 1, clearance: 1,
    plateThickness: 2, lipEnabled: true, wallHeight: 3, wallThickness: 1.6,
    notchesEnabled: false, notchWidth: 2
  };
  const quoteResponse = await api("/api/marketplace/quotes", "paid-token", { config, name: "Provider test tray" });
  assert.equal(quoteResponse.status, 200);
  const quoteResult = await quoteResponse.json();
  assert.equal(quoteResult.quotes.length, 1);
  assert.equal(quoteResult.quotes[0].providerName, "Prototype Printer");
  assert.ok(quoteResult.quotes[0].totalIncVatPence > quoteResult.quotes[0].providerSharePence);
  assert.equal(quoteResult.quotes[0].materialCostPence, quoteResult.quotes[0].estimatedWeightGrams * 2);
  assert.equal(quoteResult.quotes[0].providerSharePence, quoteResult.quotes[0].materialCostPence + quoteResult.quotes[0].printerFeePence + quoteResult.quotes[0].postagePence);
  assert.equal(quoteResult.quotes[0].commissionPence, Math.round(quoteResult.quotes[0].providerSharePence * 0.1));
  assert.equal(quoteResult.quotes[0].platformFeePence, 50);

  const checkoutResponse = await api("/api/marketplace/checkout/session", "paid-token", { quoteId: quoteResult.quotes[0].id });
  assert.equal(checkoutResponse.status, 200);
  assert.equal(printJobs.at(-1).status, "pending_payment");
  assert.equal(printJobs.at(-1).payout_status, "held");
  assert.equal(providerTransfers.at(-1).status, "held");
  assert.match(checkoutRequests.at(-1).get("payment_intent_data[transfer_group]"), /^PRINT_JOB_/);
});

test("paid marketplace print jobs progress through customer confirmation and payout release", async () => {
  const { metadata } = await createPaidMarketplacePrint("Lifecycle tray");
  const job = printJobs.find((row) => row.id === metadata.printJobId);
  const order = orders.find((row) => row.id === metadata.orderId);
  assert.equal(order.status, "paid");
  assert.equal(job.status, "order_made");
  assert.equal(job.payout_status, "held");
  assert.ok(printJobEvents.some((event) => event.print_job_id === job.id && event.to_status === "order_made"));

  const ordersResponse = await api("/api/account/orders", "paid-token");
  assert.equal(ordersResponse.status, 200);
  const accountOrders = await ordersResponse.json();
  assert.ok(accountOrders.some((row) => row.id === order.id && row.print_jobs.some((printJob) => printJob.id === job.id)));

  const producingResponse = await api(`/api/factory/jobs/${job.id}/status`, "paid-token", { status: "producing", note: "Starting the print." });
  assert.equal(producingResponse.status, 200);
  assert.equal(job.status, "producing");
  assert.ok(order.refund_locked_at);

  const postedResponse = await api(`/api/factory/jobs/${job.id}/status`, "paid-token", {
    status: "posted",
    trackingReference: "EVRI-TRACK-1",
    note: "Posted to the buyer."
  });
  assert.equal(postedResponse.status, 200);
  assert.equal(job.status, "posted");
  assert.equal(job.tracking_reference, "EVRI-TRACK-1");

  const customerMessageResponse = await api(`/api/account/print-jobs/${job.id}/message`, "paid-token", { note: "Thanks, looking forward to it." });
  assert.equal(customerMessageResponse.status, 200);
  assert.ok(printJobEvents.some((event) => event.print_job_id === job.id && event.event_type === "customer_message"));

  const existingPaymentAccount = paymentAccounts.find((account) => account.printer_profile_id === printerProfile.id);
  const readyAccount = {
    printer_profile_id: printerProfile.id,
    stripe_connected_account_id: "acct_test_factory_provider",
    transfers_enabled: true,
    payouts_enabled: true,
    onboarding_complete: true
  };
  if (existingPaymentAccount) Object.assign(existingPaymentAccount, readyAccount);
  else paymentAccounts.push({ id: "50000000-0000-4000-8000-000000000099", ...readyAccount });

  const completeResponse = await api(`/api/account/print-jobs/${job.id}/complete`, "paid-token", { rating: 5, reviewText: "Great print." });
  assert.equal(completeResponse.status, 200);
  const completion = await completeResponse.json();
  assert.equal(completion.transfer.released, true);
  assert.equal(job.status, "complete");
  assert.equal(job.payout_status, "transferred");
  assert.equal(providerTransfers.find((transfer) => transfer.print_job_id === job.id).status, "transferred");
  assert.equal(stripeTransfers.at(-1).parameters.get("destination"), "acct_test_factory_provider");
  assert.equal(stripeTransfers.at(-1).parameters.get("amount"), String(job.provider_share_pence));
  assert.equal(providerReviews.find((review) => review.print_job_id === job.id).rating, 5);
  assert.equal(printerProfile.rating_count, providerReviews.length);
});

test("posted jobs receive seven buyer chasers before automatic payout release", async () => {
  const { metadata } = await createPaidMarketplacePrint("Auto chaser tray");
  const job = printJobs.find((row) => row.id === metadata.printJobId);
  await api(`/api/factory/jobs/${job.id}/status`, "paid-token", { status: "producing", note: "Starting production." });
  await api(`/api/factory/jobs/${job.id}/status`, "paid-token", {
    status: "posted",
    trackingReference: "RM-CHASER-1",
    note: "Posted to the buyer."
  });
  const day = 24 * 60 * 60 * 1000;
  job.posted_at = new Date(Date.now() - 4 * day).toISOString();

  for (let index = 1; index <= 7; index += 1) {
    const response = await fetch(`${baseUrl}/api/tasks/auto-complete-posted`, {
      method: "POST",
      headers: { Authorization: "Bearer test-task-secret" }
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.chasers, 1);
    assert.equal(result.completed, 0);
    assert.equal(emailOutbox.filter((email) => email.print_job_id === job.id).length, index);
    const latestChaser = printJobEvents.filter((event) => event.print_job_id === job.id && event.event_type === "delivery_chaser").at(-1);
    assert.match(latestChaser.note, new RegExp(`${index}/7`));
    latestChaser.created_at = new Date(Date.now() - 2 * day).toISOString();
  }
  assert.equal(job.status, "posted");

  const readyAccount = {
    printer_profile_id: printerProfile.id,
    stripe_connected_account_id: "acct_test_factory_provider",
    transfers_enabled: true,
    payouts_enabled: true,
    onboarding_complete: true
  };
  const existingPaymentAccount = paymentAccounts.find((account) => account.printer_profile_id === printerProfile.id);
  if (existingPaymentAccount) Object.assign(existingPaymentAccount, readyAccount);
  else paymentAccounts.push({ id: "50000000-0000-4000-8000-000000000123", ...readyAccount });
  job.posted_at = new Date(Date.now() - 12 * day).toISOString();

  const releaseResponse = await fetch(`${baseUrl}/api/tasks/auto-complete-posted`, {
    method: "POST",
    headers: { Authorization: "Bearer test-task-secret" }
  });
  assert.equal(releaseResponse.status, 200);
  const release = await releaseResponse.json();
  assert.equal(release.chasers, 0);
  assert.equal(release.completed, 1);
  assert.equal(job.status, "complete");
  assert.equal(job.payout_status, "transferred");
  assert.ok(printJobEvents.some((event) => event.print_job_id === job.id && event.event_type === "auto_complete"));
});

test("buyer escalation prevents automatic payout release", async () => {
  const { metadata } = await createPaidMarketplacePrint("Escalated delivery tray");
  const job = printJobs.find((row) => row.id === metadata.printJobId);
  await api(`/api/factory/jobs/${job.id}/status`, "paid-token", { status: "producing", note: "Starting production." });
  await api(`/api/factory/jobs/${job.id}/status`, "paid-token", {
    status: "posted",
    trackingReference: "RM-ESC-1",
    note: "Posted to the buyer."
  });
  const day = 24 * 60 * 60 * 1000;
  job.posted_at = new Date(Date.now() - 12 * day).toISOString();
  for (let index = 1; index <= 7; index += 1) {
    printJobEvents.push({
      id: `manual-chaser-${index}`,
      print_job_id: job.id,
      actor_user_id: null,
      from_status: "posted",
      to_status: "posted",
      event_type: "delivery_chaser",
      note: `Delivery confirmation chaser ${index}/7 queued.`,
      created_at: new Date(Date.now() - (8 - index) * day).toISOString()
    });
  }

  const escalationResponse = await api(`/api/account/print-jobs/${job.id}/escalate`, "paid-token", { reason: "The package has not arrived." });
  assert.equal(escalationResponse.status, 200);
  assert.ok(printJobEvents.some((event) => event.print_job_id === job.id && event.event_type === "customer_escalation"));

  const releaseResponse = await fetch(`${baseUrl}/api/tasks/auto-complete-posted`, {
    method: "POST",
    headers: { Authorization: "Bearer test-task-secret" }
  });
  assert.equal(releaseResponse.status, 200);
  const release = await releaseResponse.json();
  assert.equal(release.completed, 0);
  assert.equal(release.chasers, 0);
  assert.equal(job.status, "posted");
  assert.equal(job.payout_status, "held");
});

test("providers can decline paid jobs before production and trigger a buyer refund", async () => {
  const { metadata } = await createPaidMarketplacePrint("Decline test tray");
  const job = printJobs.find((row) => row.id === metadata.printJobId);
  const order = orders.find((row) => row.id === metadata.orderId);
  assert.equal(job.status, "order_made");
  assert.equal(order.status, "paid");

  const declineResponse = await api(`/api/factory/jobs/${job.id}/decline`, "paid-token", { reason: "Printer unavailable." });
  assert.equal(declineResponse.status, 200);
  const decline = await declineResponse.json();
  assert.equal(decline.declined, true);
  assert.equal(job.status, "refunded");
  assert.equal(job.payout_status, "reversed");
  assert.equal(order.status, "refunded");
  assert.equal(providerTransfers.find((transfer) => transfer.print_job_id === job.id).status, "reversed");
  assert.equal(refundRequests.at(-1).parameters.get("payment_intent"), order.stripe_payment_intent_id);
  assert.ok(printJobEvents.some((event) => event.print_job_id === job.id && event.event_type === "decline"));
});

test("uploaded STL files are stored privately and can be reloaded by the owner", async () => {
  const stl = "solid storage\nendsolid storage\n";
  const uploadResponse = await api("/api/account/stl-upload", "paid-token", {
    fileName: "Storage Test.stl",
    stlBase64: Buffer.from(stl).toString("base64")
  });
  assert.equal(uploadResponse.status, 200);
  const upload = await uploadResponse.json();
  assert.equal(upload.bucket, "user-stl-uploads");
  assert.equal(upload.storageProvider, "supabase-storage");
  assert.match(upload.path, new RegExp(`^${paidUserId}/`));
  assert.equal(upload.sizeBytes, Buffer.byteLength(stl));
  assert.equal(storageObjects.get(upload.path).bytes.toString(), stl);

  const downloadResponse = await fetch(`${baseUrl}/api/account/stl-upload?path=${encodeURIComponent(upload.path)}`, {
    headers: { Authorization: "Bearer paid-token" }
  });
  assert.equal(downloadResponse.status, 200);
  assert.match(downloadResponse.headers.get("content-type"), /model\/stl/);
  assert.equal(await downloadResponse.text(), stl);

  const blockedResponse = await fetch(`${baseUrl}/api/account/stl-upload?path=${encodeURIComponent(`${freeUserId}/storage-test.stl`)}`, {
    headers: { Authorization: "Bearer paid-token" }
  });
  assert.equal(blockedResponse.status, 403);
});

test("account data export returns portable records with retention boundaries", async () => {
  designs.push({
    id: "80000000-0000-4000-8000-000000000001",
    user_id: paidUserId,
    brand_key: "tray",
    generator_type: "movement_tray",
    name: "Saved tray",
    parameters: { columns: 4, rows: 3 }
  });
  projects.push({
    id: "80000000-0000-4000-8000-000000000002",
    user_id: paidUserId,
    brand_key: "tray",
    generator_type: "movement_tray",
    project_type: "army_list",
    name: "Saved army",
    items: [{ name: "Unit", count: 20 }]
  });
  const { metadata } = await createPaidMarketplacePrint("Data export tray");

  const deletionResponse = await api("/api/account/deletion-request", "paid-token", {});
  assert.equal(deletionResponse.status, 200);

  const response = await fetch(`${baseUrl}/api/account/data-export`, { headers: { Authorization: "Bearer paid-token" } });
  assert.equal(response.status, 200);
  const exportData = await response.json();
  assert.equal(exportData.exportFormat, "forget-about-account-data.v1");
  assert.match(exportData.retentionNotice, /VAT/);
  assert.equal(exportData.account.email, "paid@example.test");
  assert.ok(exportData.designs.some((design) => design.name === "Saved tray"));
  assert.ok(exportData.projects.some((project) => project.name === "Saved army"));
  assert.ok(exportData.orders.some((order) => order.id === metadata.orderId && order.order_customer_snapshots.length));
  assert.ok(exportData.retainedOrderRecords.some((record) => record.id === metadata.orderId && "retentionUntil" in record));
  assert.ok(exportData.privacyRequests.some((request) => request.request_type === "account_deletion"));
});

test("account security status reports active devices without exposing device hashes", async () => {
  const deviceHash = "a".repeat(64);
  const response = await api("/api/account/security-status", "paid-token", undefined, { "X-Forget-About-Device": deviceHash });
  assert.equal(response.status, 200);
  const security = await response.json();
  assert.equal(security.deviceLimit, 3);
  assert.equal(security.enforcementEnabled, false);
  assert.equal(security.activeDeviceCount, 1);
  assert.equal(security.currentDeviceRegistered, true);
  assert.equal(security.sharingWarning, false);
  assert.equal(security.devices[0].current, true);
  assert.equal(JSON.stringify(security).includes(deviceHash), false);
});

test("checkout returns to the originating brand path", async () => {
  const config = {
    columns: 2, rows: 2, baseSize: 25, baseDepth: 25, gap: 1, clearance: 1,
    plateThickness: 2, lipEnabled: true, wallHeight: 3, wallThickness: 1.6,
    notchesEnabled: false, notchWidth: 2
  };
  const response = await api("/api/checkout/session", "paid-token", { config, name: "Brand path tray" }, {
    "X-Forget-About-Brand": "tray",
    "X-Forget-About-Generator": "movement_tray",
    "X-Forget-About-Path": "/tray"
  });
  assert.equal(response.status, 200);
  assert.match(checkoutRequests.at(-1).get("success_url"), /^http:\/\/127\.0\.0\.1:4192\/tray\?checkout=success/);
});

test("Stripe webhook accepts a valid signed checkout confirmation", async () => {
  const event = {
    id: "evt_signed_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_signed_checkout",
        payment_status: "paid",
        amount_total: 1200,
        created: Math.floor(Date.now() / 1000),
        metadata: { order_id: "40000000-0000-4000-8000-000000000001", user_id: paidUserId, purchase_type: "printed_design" },
        customer_details: { email: "paid@example.test", address: { country: "GB" } }
      }
    }
  };
  const rawBody = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    body: rawBody
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
});

test("only one simultaneous sponsored-download claim succeeds", async () => {
  const config = {
    columns: 2,
    rows: 2,
    baseSize: 25,
    baseDepth: 25,
    gap: 1,
    clearance: 1,
    plateThickness: 2,
    lipEnabled: true,
    wallHeight: 3,
    wallThickness: 1.6,
    notchesEnabled: false,
    notchWidth: 2
  };
  const responses = await Promise.all([
    api("/api/account/use-free-export", "concurrent-token", { config, name: "Concurrent tray" }),
    api("/api/account/use-free-export", "concurrent-token", { config, name: "Concurrent tray" })
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
});
