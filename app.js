const defaults = {
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
  notchWidth: 2
};

const numericKeys = [
  "columns", "rows", "baseSize", "baseDepth", "gap", "clearance", "plateThickness",
  "wallHeight", "wallThickness", "notchWidth"
];
const checkboxKeys = ["lipEnabled", "notchesEnabled"];
const inputs = Object.fromEntries([...numericKeys, ...checkboxKeys].map((key) => [key, document.getElementById(key)]));
let state = { ...defaults };
let armyRecommendations = [];
let activeArmyRecommendationId = "";
let armyEditingId = "";
let armyEditOriginalState = null;
let armyParseReport = { lines: 0, candidates: 0 };
let pendingExportConfig = null;
let pendingExportPrefix = "";
let adCountdownTimer = null;
let toastTimer;
let unlimitedExportsVerified = false;
const freeExportUsedKey = "movement-tray-free-export-used";
const downloadEntitlementKey = "movement-tray-download-entitlement";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function readState() {
  numericKeys.forEach((key) => {
    const input = inputs[key];
    state[key] = clamp(Number(input.value) || defaults[key], Number(input.min), Number(input.max));
    input.value = state[key];
  });
  checkboxKeys.forEach((key) => { state[key] = inputs[key].checked; });
}

function writeState(nextState) {
  state = { ...defaults, ...nextState };
  numericKeys.forEach((key) => { inputs[key].value = state[key]; });
  checkboxKeys.forEach((key) => { inputs[key].checked = state[key]; });
  render();
}

function trayMetrics(config = state) {
  config = { ...defaults, ...config };
  const innerWidth = config.columns * config.baseSize + (config.columns - 1) * config.gap + config.clearance * 2;
  const innerDepth = config.rows * config.baseDepth + (config.rows - 1) * config.gap + config.clearance * 2;
  const wall = config.lipEnabled ? config.wallThickness : 0;
  const outerWidth = innerWidth + wall * 2;
  const outerDepth = innerDepth + wall * 2;
  const height = config.plateThickness + (config.lipEnabled ? config.wallHeight : 0);
  const boxes = buildBoxes(config);
  const volume = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0);
  return { innerWidth, innerDepth, outerWidth, outerDepth, height, boxes, volume };
}

function buildBoxes(config = state) {
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

  const horizontalSegments = segmentSpans(config.columns, config.baseSize, config.gap, config.clearance, notch);
  horizontalSegments.forEach(({ start, length }) => {
    boxes.push({ x: wall + start, y: 0, z, w: length, d: wall, h });
    boxes.push({ x: wall + start, y: outerDepth - wall, z, w: length, d: wall, h });
  });

  const verticalSegments = segmentSpans(config.rows, config.baseDepth, config.gap, config.clearance, notch);
  verticalSegments.forEach(({ start, length }) => {
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

function render() {
  readState();
  const metrics = trayMetrics();
  document.getElementById("columnsOutput").textContent = state.columns;
  document.getElementById("rowsOutput").textContent = state.rows;
  document.getElementById("unitCount").textContent = `${state.columns * state.rows} models`;
  document.getElementById("widthLabel").textContent = `${metrics.outerWidth.toFixed(1)} mm`;
  document.getElementById("depthLabel").textContent = `${metrics.outerDepth.toFixed(1)} mm`;
  document.getElementById("outerSize").textContent = `${metrics.outerWidth.toFixed(1)} × ${metrics.outerDepth.toFixed(1)} mm`;
  document.getElementById("totalHeight").textContent = `${metrics.height.toFixed(1)} mm`;
  document.getElementById("materialEstimate").textContent = `${(metrics.volume / 1000).toFixed(1)} cm³`;
  document.getElementById("bodyCount").textContent = metrics.boxes.length;
  document.getElementById("exportFilename").textContent = fileName();
  document.getElementById("lipFields").classList.toggle("disabled", !state.lipEnabled);
  document.querySelectorAll("[data-base]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.base) === state.baseSize && state.baseSize === state.baseDepth);
  });
  drawPreview(metrics);
}

function drawPreview(metrics) {
  const svg = document.getElementById("trayPreview");
  const maxDimension = Math.max(metrics.outerWidth, metrics.outerDepth);
  const scale = 410 / maxDimension;
  const originX = 370;
  const originY = 120;
  const heightScale = 7;
  const project = (x, y, z = 0) => [
    originX + (x - y) * scale * 0.78,
    originY + (x + y) * scale * 0.38 - z * heightScale
  ];
  const points = (values) => values.map(([x, y, z]) => project(x, y, z).join(",")).join(" ");
  const w = metrics.outerWidth;
  const d = metrics.outerDepth;
  const base = state.plateThickness;
  const top = metrics.height;
  let markup = `
    <defs>
      <linearGradient id="trayTop" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#b9d27e"/><stop offset="1" stop-color="#668b55"/></linearGradient>
      <linearGradient id="traySide" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#507348"/><stop offset="1" stop-color="#345037"/></linearGradient>
      <linearGradient id="trayFront" x1="0" x2="1"><stop offset="0" stop-color="#3f6042"/><stop offset="1" stop-color="#71945b"/></linearGradient>
    </defs>
    <polygon points="${points([[0,d,0],[w,d,0],[w,d,base],[0,d,base]])}" fill="url(#trayFront)" stroke="#42552a" stroke-width="1.2"/>
    <polygon points="${points([[w,0,0],[w,d,0],[w,d,base],[w,0,base]])}" fill="url(#traySide)" stroke="#42552a" stroke-width="1.2"/>
    <polygon points="${points([[0,0,base],[w,0,base],[w,d,base],[0,d,base]])}" fill="url(#trayTop)" stroke="#42552a" stroke-width="1.2"/>
  `;

  const wall = state.lipEnabled ? state.wallThickness : 0;
  const xStart = wall + state.clearance;
  const yStart = wall + state.clearance;
  for (let column = 1; column < state.columns; column += 1) {
    const x = xStart + column * state.baseSize + (column - 0.5) * state.gap;
    markup += `<line x1="${project(x, wall, base)[0]}" y1="${project(x, wall, base)[1]}" x2="${project(x, d-wall, base)[0]}" y2="${project(x, d-wall, base)[1]}" stroke="#456846" stroke-width="0.8" stroke-dasharray="3 4" opacity=".55"/>`;
  }
  for (let row = 1; row < state.rows; row += 1) {
    const y = yStart + row * state.baseDepth + (row - 0.5) * state.gap;
    markup += `<line x1="${project(wall, y, base)[0]}" y1="${project(wall, y, base)[1]}" x2="${project(w-wall, y, base)[0]}" y2="${project(w-wall, y, base)[1]}" stroke="#456846" stroke-width="0.8" stroke-dasharray="3 4" opacity=".55"/>`;
  }

  if (state.lipEnabled) {
    const wallBoxes = metrics.boxes.slice(1);
    wallBoxes.forEach((box) => {
      const x1 = box.x;
      const y1 = box.y;
      const x2 = box.x + box.w;
      const y2 = box.y + box.d;
      markup += `
        <polygon points="${points([[x1,y1,top],[x2,y1,top],[x2,y2,top],[x1,y2,top]])}" fill="#89aa65" stroke="#2d4932" stroke-width="1"/>
        <polygon points="${points([[x1,y2,base],[x2,y2,base],[x2,y2,top],[x1,y2,top]])}" fill="#5c7e50" stroke="#2d4932" stroke-width=".8"/>
        <polygon points="${points([[x2,y1,base],[x2,y2,base],[x2,y2,top],[x2,y1,top]])}" fill="#496b48" stroke="#2d4932" stroke-width=".8"/>
      `;
    });
  }
  svg.innerHTML = markup;
}

function fileName(config = state, prefix = "movement-tray") {
  const base = config.baseSize === config.baseDepth
    ? `${formatNumber(config.baseSize)}mm`
    : `${formatNumber(config.baseSize)}x${formatNumber(config.baseDepth)}mm`;
  return `${slugify(prefix)}-${config.columns}x${config.rows}-${base}.stl`;
}

function formatNumber(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "").replace(".", "-");
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "movement-tray";
}

function boxTriangles({ x, y, z, w, d, h }) {
  const p = [
    [x,y,z], [x+w,y,z], [x+w,y+d,z], [x,y+d,z],
    [x,y,z+h], [x+w,y,z+h], [x+w,y+d,z+h], [x,y+d,z+h]
  ];
  return [
    [p[0],p[2],p[1]], [p[0],p[3],p[2]],
    [p[4],p[5],p[6]], [p[4],p[6],p[7]],
    [p[0],p[1],p[5]], [p[0],p[5],p[4]],
    [p[1],p[2],p[6]], [p[1],p[6],p[5]],
    [p[2],p[3],p[7]], [p[2],p[7],p[6]],
    [p[3],p[0],p[4]], [p[3],p[4],p[7]]
  ];
}

function normal([a, b, c]) {
  const u = b.map((value, index) => value - a[index]);
  const v = c.map((value, index) => value - a[index]);
  const cross = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0]
  ];
  const length = Math.hypot(...cross) || 1;
  return cross.map((value) => value / length);
}

