import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
const orderItems = [];
const checkoutRequests = [];
const printQuotes = [];
const printJobs = [];
const providerTransfers = [];
const printerProfile = {
  id: "10000000-0000-4000-8000-000000000001",
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

const mockSupabase = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${mockPort}`);
  if (url.pathname === "/v1/checkout/sessions") {
    let body = "";
    for await (const chunk of request) body += chunk;
    checkoutRequests.push(new URLSearchParams(body));
    return sendJson(response, 200, { id: `cs_test_${Date.now()}`, url: "https://checkout.stripe.test/session" });
  }
  if (url.pathname === "/auth/v1/user") {
    const user = userFromToken(request.headers.authorization);
    return sendJson(response, user ? 200 : 401, user || { message: "invalid token" });
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
    return sendJson(response, 200, [{ free_export_used: profiles.get(userId) || false }]);
  }

  if (url.pathname === "/rest/v1/entitlements") {
    const userId = url.searchParams.get("user_id")?.replace("eq.", "");
    return sendJson(response, 200, userId === paidUserId ? [{ id: "paid-entitlement" }] : []);
  }

  if (url.pathname === "/rest/v1/printer_profiles") {
    return sendJson(response, 200, [printerProfile]);
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

  if (url.pathname === "/rest/v1/print_jobs" && request.method === "POST") {
    printJobs.push(await requestJson(request));
    return sendJson(response, 200, {});
  }

  if (url.pathname === "/rest/v1/provider_transfers" && request.method === "POST") {
    providerTransfers.push(await requestJson(request));
    return sendJson(response, 200, {});
  }

  if (url.pathname === "/rest/v1/orders" && request.method === "POST") {
    await requestJson(request);
    return sendJson(response, 200, {});
  }

  if (url.pathname === "/rest/v1/order_items" && request.method === "POST") {
    orderItems.push(await requestJson(request));
    return sendJson(response, 200, {});
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
      STRIPE_SECRET_KEY: "rk_test_abcdefghijklmnopqrstuvwxyz123456",
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
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(html, /id="chooseUnlockedExport"[\s\S]*?<strong>Download STL<\/strong>/);
  assert.match(html, /id="choosePrintOrder"[\s\S]*?<strong>Have it printed<\/strong>/);
  assert.match(appSource, /document\.getElementById\("chooseUnlockedExport"\)\.hidden = !unlimited/);
  assert.doesNotMatch(appSource, /document\.getElementById\("choosePrintOrder"\)\.hidden/);
});

test("enabled brand route serves the shared app shell", async () => {
  const response = await fetch(`${baseUrl}/tray`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<script src="platform\.js"><\/script>/);
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

test("node host exposes a deployment health check", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "forget-about-platform" });
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

  const checkoutResponse = await api("/api/marketplace/checkout/session", "paid-token", { quoteId: quoteResult.quotes[0].id });
  assert.equal(checkoutResponse.status, 200);
  assert.equal(printJobs.at(-1).status, "pending_payment");
  assert.equal(printJobs.at(-1).payout_status, "held");
  assert.equal(providerTransfers.at(-1).status, "held");
  assert.match(checkoutRequests.at(-1).get("payment_intent_data[transfer_group]"), /^PRINT_JOB_/);
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
