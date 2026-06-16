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
  layoutMode: "caddy", maxSpineLength: 220, gap: 6, edgeMargin: 8, baseThickness: 3, wallThickness: 2, stepRise: 22,
  pegboardColumns: 3, pegboardRows: 2, pegboardHookSpacing: 40,
  handleEnabled: true, handleHeight: 95, handleWidth: 70,
  filamentKey: "pla-rose-gold", filamentMaterial: "pla", filamentName: "Rose Gold", filamentHex: "#b76e79"
};
let state = structuredClone(defaults);
let savedDesigns = [];
let marketplaceQuotes = [];
let selectedQuoteId = "";
let exportStatus = { freeExportUsed: false, unlimitedExports: false };
let toastTimer;
let accountOrders = [];
let previewYaw = -Math.PI / 4;
let previewPitch = Math.PI / 5;
let previewDrag = null;

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

function splitPegboardBoxes(boxes, sheetWidth, sheetDepth, hookDepth, baseThickness, baseZ = 0) {
  const chunkSize = 250;
  const chunkCols = Math.ceil(sheetWidth / chunkSize);
  const chunkRows = Math.ceil(sheetDepth / chunkSize);
  if (chunkCols === 1 && chunkRows === 1) return { boxes, outerWidth: sheetWidth, outerDepth: sheetDepth + hookDepth, chunkCount: 1 };

  const spacing = 18;
  const tab = 18;
  const tabDepth = Math.max(4, baseThickness);
  const chunkWidth = sheetWidth / chunkCols;
  const chunkDepth = sheetDepth / chunkRows;
  const output = [];

  for (let row = 0; row < chunkRows; row += 1) {
    for (let column = 0; column < chunkCols; column += 1) {
      const outputX = column * (chunkWidth + spacing);
      const outputY = row * (chunkDepth + hookDepth + spacing) + hookDepth;
      output.push({ x: outputX, y: outputY, z: baseZ, w: chunkWidth, d: chunkDepth, h: baseThickness, kind: "base" });
      if (column < chunkCols - 1) output.push({ x: outputX + chunkWidth - tabDepth / 2, y: outputY + chunkDepth / 2 - tab / 2, z: baseZ, w: tabDepth, d: tab, h: baseThickness, kind: "jigsaw" });
      if (row < chunkRows - 1) output.push({ x: outputX + chunkWidth / 2 - tab / 2, y: outputY + chunkDepth - tabDepth / 2, z: baseZ, w: tab, d: tabDepth, h: baseThickness, kind: "jigsaw" });
    }
  }

  boxes.filter((box) => box.kind !== "base").forEach((box) => {
    const centreX = Math.max(0, Math.min(sheetWidth - 0.001, box.x + box.w / 2));
    const centreY = Math.max(0, Math.min(sheetDepth - 0.001, box.y - hookDepth + box.d / 2));
    const column = Math.max(0, Math.min(chunkCols - 1, Math.floor(centreX / chunkWidth)));
    const row = Math.max(0, Math.min(chunkRows - 1, Math.floor(centreY / chunkDepth)));
    const sourceX = column * chunkWidth;
    const sourceY = hookDepth + row * chunkDepth;
    const outputX = column * (chunkWidth + spacing);
    const outputY = row * (chunkDepth + hookDepth + spacing) + hookDepth;
    output.push({ ...box, x: outputX + box.x - sourceX, y: outputY + box.y - sourceY });
  });

  return {
    boxes: output,
    outerWidth: chunkCols * chunkWidth + (chunkCols - 1) * spacing,
    outerDepth: chunkRows * (chunkDepth + hookDepth) + (chunkRows - 1) * spacing,
    chunkCount: chunkCols * chunkRows
  };
}

function readConstruction() {
  ["maxSpineLength", "gap", "edgeMargin", "baseThickness", "wallThickness", "stepRise", "pegboardColumns", "pegboardRows", "pegboardHookSpacing", "handleHeight", "handleWidth"].forEach((key) => {
    state[key] = Number(document.getElementById(key).value);
  });
  state.handleEnabled = true;
  document.getElementById("handleEnabled").checked = true;
  const filament = filamentColours.find((candidate) => candidate.key === document.getElementById("filamentColour").value) || filamentColours[0];
  state.filamentKey = filament.key;
  state.filamentMaterial = filament.material;
  state.filamentName = filament.name;
  state.filamentHex = filament.hex;
}