function stlText(config = state) {
  const triangles = trayMetrics(config).boxes.flatMap(boxTriangles);
  const facets = triangles.map((triangle) => {
    const n = normal(triangle);
    return `  facet normal ${n.join(" ")}\n    outer loop\n${triangle.map((vertex) => `      vertex ${vertex.join(" ")}`).join("\n")}\n    endloop\n  endfacet`;
  }).join("\n");
  return `solid movement_tray\n${facets}\nendsolid movement_tray\n`;
}

function exportStl(config = state, prefix = "movement-tray") {
  const blob = new Blob([stlText(config)], { type: "model/stl" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName(config, prefix);
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`${link.download} exported`);
}

function freeExportUsed() {
  return localStorage.getItem(freeExportUsedKey) === "true";
}

async function hasUnlimitedExports() {
  if (unlimitedExportsVerified) return true;
  const entitlement = localStorage.getItem(downloadEntitlementKey);
  if (!entitlement) return false;
  try {
    const response = await fetch(checkoutApiUrl("/api/checkout/unlock/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entitlement })
    });
    if (!response.ok) return false;
    const result = await response.json();
    unlimitedExportsVerified = Boolean(result.unlocked);
    if (!unlimitedExportsVerified) localStorage.removeItem(downloadEntitlementKey);
    return unlimitedExportsVerified;
  } catch {
    return false;
  }
}

async function requestExport(config = state, prefix = "movement-tray") {
  pendingExportConfig = { ...config };
  pendingExportPrefix = prefix;
  if (await hasUnlimitedExports()) {
    exportStl(pendingExportConfig, pendingExportPrefix);
    return;
  }
  clearInterval(adCountdownTimer);
  document.getElementById("exportDialogTitle").textContent = fileName(config, prefix);
  document.getElementById("exportChoices").hidden = false;
  document.getElementById("chooseAdExport").hidden = freeExportUsed();
  document.getElementById("adGate").hidden = true;
  document.getElementById("unlockExports").hidden = true;
  document.getElementById("printOrder").hidden = true;
  document.getElementById("exportDialog").showModal();
}

function startAdGate() {
  let seconds = 30;
  const countdown = document.getElementById("adCountdown");
  const download = document.getElementById("completeAdExport");
  document.getElementById("exportChoices").hidden = true;
  document.getElementById("adGate").hidden = false;
  download.disabled = true;
  countdown.textContent = `Download unlocks in ${seconds} seconds`;
  clearInterval(adCountdownTimer);
  adCountdownTimer = setInterval(() => {
    seconds -= 1;
    countdown.textContent = seconds > 0 ? `Download unlocks in ${seconds} seconds` : "Your STL is ready";
    if (seconds <= 0) {
      clearInterval(adCountdownTimer);
      download.disabled = false;
    }
  }, 1000);
}

function showPrintOrder() {
  const metrics = trayMetrics(pendingExportConfig);
  document.getElementById("exportChoices").hidden = true;
  document.getElementById("unlockExports").hidden = true;
  document.getElementById("printOrder").hidden = false;
  document.getElementById("printOrderSummary").innerHTML = `
    <div><dt>Tray</dt><dd>${pendingExportConfig.columns} x ${pendingExportConfig.rows}</dd></div>
    <div><dt>Base</dt><dd>${pendingExportConfig.baseSize} x ${pendingExportConfig.baseDepth} mm</dd></div>
    <div><dt>Outer size</dt><dd>${metrics.outerWidth.toFixed(1)} x ${metrics.outerDepth.toFixed(1)} mm</dd></div>
  `;
  configureStripeCheckout();
}

function showUnlockExports() {
  document.getElementById("exportChoices").hidden = true;
  document.getElementById("printOrder").hidden = true;
  document.getElementById("unlockExports").hidden = false;
  configureUnlockCheckout();
}

function checkoutApiBase() {
  return document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "");
}

