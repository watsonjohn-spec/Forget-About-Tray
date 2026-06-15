const catalogue = window.makeupCatalogue || [];
const filamentColours = [
  { key: "pla-rose-gold", material: "pla", name: "Rose Gold", hex: "#b76e79" },
  { key: "pla-blush", material: "pla", name: "Blush Pink", hex: "#e5a6ae" },
  { key: "pla-ivory", material: "pla", name: "Ivory", hex: "#eee5d4" },
  { key: "pla-black", material: "pla", name: "Black", hex: "#252124" },
  { key: "petg-clear", material: "petg", name: "Translucent", hex: "#d5d7d8" }
];
const defaults = {
  items: catalogue.slice(0, 3).map((item, index) => ({ ...item, id: `${item.id}-${index}`, clearance: 1.5 })),
  columns: 3, gap: 6, edgeMargin: 8, baseThickness: 3, wallThickness: 2, holderHeight: 18,
  handleEnabled: false, handleHeight: 95, handleWidth: 70,
  filamentKey: "pla-rose-gold", filamentMaterial: "pla", filamentName: "Rose Gold", filamentHex: "#b76e79"
};
let state = structuredClone(defaults);
let savedDesigns = [];
let marketplaceQuotes = [];
let selectedQuoteId = "";
let exportStatus = { freeExportUsed: false, unlimitedExports: false };
let toastTimer;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 2600);
}

function apiBase() {
  return document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "");
}

async function api(path, options = {}) {
  return fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { ...(await accountService.authHeaders()), ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
  });
}

function money(pence, currency = "gbp") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(Number(pence || 0) / 100);
}

function readConstruction() {
  ["columns", "gap", "edgeMargin", "baseThickness", "wallThickness", "holderHeight", "handleHeight", "handleWidth"].forEach((key) => {
    state[key] = Number(document.getElementById(key).value);
  });
  state.handleEnabled = document.getElementById("handleEnabled").checked;
  const filament = filamentColours.find((candidate) => candidate.key === document.getElementById("filamentColour").value) || filamentColours[0];
  state.filamentKey = filament.key;
  state.filamentMaterial = filament.material;
  state.filamentName = filament.name;
  state.filamentHex = filament.hex;
}

function writeConstruction() {
  ["columns", "gap", "edgeMargin", "baseThickness", "wallThickness", "holderHeight", "handleHeight", "handleWidth"].forEach((key) => {
    document.getElementById(key).value = state[key];
  });
  document.getElementById("handleEnabled").checked = state.handleEnabled;
  document.getElementById("handleFields").hidden = !state.handleEnabled;
  document.getElementById("filamentColour").value = state.filamentKey;
}

function geometry() {
  readConstruction();
  if (!state.items.length) return { positions: [], outerWidth: 100, outerDepth: 70, height: state.baseThickness, materialCm3: 0 };
  const rowCount = Math.ceil(state.items.length / state.columns);
  const columnWidths = Array.from({ length: state.columns }, () => 0);
  const rowDepths = Array.from({ length: rowCount }, () => 0);
  state.items.forEach((item, index) => {
    const column = index % state.columns;
    const row = Math.floor(index / state.columns);
    columnWidths[column] = Math.max(columnWidths[column], item.width + item.clearance * 2);
    rowDepths[row] = Math.max(rowDepths[row], item.depth + item.clearance * 2);
  });
  const columnStarts = [];
  const rowStarts = [];
  let cursor = state.edgeMargin;
  columnWidths.forEach((width) => { columnStarts.push(cursor); cursor += width + state.gap; });
  const outerWidth = cursor - state.gap + state.edgeMargin;
  cursor = state.edgeMargin;
  rowDepths.forEach((depth) => { rowStarts.push(cursor); cursor += depth + state.gap; });
  const outerDepth = cursor - state.gap + state.edgeMargin;
  const positions = state.items.map((item, index) => {
    const column = index % state.columns;
    const row = Math.floor(index / state.columns);
    const slotWidth = item.width + item.clearance * 2;
    const slotDepth = item.depth + item.clearance * 2;
    return { ...item, x: columnStarts[column] + (columnWidths[column] - slotWidth) / 2, y: rowStarts[row] + (rowDepths[row] - slotDepth) / 2, slotWidth, slotDepth };
  });
  const baseVolume = outerWidth * outerDepth * state.baseThickness;
  const wallsVolume = positions.reduce((sum, item) => sum + (item.slotWidth * 2 + item.slotDepth * 2 + state.wallThickness * 4) * state.wallThickness * Math.min(state.holderHeight, item.height * .45), 0);
  const handleVolume = state.handleEnabled ? (state.handleHeight * 2 + state.handleWidth) * Math.max(state.wallThickness * 2, 4) ** 2 : 0;
  return { positions, outerWidth, outerDepth, height: Math.max(state.baseThickness + state.holderHeight, state.handleEnabled ? state.handleHeight + 4 : 0), materialCm3: (baseVolume + wallsVolume + handleVolume) / 1000 };
}