function writeConstruction() {
  state = { ...defaults, ...state, handleEnabled: true };
  if (!["caddy", "staircase", "pegboard"].includes(state.layoutMode)) state.layoutMode = "caddy";
  ["maxSpineLength", "gap", "edgeMargin", "baseThickness", "wallThickness", "stepRise", "pegboardColumns", "pegboardRows", "pegboardHookSpacing", "handleHeight", "handleWidth"].forEach((key) => {
    document.getElementById(key).value = state[key];
  });
  document.getElementById("handleEnabled").checked = true;
  const isCaddy = state.layoutMode === "caddy";
  const isStaircase = state.layoutMode === "staircase";
  const isPegboard = state.layoutMode === "pegboard";
  document.getElementById("maxSpineLengthField").hidden = !isStaircase;
  document.getElementById("edgeMarginField").hidden = !isStaircase;
  document.getElementById("stepRiseField").hidden = !isStaircase;
  document.getElementById("pegboardFields").hidden = !isPegboard;
  document.getElementById("pegboardNote").hidden = !isPegboard;
  document.getElementById("handleFields").hidden = !isCaddy;
  document.getElementById("handleEnabled").closest(".switch").hidden = !isCaddy;
  document.querySelectorAll("[data-layout-mode]").forEach((button) => button.classList.toggle("active", button.dataset.layoutMode === state.layoutMode));
  document.getElementById("filamentColour").value = state.filamentKey;
}