function checkoutApiUrl(path) {
  return `${checkoutApiBase()}${path}`;
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

async function configureStripeCheckout() {
  const button = document.getElementById("stripeCheckoutButton");
  const status = document.getElementById("stripeCheckoutStatus");
  button.disabled = true;
  status.textContent = "Checking Stripe configuration...";
  try {
    const [configResponse, quoteResponse] = await Promise.all([
      fetch(checkoutApiUrl("/api/checkout/config")),
      fetch(checkoutApiUrl("/api/checkout/quote"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: pendingExportConfig })
      })
    ]);
    if (!configResponse.ok || !quoteResponse.ok) throw new Error("Stripe checkout backend is not available.");
    const config = await configResponse.json();
    const quote = await quoteResponse.json();
    document.getElementById("printOrderSummary").insertAdjacentHTML("beforeend", `<div><dt>Estimated price</dt><dd>${formatMoney(quote.amount, quote.currency)}</dd></div>`);
    if (!config.enabled) throw new Error(config.reason || "Stripe is not configured.");
    button.disabled = false;
    status.textContent = `${config.mode === "test" ? "Stripe test mode" : "Stripe live mode"} - final price confirmed at checkout.`;
  } catch (error) {
    status.textContent = `${error.message} Deploy a secure Node checkout backend and set checkout-api-url when using GitHub Pages.`;
  }
}