function renderSlotList() {
  document.getElementById("slotList").innerHTML = state.items.length ? state.items.map((item, index) => `
    <article class="slot-card" data-slot-index="${index}">
      <div><strong>${index + 1}. ${escapeHtml(item.name)}</strong><small>${escapeHtml(item.brand)} · ${item.width} × ${item.depth} × ${item.height} mm</small></div>
      <div class="slot-actions"><button data-move="-1" title="Move up">↑</button><button data-move="1" title="Move down">↓</button><button data-remove title="Remove">×</button></div>
    </article>
  `).join("") : `<div class="empty">Add a product to begin the caddy.</div>`;
}

function renderPreview() {
  const metric = geometry();
  const svg = document.getElementById("caddyPreview");
  const pad = 50;
  const scale = Math.min((760 - pad * 2) / metric.outerWidth, (520 - pad * 2) / metric.outerDepth);
  const offsetX = (760 - metric.outerWidth * scale) / 2;
  const offsetY = (520 - metric.outerDepth * scale) / 2;
  const colour = state.filamentHex;
  svg.innerHTML = `
    <defs><filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity=".18"/></filter></defs>
    <rect x="${offsetX}" y="${offsetY}" width="${metric.outerWidth * scale}" height="${metric.outerDepth * scale}" rx="10" fill="${colour}" stroke="#75474e" stroke-width="2" filter="url(#shadow)"/>
    ${metric.positions.map((item, index) => `<g>
      <rect x="${offsetX + item.x * scale}" y="${offsetY + item.y * scale}" width="${item.slotWidth * scale}" height="${item.slotDepth * scale}" rx="6" fill="#fffaf8" fill-opacity=".72" stroke="#75474e" stroke-width="2"/>
      <text x="${offsetX + (item.x + item.slotWidth / 2) * scale}" y="${offsetY + (item.y + item.slotDepth / 2) * scale}" dominant-baseline="middle" text-anchor="middle" fill="#38272b" font-size="${Math.max(8, Math.min(12, item.slotWidth * scale / 7))}" font-weight="800">${index + 1}</text>
    </g>`).join("")}
    ${state.handleEnabled ? `<g stroke="#75474e" stroke-width="8" stroke-linecap="round"><line x1="330" y1="265" x2="330" y2="145"/><line x1="430" y1="265" x2="430" y2="145"/><line x1="330" y1="145" x2="430" y2="145"/></g>` : ""}
  `;
  document.getElementById("outerSize").textContent = `${metric.outerWidth.toFixed(1)} × ${metric.outerDepth.toFixed(1)} mm`;
  document.getElementById("totalHeight").textContent = `${metric.height.toFixed(1)} mm`;
  document.getElementById("materialEstimate").textContent = `${(metric.materialCm3 * (state.filamentMaterial === "petg" ? 1.27 : 1.24)).toFixed(1)} g`;
  document.getElementById("slotCount").textContent = state.items.length;
  renderSlotList();
}

function populateCatalogue() {
  const brands = [...new Set(catalogue.map((item) => item.brand))].sort();
  document.getElementById("brandFilter").innerHTML = brands.map((brand) => `<option>${escapeHtml(brand)}</option>`).join("");
  populateProducts();
}