function geometry() {
  readConstruction();
  if (!state.items.length) return { positions: [], boxes: [], outerWidth: 100, outerDepth: 70, height: state.baseThickness, materialCm3: 0 };
  const items = state.items.map((item) => ({ ...item, slotWidth: item.width + item.clearance * 2, slotDepth: item.depth + item.clearance * 2 }));
  let positions = [];
  let outerWidth;
  let outerDepth;
  let rowDepths = [];
  let spineY = 0;
  let spineWidth = Math.max(state.wallThickness * 3, 8);
  if (state.layoutMode === "staircase") {
    const rows = [];
    items.forEach((item) => {
      let row = rows.at(-1);
      const used = row?.reduce((sum, candidate) => sum + candidate.slotWidth, 0) + Math.max(0, (row?.length || 0) - 1) * state.gap;
      if (!row || used + item.slotWidth + state.gap > state.maxSpineLength) { row = []; rows.push(row); }
      row.push(item);
    });
    rowDepths = rows.map((row) => Math.max(...row.map((item) => item.slotDepth)));
    outerWidth = Math.max(...rows.map((row) => row.reduce((sum, item) => sum + item.slotWidth, 0) + (row.length - 1) * state.gap)) + state.edgeMargin * 2;
    outerDepth = rowDepths.reduce((sum, depth) => sum + depth, 0) + (rows.length - 1) * state.gap + state.edgeMargin * 2;
    let y = state.edgeMargin;
    rows.forEach((row, rowIndex) => {
      let x = state.edgeMargin;
      row.forEach((item, column) => { positions.push({ ...item, x, y, z: rowIndex * state.stepRise, row: rowIndex, column }); x += item.slotWidth + state.gap; });
      y += rowDepths[rowIndex] + state.gap;
    });
  } else if (state.layoutMode === "pegboard") {
    const t = state.wallThickness;
    const columns = Math.max(1, Math.round(state.pegboardColumns || 3));
    const minimumRows = Math.max(1, Math.round(state.pegboardRows || 2));
    const rows = Math.max(minimumRows, Math.ceil(items.length / columns));
    const cells = items.map((item, index) => ({
      ...item,
      column: index % columns,
      row: Math.floor(index / columns),
      cellWidth: item.slotWidth + t * 2,
      cellDepth: item.slotDepth + t * 2
    }));
    const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(24, ...cells.filter((cell) => cell.column === column).map((cell) => cell.cellWidth)));
    const rowDepthsForBoard = Array.from({ length: rows }, (_, row) => Math.max(24, ...cells.filter((cell) => cell.row === row).map((cell) => cell.cellDepth)));
    const columnOffsets = columnWidths.map((_, column) => columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0));
    const rowOffsets = rowDepthsForBoard.map((_, row) => rowDepthsForBoard.slice(0, row).reduce((sum, depth) => sum + depth, 0));
    const hookDepth = Math.max(12, t * 6);
    const hookPitch = Math.max(30, Math.min(60, Number(state.pegboardHookSpacing || 40)));
    const hookWidth = 4.2;
    const hookBladeDepth = 12;
    const hookDrop = Math.max(7, t * 3.5);
    const hookCatchDepth = 4;
    const hookCatchHeight = 2;
    const baseZ = hookDrop;
    const sheetWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const sheetDepth = rowDepthsForBoard.reduce((sum, depth) => sum + depth, 0);
    outerWidth = sheetWidth;
    outerDepth = sheetDepth + hookDepth;
    positions = cells.map((cell) => ({
      ...cell,
      x: columnOffsets[cell.column] + t,
      y: hookDepth + rowOffsets[cell.row] + t,
      z: 0
    }));
    const pegboardBoxes = [{ x: 0, y: hookDepth, z: baseZ, w: sheetWidth, d: sheetDepth, h: state.baseThickness, kind: "base" }];
    positions.forEach((item) => {
      const h = Math.max(8, item.height * 2 / 3);
      const z = baseZ + state.baseThickness;
      pegboardBoxes.push(
        { x: item.x - t, y: item.y - t, z, w: item.slotWidth + t * 2, d: t, h, kind: "wall" },
        { x: item.x - t, y: item.y + item.slotDepth, z, w: item.slotWidth + t * 2, d: t, h, kind: "wall" },
        { x: item.x - t, y: item.y, z, w: t, d: item.slotDepth, h, kind: "wall" },
        { x: item.x + item.slotWidth, y: item.y, z, w: t, d: item.slotDepth, h, kind: "wall" }
      );
    });
    const hookCount = Math.max(2, Math.min(10, Math.floor(sheetWidth / hookPitch) + 1));
    for (let hook = 0; hook < hookCount; hook += 1) {
      const hookX = hookCount === 1 ? sheetWidth / 2 - hookWidth / 2 : (hook * (sheetWidth - hookWidth)) / (hookCount - 1);
      const hookY = (hookDepth - hookBladeDepth) / 2;
      pegboardBoxes.push(
        { x: hookX, y: hookY, z: 0, w: hookWidth, d: hookBladeDepth, h: hookDrop, kind: "hook" },
        { x: hookX, y: hookY + hookBladeDepth - hookCatchDepth, z: 0, w: hookWidth, d: hookCatchDepth, h: hookDrop + hookCatchHeight, kind: "hook" }
      );
    }
    const split = splitPegboardBoxes(pegboardBoxes, sheetWidth, sheetDepth, hookDepth, state.baseThickness, baseZ);
    const materialCm3 = split.boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
    const height = Math.max(...split.boxes.map((box) => box.z + box.h));
    return { positions, boxes: split.boxes, outerWidth: split.outerWidth, outerDepth: split.outerDepth, height, materialCm3, assembledWidth: sheetWidth, assembledDepth: sheetDepth + hookDepth, chunkCount: split.chunkCount };
  } else {
    const sides = [[], []];
    items.forEach((item, index) => sides[index % 2].push(item));
    const sideDepths = sides.map((side) => Math.max(0, ...side.map((item) => item.slotDepth)));
    spineWidth = Math.max(state.wallThickness * 4, 10);
    const sideLengths = sides.map((side) => side.reduce((sum, item) => sum + item.slotWidth, 0) + Math.max(0, side.length - 1) * state.gap);
    outerWidth = Math.max(...sideLengths) + state.wallThickness * 2;
    outerDepth = sideDepths[0] + spineWidth + sideDepths[1] + state.wallThickness * 2;
    spineY = state.wallThickness + sideDepths[0];
    sides.forEach((side, sideIndex) => {
      let x = state.wallThickness;
      side.forEach((item, column) => {
        const y = sideIndex === 0 ? spineY - item.slotDepth : spineY + spineWidth;
        positions.push({ ...item, x, y, z: 0, row: sideIndex, side: sideIndex, column });
        x += item.slotWidth + state.gap;
      });
    });
  }
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: state.baseThickness, kind: "base" }];
  if (state.layoutMode === "staircase") {
    let y = state.edgeMargin;
    rowDepths.forEach((depth, index) => {
      const height = state.baseThickness + index * state.stepRise;
      boxes.push({ x: 0, y, z: 0, w: outerWidth, d: depth, h: height, kind: "step" });
      boxes.push({ x: 0, y: y + depth - state.wallThickness, z: height, w: outerWidth, d: state.wallThickness, h: state.stepRise + state.wallThickness, kind: "wall" });
      y += depth + state.gap;
    });
  } else {
    const holderHeights = positions.map((item) => Math.max(8, item.height * 2 / 3));
    boxes.push({ x: 0, y: spineY, z: state.baseThickness, w: outerWidth, d: spineWidth, h: Math.max(...holderHeights, state.handleHeight / 2), kind: "spine" });
  }
  positions.forEach((item) => {
    const t = state.wallThickness;
    const h = Math.max(8, item.height * 2 / 3);
    const z = state.baseThickness + item.z;
    if (state.layoutMode === "caddy") {
      const frontY = item.side === 0 ? item.y - t : item.y + item.slotDepth;
      boxes.push(
        { x: item.x - t, y: frontY, z, w: item.slotWidth + t * 2, d: t, h, kind: "wall" },
        { x: item.x - t, y: item.y, z, w: t, d: item.slotDepth, h, kind: "wall" },
        { x: item.x + item.slotWidth, y: item.y, z, w: t, d: item.slotDepth, h, kind: "wall" }
      );
    } else {
      boxes.push(
        { x: item.x - t, y: item.y - t, z, w: item.slotWidth + t * 2, d: t, h, kind: "wall" },
        { x: item.x - t, y: item.y + item.slotDepth, z, w: item.slotWidth + t * 2, d: t, h, kind: "wall" },
        { x: item.x - t, y: item.y, z, w: t, d: item.slotDepth, h, kind: "wall" },
        { x: item.x + item.slotWidth, y: item.y, z, w: t, d: item.slotDepth, h, kind: "wall" }
      );
    }
  });
  if (state.layoutMode === "caddy") {
    const t = Math.max(state.wallThickness * 2, 4);
    const width = Math.min(Math.max(t * 2, state.handleWidth), outerWidth);
    const x = (outerWidth - width) / 2;
    const y = spineY;
    const handleRise = Math.max(state.handleHeight, Math.max(...positions.map((item) => item.height * 2 / 3)) + t * 2);
    boxes.push(
      { x, y, z: state.baseThickness, w: t, d: spineWidth, h: handleRise, kind: "handle" },
      { x: x + width - t, y, z: state.baseThickness, w: t, d: spineWidth, h: handleRise, kind: "handle" },
      { x, y, z: state.baseThickness + handleRise, w: width, d: spineWidth, h: t, kind: "handle" }
    );
  }
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  const height = Math.max(...boxes.map((box) => box.z + box.h));
  return { positions, boxes, outerWidth, outerDepth, height, materialCm3 };
}