async function beginStripeCheckout() {
  const button = document.getElementById("stripeCheckoutButton");
  const status = document.getElementById("stripeCheckoutStatus");
  button.disabled = true;
  status.textContent = "Creating secure Stripe Checkout...";
  try {
    const response = await fetch(checkoutApiUrl("/api/checkout/session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: pendingExportConfig, name: pendingExportPrefix || "Printed movement tray" })
    });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || "Stripe Checkout could not be created.");
    window.location.assign(result.url);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function configureUnlockCheckout() {
  const button = document.getElementById("unlockCheckoutButton");
  const status = document.getElementById("unlockCheckoutStatus");
  button.disabled = true;
  status.textContent = "Checking Stripe configuration...";
  try {
    const response = await fetch(checkoutApiUrl("/api/checkout/config"));
    if (!response.ok) throw new Error("Stripe checkout backend is not available.");
    const config = await response.json();
    document.getElementById("unlockExportsPrice").textContent = formatMoney(config.unlimitedExportsPrice, config.currency);
    if (!config.enabled) throw new Error(config.reason || "Stripe is not configured.");
    button.disabled = false;
    status.textContent = `${config.mode === "test" ? "Stripe test mode" : "Stripe live mode"} - one payment unlocks this browser.`;
  } catch (error) {
    status.textContent = `${error.message} Open the checkout-enabled version of the site to purchase.`;
  }
}

async function beginUnlockCheckout() {
  const button = document.getElementById("unlockCheckoutButton");
  const status = document.getElementById("unlockCheckoutStatus");
  button.disabled = true;
  status.textContent = "Creating secure Stripe Checkout...";
  try {
    const response = await fetch(checkoutApiUrl("/api/checkout/unlock/session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || "Stripe Checkout could not be created.");
    window.location.assign(result.url);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function verifyUnlockPurchase(sessionId) {
  try {
    const response = await fetch(checkoutApiUrl("/api/checkout/unlock/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });
    const result = await response.json();
    if (!response.ok || !result.unlocked || !result.entitlement) throw new Error(result.error || "Stripe could not confirm the purchase.");
    localStorage.setItem(downloadEntitlementKey, result.entitlement);
    unlimitedExportsVerified = true;
    showToast("Unlimited STL exports unlocked in this browser.");
  } catch (error) {
    showToast(error.message);
  } finally {
    history.replaceState({}, "", window.location.pathname);
  }
}

function presets() {
  try {
    return JSON.parse(localStorage.getItem("movement-tray-presets")) || [];
  } catch {
    return [];
  }
}

function savePreset() {
  const saved = presets();
  const name = `${state.columns} × ${state.rows} · ${state.baseSize}mm`;
  const id = `${Date.now()}`;
  saved.unshift({ id, name, state: { ...state } });
  localStorage.setItem("movement-tray-presets", JSON.stringify(saved.slice(0, 12)));
  renderPresets();
  showToast(`${name} preset saved`);
}

function renderPresets() {
  const container = document.getElementById("presets");
  const saved = presets();
  if (!saved.length) {
    container.innerHTML = `<div class="empty-presets">Your saved tray configurations will appear here.</div>`;
    return;
  }
  container.innerHTML = saved.map((preset) => {
    const metric = trayMetrics(preset.state);
    return `
      <article class="preset-card">
        <div><h3>${preset.name}</h3><p>${metric.outerWidth.toFixed(1)} × ${metric.outerDepth.toFixed(1)} mm · ${preset.state.lipEnabled ? "lipped" : "flat"}</p></div>
        <div class="preset-actions">
          <button type="button" data-load="${preset.id}">Load</button>
          <button type="button" data-delete="${preset.id}">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

const baseCatalogue = [
  { id: "ungor-raiders", name: "Ungor Raiders", width: 25, depth: 25, aliases: ["ungor raiders", "ungor raider"] },
  { id: "ungor-herds", name: "Ungor Herds", width: 25, depth: 25, aliases: ["ungor herds", "ungor herd", "ungors"] },
  { id: "gor-herds", name: "Gor Herds", width: 25, depth: 25, aliases: ["gor herds", "gor herd", "gors"] },
  { id: "bestigor-herds", name: "Bestigor Herds", width: 30, depth: 30, aliases: ["bestigor herds", "bestigor herd", "bestigors", "bestigor"] },
  { id: "minotaur-herds", name: "Minotaur Herds", width: 50, depth: 50, aliases: ["minotaur herds", "minotaur herd", "minotaurs", "minotaur"] },
  { id: "chaos-warhounds", name: "Chaos Warhounds", width: 25, depth: 50, aliases: ["chaos warhounds", "chaos warhound", "warhounds"] },
  { id: "centigor-herds", name: "Centigor Herds", width: 30, depth: 60, aliases: ["centigor herds", "centigor herd", "centigors", "centigor"] },
  { id: "dragon-ogres", name: "Dragon Ogres", width: 50, depth: 75, aliases: ["dragon ogres", "dragon ogre"] },
  { id: "razorgor-herds", name: "Razorgor Herds", width: 50, depth: 75, aliases: ["razorgor herds", "razorgor herd", "razorgors"] },
  { id: "beastmen-chariots", name: "Beastmen Chariots", width: 50, depth: 100, aliases: ["beastmen chariots", "beastmen chariot", "tuskgor chariots", "tuskgor chariot"] },
  { id: "razorgor-chariots", name: "Razorgor Chariots", width: 50, depth: 100, aliases: ["razorgor chariots", "razorgor chariot"] },
  { id: "chracian-woodsmen", name: "Chracian Woodsmen", width: 25, depth: 25, aliases: ["chracian woodsmen", "chracian woodsman"] },
  { id: "white-lions-of-chrace", name: "White Lions of Chrace", width: 25, depth: 25, aliases: ["white lions of chrace", "white lion of chrace", "white lions"] },
  { id: "war-lions", name: "War Lions", width: 30, depth: 60, aliases: ["war lions", "war lion"] },
  { id: "lion-guard", name: "Lion Guard", width: 25, depth: 25, aliases: ["lion guard"] },
  { id: "lion-chariot-of-chrace", name: "Lion Chariot of Chrace", width: 50, depth: 100, aliases: ["lion chariot of chrace", "lion chariots of chrace"] }
];

function customCatalogue() {
  try {
    return JSON.parse(localStorage.getItem("movement-tray-custom-catalogue")) || [];
  } catch {
    return [];
  }
}

function allCatalogueEntries() {
  const learned = Object.entries(learnedBases()).map(([key, entry]) => ({
    id: `learned-${key}`,
    name: entry.name,
    width: entry.width,
    depth: entry.depth,
    aliases: [key]
  }));
  const entries = [...baseCatalogue, ...customCatalogue(), ...learned];
  return entries.filter((entry, index) => entries.findIndex((candidate) => normalizeText(candidate.name) === normalizeText(entry.name)) === index);
}

function armyProjects() {
  try {
    return JSON.parse(localStorage.getItem("movement-tray-army-projects")) || [];
  } catch {
    return [];
  }
}

function addCatalogueRecommendation(entry, count) {
  const formation = recommendFormation(count);
  const id = `manual-${entry.id}-${Date.now()}`;
  armyRecommendations.push({
    id,
    name: entry.name,
    count,
    copies: 1,
    columns: formation.columns,
    rows: formation.rows,
    baseSize: entry.width,
    baseDepth: entry.depth,
    matched: true
  });
  activeArmyRecommendationId = id;
  armyEditingId = "";
  renderArmyRecommendations();
  showToast(`${entry.name} added to this army`);
}

function renderCatalogue(filter = "") {
  const query = normalizeText(filter);
  const entries = allCatalogueEntries().filter((entry) => normalizeText(entry.name).includes(query));
  document.getElementById("catalogueList").innerHTML = entries.map((entry) => `
    <article class="catalogue-entry" data-catalogue-id="${escapeHtml(entry.id)}">
      <div><strong>${escapeHtml(entry.name)}</strong><small>${entry.width} x ${entry.depth} mm</small></div>
      <input type="number" min="2" max="500" value="10" aria-label="Model count for ${escapeHtml(entry.name)}">
      <button type="button">Add</button>
    </article>
  `).join("") || `<div class="dialog-empty">No matching catalogue entries.</div>`;
}

function saveArmyProject() {
  if (!armyRecommendations.length) {
    showToast("Add or parse some trays before saving");
    return;
  }
  const saved = armyProjects();
  const name = document.getElementById("armyProjectName").value.trim() || `Army project ${saved.length + 1}`;
  const existing = saved.findIndex((project) => project.name.toLowerCase() === name.toLowerCase());
  const project = {
    id: existing >= 0 ? saved[existing].id : `${Date.now()}`,
    name,
    listText: document.getElementById("armyList").value,
    recommendations: structuredClone(armyRecommendations)
  };
  if (existing >= 0) saved.splice(existing, 1);
  saved.unshift(project);
  localStorage.setItem("movement-tray-army-projects", JSON.stringify(saved.slice(0, 20)));
  document.getElementById("armyProjectName").value = name;
  showToast(`${name} saved`);
}

function renderSavedArmies() {
  const saved = armyProjects();
  document.getElementById("savedArmiesList").innerHTML = saved.length ? saved.map((project) => `
    <article data-army-project="${project.id}">
      <div><strong>${escapeHtml(project.name)}</strong><small>${project.recommendations.length} tray types</small></div>
      <button type="button" data-project-action="load">Load</button>
      <button type="button" data-project-action="delete">Delete</button>
    </article>
  `).join("") : `<div class="dialog-empty">No saved army projects yet.</div>`;
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function recommendFormation(count) {
  let best = { columns: Math.min(count, 12), rows: 1, score: Infinity };
  for (let columns = 1; columns <= 12; columns += 1) {
    for (let rows = 1; rows <= 12; rows += 1) {
      const capacity = columns * rows;
      if (capacity < count || columns < rows) continue;
      const empty = capacity - count;
      const ratio = columns / rows;
      const score = empty * 20 + Math.abs(ratio - 1.25) * 2 + (rows === 1 ? 8 : 0) + Math.abs(columns - 5) * 0.15;
      if (score < best.score) best = { columns, rows, score };
    }
  }
  return { columns: best.columns, rows: best.rows };
}

function quantityFromLine(line, alias = "") {
  const normalized = normalizeText(line);
  const leading = normalized.match(/^(\d{1,3})\s*x?\s+/);
  if (!alias) return leading ? Number(leading[1]) : 0;
  const aliasIndex = alias ? normalized.indexOf(alias) : normalized.length;
  const beforeAlias = normalized.slice(0, Math.max(0, aliasIndex));
  const beforeMatches = [...beforeAlias.matchAll(/\b(\d{1,3})\s*x?\b/g)];
  if (beforeMatches.length) return Number(beforeMatches.at(-1)[1]);
  const rawAliasIndex = line.toLowerCase().indexOf(alias);
  const afterAlias = rawAliasIndex >= 0 ? line.slice(rawAliasIndex + alias.length) : "";
  const afterPatterns = [
    /^\s*(?:x|:|-)?\s*[\[(]\s*(\d{1,3})\s*[\])]/i,
    /^\s*(?:x|:|-)\s*(\d{1,3})\b/i,
    /^\s+(\d{1,3})\s*(?:models?|strong)?\b/i,
    /\b(?:models?|unit size|quantity|qty)\s*[:x-]?\s*(\d{1,3})\b/i
  ];
  for (const pattern of afterPatterns) {
    const match = afterAlias.match(pattern);
    if (match) {
      const remainder = afterAlias.slice(match[0].length);
      if (/^\s*(?:pts?|points?)\b/i.test(remainder)) continue;
      return Number(match[1]);
    }
  }
  return leading ? Number(leading[1]) : 0;
}

function unknownNameFromLine(line) {
  return line
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^\d{1,3}\s*[xX]?\s+/, "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
    .replace(/\s+[-:]\s+\d+\s*(pts?|points?).*$/i, "")
    .replace(/\s+\d+\s*(pts?|points?).*$/i, "")
    .trim();
}

function firstPlausibleQuantity(line) {
  const withoutPoints = line
    .replace(/\b\d[\d,]*\s*(?:pts?|points?)\b/gi, "")
    .replace(/\[\s*\d[\d,]*\s*(?:pts?|points?)?[^\]]*\]/gi, "");
  const patterns = [
    /^\s*[+\-*•]?\s*(\d{1,3})\s*x?\s+/i,
    /[\[(]\s*(\d{1,3})\s*[\])]/,
    /\b(?:models?|unit size|quantity|qty)\s*[:x-]?\s*(\d{1,3})\b/i,
    /\s[-:]\s*(\d{1,3})\s*$/
  ];
  for (const pattern of patterns) {
    const match = withoutPoints.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
}

function learnedBases() {
  try {
    return JSON.parse(localStorage.getItem("movement-tray-unit-bases")) || {};
  } catch {
    return {};
  }
}

function rememberUnitBase(recommendation) {
  if (recommendation.baseSize <= 0 || recommendation.baseDepth <= 0) return;
  const learned = learnedBases();
  learned[normalizeText(recommendation.name)] = {
    name: recommendation.name,
    width: recommendation.baseSize,
    depth: recommendation.baseDepth
  };
  localStorage.setItem("movement-tray-unit-bases", JSON.stringify(learned));
}

function parseArmyList(text) {
  const found = new Map();
  const learned = learnedBases();
  const ignoredNames = new Set(["points", "models", "core", "special", "rare", "characters", "lords", "heroes", "total"]);
  let lines = 0;
  let candidates = 0;
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (/^[-•]\s+/.test(line)) return;
    lines += 1;
    const normalized = normalizeText(line);
    const matches = allCatalogueEntries()
      .flatMap((entry) => entry.aliases.map((alias) => ({ entry, alias })))
      .filter(({ alias }) => normalized.includes(alias))
      .sort((a, b) => b.alias.length - a.alias.length);
    const catalogueMatch = matches[0];
    const count = quantityFromLine(line, catalogueMatch?.alias) || firstPlausibleQuantity(line);
    if (count < 2 || count > 500) return;
    candidates += 1;

    const parsedName = catalogueMatch?.entry.name || unknownNameFromLine(line);
    const learnedMatch = learned[normalizeText(parsedName)];
    const name = learnedMatch?.name || parsedName;
    if (!name || ignoredNames.has(normalizeText(name)) || name.length > 70) return;
    const key = `${catalogueMatch?.entry.id || `unknown-${normalizeText(name)}`}-${count}`;
    if (found.has(key)) {
      found.get(key).copies += 1;
      return;
    }
    const formation = recommendFormation(count);
    found.set(key, {
      id: key,
      name,
      count,
      copies: 1,
      columns: formation.columns,
      rows: formation.rows,
      baseSize: catalogueMatch?.entry.width || learnedMatch?.width || 0,
      baseDepth: catalogueMatch?.entry.depth || learnedMatch?.depth || 0,
      matched: Boolean(catalogueMatch || learnedMatch)
    });
  });
  armyParseReport = { lines, candidates };
  return [...found.values()];
}

function recommendationConfig(recommendation) {
  return {
    ...defaults,
    ...(recommendation.config || {}),
    columns: recommendation.columns,
    rows: recommendation.rows,
    baseSize: recommendation.baseSize,
    baseDepth: recommendation.baseDepth
  };
}

function saveRecommendation(recommendation) {
  const saved = presets();
  const config = recommendationConfig(recommendation);
  saved.unshift({
    id: `${Date.now()}`,
    name: `${recommendation.name} - ${recommendation.columns} x ${recommendation.rows}`,
    state: config
  });
  localStorage.setItem("movement-tray-presets", JSON.stringify(saved.slice(0, 12)));
  renderPresets();
  showToast(`${recommendation.name} preset saved`);
}

function trayThumbnailSvg(config) {
  const columns = clamp(config.columns, 1, 12);
  const rows = clamp(config.rows, 1, 12);
  const width = 104;
  const depth = Math.max(34, Math.min(66, width * (rows * config.baseDepth) / (columns * config.baseSize)));
  const verticals = Array.from({ length: columns - 1 }, (_, index) => {
    const x = ((index + 1) / columns) * width;
    return `<line x1="${x}" y1="0" x2="${x}" y2="${depth}"/>`;
  }).join("");
  const horizontals = Array.from({ length: rows - 1 }, (_, index) => {
    const y = ((index + 1) / rows) * depth;
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`;
  }).join("");
  return `<svg class="tray-thumb" viewBox="0 0 150 88" aria-hidden="true"><g transform="translate(28 4) skewY(14) scale(1 .82)"><rect width="${width}" height="${depth}" rx="3"/><g>${verticals}${horizontals}</g></g></svg>`;
}

function restoreWorkspaceHome() {
  const workspace = document.querySelector(".workspace");
  const singleMode = document.getElementById("singleMode");
  const presetsSection = singleMode.querySelector(".presets-section");
  if (workspace.parentElement !== singleMode) singleMode.insertBefore(workspace, presetsSection);
}

function startArmyEdit(recommendation) {
  armyEditOriginalState = { ...state };
  armyEditingId = recommendation.id;
  writeState(recommendationConfig(recommendation));
  renderArmyRecommendations();
}

function exitArmyEdit(save, silent = false) {
  const recommendation = armyRecommendations.find((item) => item.id === armyEditingId);
  if (save && recommendation) {
    readState();
    recommendation.columns = state.columns;
    recommendation.rows = state.rows;
    recommendation.baseSize = state.baseSize;
    recommendation.baseDepth = state.baseDepth;
    recommendation.config = { ...state };
    rememberUnitBase(recommendation);
  } else if (armyEditOriginalState) {
    writeState(armyEditOriginalState);
  }
  armyEditingId = "";
  armyEditOriginalState = null;
  restoreWorkspaceHome();
  renderArmyRecommendations();
  if (!silent) showToast(save ? "Tray changes saved to this army" : "Returned without changing the tray");
}

function renderArmyRecommendations() {
  const container = document.getElementById("armyResults");
  const summary = document.getElementById("armySummary");
  const tabs = document.getElementById("armyTrayTabs");
  if (!armyEditingId) restoreWorkspaceHome();
  if (!armyRecommendations.length) {
    tabs.hidden = true;
    tabs.innerHTML = "";
    summary.textContent = `${armyParseReport.lines} lines checked - no ranked units found`;
    container.innerHTML = `<div class="empty-army">No unit quantities were recognised. Keep each unit and its model count on one line, such as "16 White Lions of Chrace [242 pts]".</div>`;
    return;
  }
  if (!armyRecommendations.some((item) => item.id === activeArmyRecommendationId)) {
    activeArmyRecommendationId = armyRecommendations[0].id;
  }
  const recognised = armyRecommendations.filter((item) => item.matched).length;
  const unknown = armyRecommendations.length - recognised;
  summary.textContent = `${armyRecommendations.length} tray types - ${unknown} need base sizes`;
  tabs.hidden = false;
  tabs.innerHTML = armyRecommendations.map((item) => `
    <button type="button" class="${item.id === activeArmyRecommendationId ? "active" : ""}" data-army-tab="${escapeHtml(item.id)}">
      ${trayThumbnailSvg(recommendationConfig(item))}
      <span><strong>${escapeHtml(item.name)}</strong>
      <small>${item.columns} x ${item.rows}${item.copies > 1 ? ` - print ${item.copies}` : ""}</small></span>
    </button>
  `).join("");
  const item = armyRecommendations.find((recommendation) => recommendation.id === activeArmyRecommendationId);
  if (armyEditingId === item.id) {
    container.innerHTML = `
      <section class="army-edit-shell">
        <div class="army-edit-bar">
          <div><strong>Editing ${escapeHtml(item.name)}</strong><small>Changes stay inside this army project.</small></div>
          <button type="button" data-army-edit="back">Back</button>
          <button type="button" data-army-edit="save">Save tray</button>
        </div>
        <div id="armyEditMount"></div>
      </section>
    `;
    document.getElementById("armyEditMount").append(document.querySelector(".workspace"));
    return;
  }
  const ready = item.baseSize > 0 && item.baseDepth > 0;
  const capacity = item.columns * item.rows;
  const copyText = item.copies > 1 ? `${item.copies} identical units - print ${item.copies}` : `${item.count} models`;
  container.innerHTML = `
      <article class="army-unit" data-recommendation="${escapeHtml(item.id)}">
        <div class="army-unit-preview">${trayThumbnailSvg(recommendationConfig(item))}</div>
        <div class="army-unit-name">
          <h4>${escapeHtml(item.name)}</h4>
          <p>${copyText} - ${capacity} tray spaces${capacity > item.count ? ` (${capacity - item.count} spare)` : ""}</p>
          <span class="match-pill ${item.matched ? "" : "unknown"}">${item.matched ? "Base matched" : "Set base size"}</span>
        </div>
        <div class="army-unit-fields">
          <label class="army-mini-field">Columns<input data-army-field="columns" type="number" min="1" max="12" value="${item.columns}"></label>
          <label class="army-mini-field">Rows<input data-army-field="rows" type="number" min="1" max="12" value="${item.rows}"></label>
          <label class="army-mini-field">Base W<input data-army-field="baseSize" type="number" min="10" max="150" value="${item.baseSize || ""}" placeholder="mm"></label>
          <label class="army-mini-field">Base D<input data-army-field="baseDepth" type="number" min="10" max="150" value="${item.baseDepth || ""}" placeholder="mm"></label>
        </div>
        <div class="army-unit-actions">
          <button type="button" data-army-action="load" ${ready ? "" : "disabled"}>Edit tray</button>
          <button type="button" data-army-action="save" ${ready ? "" : "disabled"}>Save</button>
          <button type="button" data-army-action="export" ${ready ? "" : "disabled"}>Export STL</button>
        </div>
      </article>
    `;
}

function analyzeArmyList() {
  const textarea = document.getElementById("armyList");
  const text = textarea.value.trim();
  if (!text) {
    armyRecommendations = [];
    document.getElementById("armySummary").textContent = "Waiting for a list";
    document.getElementById("armyResults").innerHTML = `<div class="empty-army">Paste an army list above, then choose Suggest trays.</div>`;
    showToast("Paste an army list first");
    textarea.focus();
    return;
  }
  armyRecommendations = parseArmyList(text);
  activeArmyRecommendationId = armyRecommendations[0]?.id || "";
  renderArmyRecommendations();
  showToast(armyRecommendations.length ? `${armyRecommendations.length} tray suggestions ready` : "No units with quantities were recognised");
  document.querySelector(".army-results-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function switchMode(mode) {
  if (mode === "single" && armyEditingId) exitArmyEdit(false, true);
  document.body.dataset.activeMode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active);
  });
  document.querySelectorAll("[data-mode-panel]").forEach((panel) => {
    const active = panel.dataset.modePanel === mode;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
}

function setAuthenticated(authenticated) {
  sessionStorage.setItem("movement-tray-authenticated", authenticated ? "true" : "false");
  document.getElementById("authGate").classList.toggle("hidden", authenticated);
  document.body.classList.toggle("authenticated", authenticated);
  if (!authenticated) {
    document.getElementById("loginForm").reset();
    document.getElementById("loginError").textContent = "";
    setTimeout(() => document.getElementById("loginUsername").focus(), 50);
  }
}

Object.values(inputs).forEach((input) => input.addEventListener("input", render));
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => switchMode(button.dataset.mode));
});
document.getElementById("loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const username = document.getElementById("loginUsername").value;
  const password = document.getElementById("loginPassword").value;
  if (username === "user" && password === "password") {
    setAuthenticated(true);
    showToast("Welcome to the workshop");
  } else {
    document.getElementById("loginError").textContent = "Incorrect username or password.";
  }
});
document.getElementById("logoutButton").addEventListener("click", () => setAuthenticated(false));
document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = inputs[button.dataset.step];
    input.value = clamp(Number(input.value) + Number(button.dataset.direction), Number(input.min), Number(input.max));
    render();
  });
});
document.querySelectorAll("[data-base]").forEach((button) => {
  button.addEventListener("click", () => {
    inputs.baseSize.value = button.dataset.base;
    inputs.baseDepth.value = button.dataset.base;
    render();
  });
});
["exportButton", "exportTop"].forEach((id) => document.getElementById(id).addEventListener("click", () => requestExport()));
["savePreset", "savePresetTop"].forEach((id) => document.getElementById(id).addEventListener("click", savePreset));
document.getElementById("resetButton").addEventListener("click", () => {
  writeState(defaults);
  showToast("Tray reset to defaults");
});
document.getElementById("presets").addEventListener("click", (event) => {
  const loadId = event.target.dataset.load;
  const deleteId = event.target.dataset.delete;
  if (loadId) {
    const preset = presets().find((item) => item.id === loadId);
    if (preset) writeState(preset.state);
  }
  if (deleteId) {
    localStorage.setItem("movement-tray-presets", JSON.stringify(presets().filter((item) => item.id !== deleteId)));
    renderPresets();
    showToast("Preset deleted");
  }
});
document.getElementById("sampleArmy").addEventListener("click", () => {
  document.getElementById("armyList").value = `Beastmen Brayherds - 2,000 points

Core
20x Ungor Raiders [120 pts]
20x Gor Herds [140 pts]

Special
20x Bestigor Herds [260 pts]
6x Minotaur Herds [300 pts]`;
  analyzeArmyList();
});
document.getElementById("analyzeArmy").addEventListener("click", analyzeArmyList);
document.getElementById("openCatalogue").addEventListener("click", () => {
  renderCatalogue();
  document.getElementById("catalogueDialog").showModal();
});
document.getElementById("catalogueSearch").addEventListener("input", (event) => renderCatalogue(event.target.value));
document.getElementById("catalogueList").addEventListener("click", (event) => {
  const card = event.target.closest("[data-catalogue-id]");
  if (!card || event.target.tagName !== "BUTTON") return;
  const entry = allCatalogueEntries().find((item) => item.id === card.dataset.catalogueId);
  if (entry) addCatalogueRecommendation(entry, Number(card.querySelector("input").value) || 10);
});
document.getElementById("customUnitForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = {
    id: `custom-${Date.now()}`,
    name: document.getElementById("customUnitName").value.trim(),
    width: Number(document.getElementById("customUnitWidth").value),
    depth: Number(document.getElementById("customUnitDepth").value),
    aliases: [normalizeText(document.getElementById("customUnitName").value)]
  };
  const custom = customCatalogue();
  custom.push(entry);
  localStorage.setItem("movement-tray-custom-catalogue", JSON.stringify(custom));
  addCatalogueRecommendation(entry, Number(document.getElementById("customUnitCount").value));
  event.target.reset();
  renderCatalogue();
});
document.getElementById("saveArmyProject").addEventListener("click", saveArmyProject);
document.getElementById("openArmyProjects").addEventListener("click", () => {
  renderSavedArmies();
  document.getElementById("savedArmiesDialog").showModal();
});
document.getElementById("savedArmiesList").addEventListener("click", (event) => {
  const card = event.target.closest("[data-army-project]");
  const action = event.target.dataset.projectAction;
  if (!card || !action) return;
  const saved = armyProjects();
  const project = saved.find((item) => item.id === card.dataset.armyProject);
  if (action === "load" && project) {
    armyRecommendations = structuredClone(project.recommendations);
    activeArmyRecommendationId = armyRecommendations[0]?.id || "";
    document.getElementById("armyList").value = project.listText || "";
    document.getElementById("armyProjectName").value = project.name;
    renderArmyRecommendations();
    document.getElementById("savedArmiesDialog").close();
    showToast(`${project.name} loaded`);
  }
  if (action === "delete") {
    localStorage.setItem("movement-tray-army-projects", JSON.stringify(saved.filter((item) => item.id !== card.dataset.armyProject)));
    renderSavedArmies();
  }
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog).close());
});
document.getElementById("chooseAdExport").addEventListener("click", startAdGate);
document.getElementById("chooseUnlimitedExport").addEventListener("click", showUnlockExports);
document.getElementById("choosePrintOrder").addEventListener("click", showPrintOrder);
document.getElementById("stripeCheckoutButton").addEventListener("click", beginStripeCheckout);
document.getElementById("unlockCheckoutButton").addEventListener("click", beginUnlockCheckout);
document.getElementById("completeAdExport").addEventListener("click", () => {
  localStorage.setItem(freeExportUsedKey, "true");
  exportStl(pendingExportConfig, pendingExportPrefix);
  document.getElementById("exportDialog").close();
});
document.getElementById("armyResults").addEventListener("input", (event) => {
  const field = event.target.dataset.armyField;
  const card = event.target.closest("[data-recommendation]");
  if (!field || !card) return;
  const recommendation = armyRecommendations.find((item) => item.id === card.dataset.recommendation);
  if (!recommendation) return;
  recommendation[field] = Number(event.target.value) || 0;
  const ready = recommendation.baseSize > 0 && recommendation.baseDepth > 0;
  card.querySelectorAll("[data-army-action]").forEach((button) => { button.disabled = !ready; });
});
document.getElementById("armyResults").addEventListener("change", (event) => {
  if (event.target.dataset.armyField) renderArmyRecommendations();
});
document.getElementById("armyTrayTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-army-tab]");
  if (!button) return;
  if (armyEditingId) {
    showToast("Save or go back before changing tray tabs");
    return;
  }
  activeArmyRecommendationId = button.dataset.armyTab;
  renderArmyRecommendations();
});
document.getElementById("armyResults").addEventListener("click", (event) => {
  const editAction = event.target.dataset.armyEdit;
  if (editAction === "back") return exitArmyEdit(false);
  if (editAction === "save") return exitArmyEdit(true);
  const action = event.target.dataset.armyAction;
  const card = event.target.closest("[data-recommendation]");
  if (!action || !card) return;
  const recommendation = armyRecommendations.find((item) => item.id === card.dataset.recommendation);
  if (!recommendation || recommendation.baseSize <= 0 || recommendation.baseDepth <= 0) return;
  rememberUnitBase(recommendation);
  const config = recommendationConfig(recommendation);
  if (action === "load") {
    startArmyEdit(recommendation);
    document.querySelector(".army-results-wrap").scrollIntoView({ behavior: "smooth" });
  }
  if (action === "save") saveRecommendation(recommendation);
  if (action === "export") requestExport(config, recommendation.name);
});

render();
renderPresets();
setAuthenticated(sessionStorage.getItem("movement-tray-authenticated") === "true");
const checkoutParameters = new URLSearchParams(window.location.search);
const checkoutResult = checkoutParameters.get("checkout");
if (checkoutResult === "success") showToast("Checkout completed. Payment confirmation is pending.");
if (checkoutResult === "cancelled") showToast("Stripe Checkout was cancelled.");
if (checkoutResult === "unlock-success") verifyUnlockPurchase(checkoutParameters.get("session_id"));
if (checkoutResult === "unlock-cancelled") showToast("Unlimited STL unlock was cancelled.");