function populateProducts() {
  const brand = document.getElementById("brandFilter").value;
  document.getElementById("productSelect").innerHTML = catalogue.filter((item) => item.brand === brand).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.category)} · ${escapeHtml(item.name)}</option>`).join("");
}

function addItem(item) {
  state.items.push({ ...item, id: `${item.id || "custom"}-${crypto.randomUUID()}`, clearance: Number(item.clearance || 1.5) });
  renderPreview();
  toast(`${item.name} added`);
}

async function refreshDesigns() {
  savedDesigns = await accountService.loadDesigns();
  document.getElementById("savedDesigns").innerHTML = savedDesigns.length ? savedDesigns.map((design) => `
    <article class="saved-card"><h3>${escapeHtml(design.name)}</h3><p>${design.parameters?.items?.length || 0} slots · updated ${new Date(design.updated_at).toLocaleDateString()}</p><div><button class="button secondary" data-load="${escapeHtml(design.id)}">Load</button><button class="button text" data-delete="${escapeHtml(design.id)}">Delete</button></div></article>
  `).join("") : `<div class="empty">Saved caddies will appear here.</div>`;
}

async function saveDesign() {
  if (!state.items.length) return toast("Add at least one product first");
  readConstruction();
  const name = document.getElementById("designName").value.trim() || "My makeup caddy";
  await accountService.upsertDesign({ client_ref: crypto.randomUUID(), name, generator_version: 1, parameters: state, metadata: { dimensions_are_approximate: true } });
  await refreshDesigns();
  toast("Caddy saved");
}

async function refreshExportStatus() {
  const response = await api("/api/account/export-status");
  exportStatus = response.ok ? await response.json() : { freeExportUsed: false, unlimitedExports: false };
}

async function downloadStl(token = "") {
  const response = await api("/api/account/export-stl", { method: "POST", body: JSON.stringify({ config: state, name: document.getElementById("designName").value, downloadToken: token }) });
  if (!response.ok) throw new Error((await response.json()).error || "STL download failed.");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || "makeup-caddy.stl";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function requestDownload() {
  const button = document.getElementById("downloadStl");
  try {
    if (exportStatus.unlimitedExports) {
      await downloadStl();
    } else {
      if (exportStatus.freeExportUsed) return toast("Unlock unlimited STL exports to download again");
      toast("Sponsored placement started. Your STL unlocks in 30 seconds.");
      button.disabled = true;
      for (let seconds = 30; seconds > 0; seconds -= 1) {
        button.querySelector("strong").textContent = `Sponsor message · ${seconds}s`;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const permit = await api("/api/account/use-free-export", { method: "POST", body: JSON.stringify({ config: state, name: document.getElementById("designName").value }) });
      const result = await permit.json();
      if (!permit.ok) throw new Error(result.error);
      exportStatus.freeExportUsed = true;
      await downloadStl(result.downloadToken);
    }
    document.getElementById("exportDialog").close();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.querySelector("strong").textContent = "Download STL";
  }
}

async function unlockStls() {
  const response = await api("/api/checkout/unlock/session", { method: "POST", body: "{}" });
  const result = await response.json();
  if (!response.ok || !result.url) return toast(result.error || "Checkout could not be opened");
  window.location.assign(result.url);
}

async function loadMarketplace() {
  document.getElementById("exportChoices").hidden = true;
  document.getElementById("printMarketplace").hidden = false;
  document.getElementById("providerQuotes").innerHTML = `<div class="empty">Loading available providers...</div>`;
  const response = await api("/api/marketplace/quotes", { method: "POST", body: JSON.stringify({ config: state, name: document.getElementById("designName").value }) });
  const result = await response.json();
  if (!response.ok) return toast(result.error);
  marketplaceQuotes = result.quotes || [];
  const colours = [...new Map(marketplaceQuotes.map((quote) => [quote.colourKey, quote])).values()];
  document.getElementById("providerColourFilter").innerHTML = `<option value="">All colours</option>${colours.map((quote) => `<option value="${escapeHtml(quote.colourKey)}">${escapeHtml(quote.colourName)}</option>`).join("")}`;
  renderQuotes();
}

function renderQuotes() {
  const colour = document.getElementById("providerColourFilter").value;
  const lead = Number(document.getElementById("providerLeadFilter").value || 0);
  const rating = Number(document.getElementById("providerRatingFilter").value || 0);
  const filtered = marketplaceQuotes.filter((quote) => (!colour || quote.colourKey === colour) && (!lead || quote.leadTimeDays <= lead) && (!rating || quote.ratingAverage >= rating));
  document.getElementById("providerQuotes").innerHTML = filtered.length ? filtered.map((quote) => `
    <article class="provider-quote ${quote.id === selectedQuoteId ? "selected" : ""}">
      <span class="colour-chip" style="background:${escapeHtml(quote.colourHex || "#ccc")}"></span>
      <div><strong>${escapeHtml(quote.providerName)}</strong><small>${escapeHtml(quote.basedIn)} · ${quote.ratingCount ? `${quote.ratingAverage.toFixed(1)} / 5` : "New"} · ${quote.leadTimeDays} days</small><small>${escapeHtml(quote.colourName)} ${escapeHtml(quote.material.toUpperCase())}</small></div>
      <strong>${money(quote.totalIncVatPence, quote.currency)}</strong>
      <button data-quote="${escapeHtml(quote.id)}">${quote.id === selectedQuoteId ? "Selected" : "Select printer"}</button>
    </article>
  `).join("") : `<div class="empty">No providers match these filters.</div>`;
  document.getElementById("checkoutButton").disabled = !selectedQuoteId;
  document.getElementById("checkoutStatus").textContent = marketplaceQuotes.length ? "All prices include production, postage, platform service, and VAT." : "No matching providers are available yet.";
}

async function beginCheckout() {
  const response = await api("/api/marketplace/checkout/session", { method: "POST", body: JSON.stringify({ quoteId: selectedQuoteId }) });
  const result = await response.json();
  if (!response.ok || !result.url) return toast(result.error || "Checkout could not be opened");
  window.location.assign(result.url);
}

async function refreshOrders() {
  const orders = await accountService.loadOrders();
  document.getElementById("ordersList").innerHTML = orders.length ? orders.map((order) => `<article class="order-card"><span>${escapeHtml(order.invoice_number || "Pending")} · ${escapeHtml(order.status)}</span><strong>${money(order.total_inc_vat, order.currency)}</strong></article>`).join("") : `<div class="empty">No Makeup orders yet.</div>`;
}

async function processCheckoutResult() {
  const parameters = new URLSearchParams(location.search);
  if (parameters.get("checkout") === "unlock-success") {
    const response = await api("/api/checkout/unlock/verify", { method: "POST", body: JSON.stringify({ sessionId: parameters.get("session_id") }) });
    if (response.ok) {
      exportStatus.unlimitedExports = true;
      toast("Unlimited Makeup STL exports unlocked");
    }
  } else if (parameters.get("checkout") === "success") {
    toast("Print order payment received");
  }
  if (parameters.get("checkout")) history.replaceState({}, "", location.pathname);
}

function setAuthenticated(authenticated) {
  document.body.classList.toggle("authenticated", authenticated);
  document.getElementById("authGate").classList.toggle("hidden", authenticated);
}

async function initialize() {
  document.getElementById("filamentColour").innerHTML = filamentColours.map((colour) => `<option value="${colour.key}">${colour.name} · ${colour.material.toUpperCase()}</option>`).join("");
  populateCatalogue();
  writeConstruction();
  renderPreview();
  try {
    const session = await accountService.init();
    setAuthenticated(Boolean(session));
    if (session) {
      await Promise.all([refreshDesigns(), refreshExportStatus()]);
      await processCheckoutResult();
    }
  } catch (error) {
    setAuthenticated(false);
    document.getElementById("loginError").textContent = error.message;
  }
}

document.getElementById("brandFilter").addEventListener("change", populateProducts);
document.getElementById("addProduct").addEventListener("click", () => {
  const item = catalogue.find((candidate) => candidate.id === document.getElementById("productSelect").value);
  if (item) addItem(item);
});
document.getElementById("customProductForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addItem({ id: "custom", brand: "Custom", category: "Custom", name: document.getElementById("customName").value, width: Number(document.getElementById("customWidth").value), depth: Number(document.getElementById("customDepth").value), height: Number(document.getElementById("customHeight").value) });
  event.target.reset();
});
document.getElementById("slotList").addEventListener("click", (event) => {
  const card = event.target.closest("[data-slot-index]");
  if (!card) return;
  const index = Number(card.dataset.slotIndex);
  if (event.target.dataset.remove !== undefined) state.items.splice(index, 1);
  if (event.target.dataset.move) {
    const target = index + Number(event.target.dataset.move);
    if (target >= 0 && target < state.items.length) [state.items[index], state.items[target]] = [state.items[target], state.items[index]];
  }
  renderPreview();
});
["columns", "gap", "edgeMargin", "baseThickness", "wallThickness", "holderHeight", "handleHeight", "handleWidth", "filamentColour"].forEach((id) => document.getElementById(id).addEventListener("input", renderPreview));
document.getElementById("handleEnabled").addEventListener("change", () => { document.getElementById("handleFields").hidden = !document.getElementById("handleEnabled").checked; renderPreview(); });
document.getElementById("saveDesign").addEventListener("click", () => saveDesign().catch((error) => toast(error.message)));
document.getElementById("saveDesignTop").addEventListener("click", () => saveDesign().catch((error) => toast(error.message)));
["exportButton", "exportTop"].forEach((id) => document.getElementById(id).addEventListener("click", () => { if (!state.items.length) return toast("Add at least one product first"); document.getElementById("exportChoices").hidden = false; document.getElementById("printMarketplace").hidden = true; document.getElementById("exportDialog").showModal(); }));
document.getElementById("downloadStl").addEventListener("click", requestDownload);
document.getElementById("unlockStl").addEventListener("click", () => unlockStls().catch((error) => toast(error.message)));
document.getElementById("printCaddy").addEventListener("click", () => loadMarketplace().catch((error) => toast(error.message)));
document.getElementById("providerQuotes").addEventListener("click", (event) => { const button = event.target.closest("[data-quote]"); if (button) { selectedQuoteId = button.dataset.quote; renderQuotes(); } });
["providerColourFilter", "providerLeadFilter", "providerRatingFilter"].forEach((id) => document.getElementById(id).addEventListener("change", renderQuotes));
document.getElementById("checkoutButton").addEventListener("click", () => beginCheckout().catch((error) => toast(error.message)));
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
document.getElementById("savedDesigns").addEventListener("click", async (event) => {
  if (event.target.dataset.load) {
    const design = savedDesigns.find((candidate) => candidate.id === event.target.dataset.load);
    if (design) { state = structuredClone(design.parameters); document.getElementById("designName").value = design.name; writeConstruction(); renderPreview(); toast("Caddy loaded"); }
  }
  if (event.target.dataset.delete) { await accountService.deleteDesign(event.target.dataset.delete); await refreshDesigns(); }
});
document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await accountService.signIn(document.getElementById("loginEmail").value, document.getElementById("loginPassword").value); setAuthenticated(true); await Promise.all([refreshDesigns(), refreshExportStatus()]); } catch (error) { document.getElementById("loginError").textContent = error.message; }
});
document.getElementById("createAccount").addEventListener("click", async () => {
  try { const result = await accountService.signUp(document.getElementById("loginEmail").value, document.getElementById("loginPassword").value); document.getElementById("loginError").textContent = result.access_token ? "Account created." : "Check your email to confirm the account."; if (result.access_token) setAuthenticated(true); } catch (error) { document.getElementById("loginError").textContent = error.message; }
});
document.querySelectorAll("[data-oauth-provider]").forEach((button) => button.addEventListener("click", () => accountService.signInWithProvider(button.dataset.oauthProvider).catch((error) => { document.getElementById("loginError").textContent = error.message; })));
document.getElementById("accountButton").addEventListener("click", async () => { document.getElementById("accountEmail").textContent = accountService.currentUser()?.email || ""; await refreshOrders(); document.getElementById("accountDialog").showModal(); });
document.getElementById("viewOrders").addEventListener("click", () => refreshOrders().catch((error) => toast(error.message)));
document.getElementById("logoutButton").addEventListener("click", async () => { await accountService.signOut(); document.getElementById("accountDialog").close(); setAuthenticated(false); });

initialize();