function renderSlotList() {
  document.getElementById("slotList").innerHTML = state.items.length ? state.items.map((item, index) => `
    <article class="slot-card" data-slot-index="${index}">
      <div><strong>${index + 1}. ${escapeHtml(item.name)}</strong><small>${item.width} × ${item.depth} × ${item.height} mm</small></div>
      <div class="slot-actions"><button data-move="-1" title="Move up">↑</button><button data-move="1" title="Move down">↓</button><button data-remove title="Remove">×</button></div>
    </article>
  `).join("") : `<div class="empty">Add a product to begin the caddy.</div>`;
}

function renderPreview() {
  const metric = geometry();
  const svg = document.getElementById("caddyPreview");
  const colour = state.filamentHex;
  const scale = 390 / Math.max(metric.outerWidth, metric.outerDepth, metric.height);
  const project = (x, y, z) => {
    const dx = x - metric.outerWidth / 2;
    const dy = y - metric.outerDepth / 2;
    const rx = Math.cos(previewYaw) * dx - Math.sin(previewYaw) * dy;
    const ry = Math.sin(previewYaw) * dx + Math.cos(previewYaw) * dy;
    return [380 + rx * scale, 330 + ry * scale * Math.sin(previewPitch) - z * scale * Math.cos(previewPitch)];
  };
  const points = (vertices) => vertices.map((point) => project(...point).join(",")).join(" ");
  const shade = (amount) => {
    const number = Number.parseInt(colour.slice(1), 16);
    const channel = (shift) => Math.max(0, Math.min(255, (number >> shift & 255) + amount)).toString(16).padStart(2, "0");
    return `#${channel(16)}${channel(8)}${channel(0)}`;
  };
  svg.innerHTML = `<defs><filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-opacity=".18"/></filter></defs>${metric.boxes.map((box) => {
    const x2 = box.x + box.w; const y2 = box.y + box.d; const z2 = box.z + box.h;
    return `<g filter="url(#shadow)">
      <polygon points="${points([[box.x,box.y,z2],[x2,box.y,z2],[x2,y2,z2],[box.x,y2,z2]])}" fill="${shade(28)}" stroke="${shade(-45)}" stroke-width=".8"/>
      <polygon points="${points([[box.x,y2,box.z],[x2,y2,box.z],[x2,y2,z2],[box.x,y2,z2]])}" fill="${shade(-18)}" stroke="${shade(-50)}" stroke-width=".8"/>
      <polygon points="${points([[x2,box.y,box.z],[x2,y2,box.z],[x2,y2,z2],[x2,box.y,z2]])}" fill="${shade(-38)}" stroke="${shade(-55)}" stroke-width=".8"/>
    </g>`;
  }).join("")}`;
  document.getElementById("outerSize").textContent = metric.assembledWidth
    ? `${metric.assembledWidth.toFixed(1)} × ${metric.assembledDepth.toFixed(1)} mm${metric.chunkCount > 1 ? ` (${metric.chunkCount} plates)` : ""}`
    : `${metric.outerWidth.toFixed(1)} × ${metric.outerDepth.toFixed(1)} mm`;
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

function renderQuotesLegacy() {
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

function renderQuotes() {
  const colour = document.getElementById("providerColourFilter").value;
  const lead = Number(document.getElementById("providerLeadFilter").value || 0);
  const rating = Number(document.getElementById("providerRatingFilter").value || 0);
  const filtered = marketplaceQuotes.filter((quote) => (!colour || quote.colourKey === colour) && (!lead || quote.leadTimeDays <= lead) && (!rating || quote.ratingAverage >= rating));
  document.getElementById("providerQuotes").innerHTML = filtered.length ? filtered.map((quote) => `
    <article class="provider-quote ${quote.id === selectedQuoteId ? "selected" : ""}">
      <span class="colour-chip" style="background:${escapeHtml(quote.colourHex || "#ccc")}"></span>
      <div><strong>${escapeHtml(quote.providerName)}</strong><small>${escapeHtml(quote.basedIn)} | ${quote.ratingCount ? `${quote.ratingAverage.toFixed(1)} / 5` : "New"} | ${quote.leadTimeDays} days</small><small>${escapeHtml(quote.colourName)} | ${Number(quote.estimatedWeightGrams || 0).toFixed(1)} g</small></div>
      <strong>${money(quote.totalIncVatPence, quote.currency)}</strong>
      <details class="quote-breakdown"><summary>Price breakdown</summary><p>Material ${money(quote.materialCostPence, quote.currency)} | Printer fee ${money(quote.printerFeePence, quote.currency)} | Postage ${money(quote.postagePence, quote.currency)} | Commission ${money(quote.commissionPence, quote.currency)} | Platform ${money(quote.platformFeePence, quote.currency)} | VAT ${money(quote.vatPence, quote.currency)}</p></details>
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

async function refreshOrdersLegacy() {
  const orders = await accountService.loadOrders();
  document.getElementById("ordersList").innerHTML = orders.length ? orders.map((order) => `<article class="order-card"><span>${escapeHtml(order.invoice_number || "Pending")} · ${escapeHtml(order.status)}</span><strong>${money(order.total_inc_vat, order.currency)}</strong></article>`).join("") : `<div class="empty">No Makeup orders yet.</div>`;
}

function orderEventTitle(event) {
  const type = event.event_type || "status";
  if (type === "provider_message") return "Message from printer";
  if (type === "customer_message") return "Message to printer";
  if (type === "decline") return "Declined and refunded";
  if (type === "auto_complete") return "Automatically completed";
  return String(event.to_status || "").replaceAll("_", " ");
}

async function refreshOrders() {
  accountOrders = await accountService.loadOrders();
  document.getElementById("ordersList").innerHTML = accountOrders.length ? accountOrders.map((order) => `
    <article class="order-card"><div><strong>${escapeHtml(order.invoice_number || "Pending invoice")}</strong><small>${escapeHtml(String(order.status || "pending").replaceAll("_", " "))}</small></div><strong>${money(order.total_inc_vat, order.currency)}</strong><button class="button secondary" data-order-detail="${escapeHtml(order.id)}" type="button">View details</button></article>
  `).join("") : `<div class="empty">No Makeup orders yet.</div>`;
  document.getElementById("orderDetail").innerHTML = "";
}

function showOrderDetail(orderId) {
  const order = accountOrders.find((candidate) => candidate.id === orderId);
  if (!order) return;
  const job = Array.isArray(order.print_jobs) ? order.print_jobs[0] : order.print_jobs;
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const events = Array.isArray(job?.print_job_events) ? job.print_job_events : [];
  const statuses = ["order_made", "producing", "posted", "complete"];
  const currentStatus = job?.status || order.status || "pending";
  const currentIndex = statuses.indexOf(currentStatus);
  document.getElementById("orderDetail").innerHTML = `
    <article class="order-detail">
      <h3>${escapeHtml(order.invoice_number || "Pending invoice")}</h3>
      ${job ? `<div class="order-status-track">${statuses.map((status, index) => `<span class="${index <= currentIndex ? "done" : ""}">${status.replaceAll("_", " ")}</span>`).join("")}</div>` : ""}
      <div class="order-detail-grid"><div><span>Status</span><strong>${escapeHtml(currentStatus.replaceAll("_", " "))}</strong></div><div><span>Total</span><strong>${money(order.total_inc_vat, order.currency)}</strong></div><div><span>Ordered</span><strong>${new Date(order.paid_at || order.created_at).toLocaleString()}</strong></div><div><span>Tracking</span><strong>${escapeHtml(job?.tracking_reference || "Not posted")}</strong></div></div>
      ${items.map((item) => `<p><strong>${escapeHtml(item.description || "Printed design")}</strong> | quantity ${item.quantity || 1}</p>`).join("")}
      ${job && !["complete", "refunded", "cancelled"].includes(job.status) ? `<div class="order-message-form"><label>Message printer<textarea data-customer-job-message rows="3" placeholder="Ask a question or add order information before completion"></textarea></label><button class="button secondary" type="button" data-send-job-message="${escapeHtml(job.id)}">Send message</button></div>` : ""}
      ${events.length ? `<div class="order-events">${events.map((event) => `<p class="event-${escapeHtml(event.event_type || "status")}"><strong>${escapeHtml(orderEventTitle(event))}</strong><small>${escapeHtml(event.note || "")} ${new Date(event.created_at).toLocaleString()}</small></p>`).join("")}</div>` : ""}
      ${job?.status === "posted" ? `<div class="order-rating-form"><h3>Confirm receipt</h3><p>Rate this print before completing the order. Completion releases the printer payout.</p><label>Rating<select data-job-rating required><option value="">Choose rating</option><option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Okay</option><option value="2">2 - Poor</option><option value="1">1 - Bad</option></select></label><label>Review note<textarea data-job-review rows="3" placeholder="Optional note about the print"></textarea></label><button class="button primary" data-complete-print-job="${escapeHtml(job.id)}" type="button">Confirm delivery and complete order</button></div>` : ""}
    </article>`;
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
    const response = await api("/api/checkout/print/verify", { method: "POST", body: JSON.stringify({ sessionId: parameters.get("session_id") }) });
    const result = await response.json().catch(() => ({}));
    toast(response.ok ? "Print order payment received" : result.error || "Payment is still being confirmed");
  }
  if (parameters.get("checkout")) history.replaceState({}, "", location.pathname);
}

function setAuthenticated(authenticated) {
  document.body.classList.toggle("authenticated", authenticated);
  document.getElementById("authGate").classList.toggle("hidden", authenticated);
}

async function configureProviderButtons() {
  const providers = await accountService.providerAvailability();
  document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
    const configured = providers[button.dataset.oauthProvider];
    button.disabled = configured === false;
    button.title = configured === false ? `${button.textContent.trim()} sign-in is not configured in Supabase yet.` : "";
  });
  const configured = Object.entries(providers).filter(([, enabled]) => enabled === true).map(([provider]) => provider);
  const unknown = Object.values(providers).some((enabled) => enabled === null);
  document.getElementById("oauthStatus").textContent = unknown
    ? "Social sign-in status could not be checked. Email sign-in remains available."
    : configured.length
      ? `${configured.map((provider) => provider[0].toUpperCase() + provider.slice(1)).join(" and ")} sign-in ready.`
      : "Google and Apple require provider credentials in Supabase. Email sign-in remains available.";
}

async function initialize() {
  document.getElementById("filamentColour").innerHTML = filamentColours.filter((colour) => colour.material === "pla").map((colour) => `<option value="${colour.key}">${colour.name}</option>`).join("");
  populateCatalogue();
  writeConstruction();
  renderPreview();
  try {
    const session = await accountService.init();
    await configureProviderButtons();
    setAuthenticated(Boolean(session));
    if (session) {
      if (accountService.authType() === "recovery") {
        const password = window.prompt("Enter your new password");
        if (password) {
          await accountService.updatePassword(password);
          toast("Password updated");
        }
      }
      await Promise.all([refreshDesigns(), refreshExportStatus()]);
      await processCheckoutResult();
    } else {
      document.getElementById("loginError").textContent = accountService.authError();
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
["maxSpineLength", "gap", "edgeMargin", "baseThickness", "wallThickness", "stepRise", "pegboardColumns", "pegboardRows", "pegboardHookSpacing", "handleHeight", "handleWidth", "filamentColour"].forEach((id) => document.getElementById(id).addEventListener("input", renderPreview));
document.querySelectorAll("[data-layout-mode]").forEach((button) => button.addEventListener("click", () => {
  state.layoutMode = button.dataset.layoutMode;
  writeConstruction();
  renderPreview();
}));
document.getElementById("handleEnabled").addEventListener("change", () => { document.getElementById("handleEnabled").checked = true; renderPreview(); });
document.querySelectorAll("[data-preview-turn]").forEach((button) => button.addEventListener("click", () => { previewYaw += Number(button.dataset.previewTurn) * Math.PI / 8; renderPreview(); }));
document.querySelector("[data-preview-reset]").addEventListener("click", () => { previewYaw = -Math.PI / 4; previewPitch = Math.PI / 5; renderPreview(); });
document.getElementById("caddyPreview").addEventListener("pointerdown", (event) => { previewDrag = { x: event.clientX, y: event.clientY, yaw: previewYaw, pitch: previewPitch }; event.currentTarget.setPointerCapture(event.pointerId); });
document.getElementById("caddyPreview").addEventListener("pointermove", (event) => { if (!previewDrag) return; previewYaw = previewDrag.yaw + (event.clientX - previewDrag.x) / 160; previewPitch = Math.max(.15, Math.min(1.35, previewDrag.pitch - (event.clientY - previewDrag.y) / 220)); renderPreview(); });
document.getElementById("caddyPreview").addEventListener("pointerup", () => { previewDrag = null; });
document.getElementById("caddyPreview").addEventListener("pointercancel", () => { previewDrag = null; });
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
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) return document.getElementById("loginError").textContent = "Enter an email and password first.";
  try {
    const result = await accountService.signUp(email, password);
    document.getElementById("loginError").textContent = result.access_token ? "Account created." : "Check your email to confirm your account.";
    if (result.access_token) setAuthenticated(true);
  } catch (error) {
    document.getElementById("loginError").textContent = error.message;
  }
});
document.getElementById("forgotPassword").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value;
  if (!email) return document.getElementById("loginError").textContent = "Enter your email first.";
  try {
    await accountService.resetPassword(email);
    document.getElementById("loginError").textContent = "Password reset email sent.";
  } catch (error) {
    document.getElementById("loginError").textContent = error.message;
  }
});
document.querySelectorAll("[data-oauth-provider]").forEach((button) => button.addEventListener("click", async () => {
  try {
    document.getElementById("loginError").textContent = `Opening ${button.textContent.trim()} sign in...`;
    await accountService.signInWithProvider(button.dataset.oauthProvider);
  } catch (error) {
    document.getElementById("loginError").textContent = error.message;
  }
}));
document.getElementById("accountButton").addEventListener("click", async () => {
  try {
    const [profile] = await Promise.all([accountService.loadProfile(), refreshOrders()]);
    const address = profile?.default_address || {};
    document.getElementById("accountEmail").value = accountService.currentUser()?.email || "";
    document.getElementById("accountDisplayName").value = profile?.display_name || "";
    document.getElementById("accountAddressLine1").value = address.line1 || "";
    document.getElementById("accountAddressLine2").value = address.line2 || "";
    document.getElementById("accountCity").value = address.city || "";
    document.getElementById("accountCounty").value = address.county || "";
    document.getElementById("accountPostcode").value = address.postcode || "";
    document.getElementById("accountCountry").value = address.country || "GB";
    document.getElementById("accountDialog").showModal();
  } catch (error) { toast(error.message); }
});
document.querySelectorAll("[data-account-tab]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-account-tab]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  document.querySelectorAll("[data-account-panel]").forEach((panel) => { panel.hidden = panel.dataset.accountPanel !== button.dataset.accountTab; });
}));
document.getElementById("makeupProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await accountService.saveProfile({ display_name: document.getElementById("accountDisplayName").value.trim() || null, default_address: { line1: document.getElementById("accountAddressLine1").value.trim(), line2: document.getElementById("accountAddressLine2").value.trim(), city: document.getElementById("accountCity").value.trim(), county: document.getElementById("accountCounty").value.trim(), postcode: document.getElementById("accountPostcode").value.trim(), country: document.getElementById("accountCountry").value.trim().toUpperCase() } });
    toast("Profile saved");
  } catch (error) { toast(error.message); }
});
document.getElementById("changePassword").addEventListener("click", async () => {
  const password = document.getElementById("accountNewPassword").value;
  if (password.length < 8) return toast("Use a password with at least 8 characters");
  try { await accountService.updatePassword(password); document.getElementById("accountNewPassword").value = ""; toast("Password updated"); } catch (error) { toast(error.message); }
});
document.getElementById("viewOrders").addEventListener("click", () => refreshOrders().catch((error) => toast(error.message)));
document.getElementById("ordersList").addEventListener("click", (event) => { const button = event.target.closest("[data-order-detail]"); if (button) showOrderDetail(button.dataset.orderDetail); });
document.getElementById("orderDetail").addEventListener("click", async (event) => {
  const completeButton = event.target.closest("[data-complete-print-job]");
  const messageButton = event.target.closest("[data-send-job-message]");
  if (!completeButton && !messageButton) return;
  try {
    let response;
    if (messageButton) {
      const note = messageButton.closest(".order-message-form").querySelector("[data-customer-job-message]").value;
      response = await api(`/api/account/print-jobs/${encodeURIComponent(messageButton.dataset.sendJobMessage)}/message`, { method: "POST", body: JSON.stringify({ note }) });
    } else {
      const form = completeButton.closest(".order-rating-form");
      const rating = Number(form.querySelector("[data-job-rating]").value);
      if (!rating || !window.confirm("Confirm this printed order has arrived? This records your rating and releases the printer payout.")) return;
      response = await api(`/api/account/print-jobs/${encodeURIComponent(completeButton.dataset.completePrintJob)}/complete`, { method: "POST", body: JSON.stringify({ rating, reviewText: form.querySelector("[data-job-review]").value }) });
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Order could not be updated");
    await refreshOrders();
    toast(messageButton ? "Message sent" : result.transfer?.released ? "Order completed and printer payout released" : "Order completed");
  } catch (error) { toast(error.message); }
});
document.getElementById("logoutButton").addEventListener("click", async () => { await accountService.signOut(); document.getElementById("accountDialog").close(); setAuthenticated(false); });

initialize();
