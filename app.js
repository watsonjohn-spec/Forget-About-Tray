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
let toastTimer;

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
      <linearGradient id="trayTop" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#d9ff96"/><stop offset="1" stop-color="#9fcb59"/></linearGradient>
      <linearGradient id="traySide" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#789746"/><stop offset="1" stop-color="#50652f"/></linearGradient>
      <linearGradient id="trayFront" x1="0" x2="1"><stop offset="0" stop-color="#607b38"/><stop offset="1" stop-color="#86a950"/></linearGradient>
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
    markup += `<line x1="${project(x, wall, base)[0]}" y1="${project(x, wall, base)[1]}" x2="${project(x, d-wall, base)[0]}" y2="${project(x, d-wall, base)[1]}" stroke="#66823c" stroke-width="0.8" stroke-dasharray="3 4" opacity=".55"/>`;
  }
  for (let row = 1; row < state.rows; row += 1) {
    const y = yStart + row * state.baseDepth + (row - 0.5) * state.gap;
    markup += `<line x1="${project(wall, y, base)[0]}" y1="${project(wall, y, base)[1]}" x2="${project(w-wall, y, base)[0]}" y2="${project(w-wall, y, base)[1]}" stroke="#66823c" stroke-width="0.8" stroke-dasharray="3 4" opacity=".55"/>`;
  }

  if (state.lipEnabled) {
    const wallBoxes = metrics.boxes.slice(1);
    wallBoxes.forEach((box) => {
      const x1 = box.x;
      const y1 = box.y;
      const x2 = box.x + box.w;
      const y2 = box.y + box.d;
      markup += `
        <polygon points="${points([[x1,y1,top],[x2,y1,top],[x2,y2,top],[x1,y2,top]])}" fill="#c6ef7e" stroke="#42552a" stroke-width="1"/>
        <polygon points="${points([[x1,y2,base],[x2,y2,base],[x2,y2,top],[x1,y2,top]])}" fill="#7e9e4a" stroke="#42552a" stroke-width=".8"/>
        <polygon points="${points([[x2,y1,base],[x2,y2,base],[x2,y2,top],[x2,y1,top]])}" fill="#6b883f" stroke="#42552a" stroke-width=".8"/>
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
  { id: "razorgor-chariots", name: "Razorgor Chariots", width: 50, depth: 100, aliases: ["razorgor chariots", "razorgor chariot"] }
];

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
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const normalized = normalizeText(line);
    const matches = baseCatalogue
      .flatMap((entry) => entry.aliases.map((alias) => ({ entry, alias })))
      .filter(({ alias }) => normalized.includes(alias))
      .sort((a, b) => b.alias.length - a.alias.length);
    const catalogueMatch = matches[0];
    const count = quantityFromLine(line, catalogueMatch?.alias);
    if (count < 2 || count > 500) return;

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
  return [...found.values()];
}

function recommendationConfig(recommendation) {
  return {
    ...defaults,
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

function renderArmyRecommendations() {
  const container = document.getElementById("armyResults");
  const summary = document.getElementById("armySummary");
  if (!armyRecommendations.length) {
    summary.textContent = "No ranked units found";
    container.innerHTML = `<div class="empty-army">No usable unit lines were found. Try lines such as "20 Ungor Raiders" or "20x Bestigor Herds".</div>`;
    return;
  }
  const recognised = armyRecommendations.filter((item) => item.matched).length;
  summary.textContent = `${armyRecommendations.length} units - ${recognised} catalogue matches`;
  container.innerHTML = armyRecommendations.map((item) => {
    const ready = item.baseSize > 0 && item.baseDepth > 0;
    const capacity = item.columns * item.rows;
    const copyText = item.copies > 1 ? `${item.copies} identical units - print ${item.copies}` : `${item.count} models`;
    return `
      <article class="army-unit" data-recommendation="${escapeHtml(item.id)}">
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
          <button type="button" data-army-action="load" ${ready ? "" : "disabled"}>Load</button>
          <button type="button" data-army-action="save" ${ready ? "" : "disabled"}>Save</button>
          <button type="button" data-army-action="export" ${ready ? "" : "disabled"}>Export STL</button>
        </div>
      </article>
    `;
  }).join("");
}

function analyzeArmyList() {
  armyRecommendations = parseArmyList(document.getElementById("armyList").value);
  renderArmyRecommendations();
  showToast(armyRecommendations.length ? `${armyRecommendations.length} tray suggestions ready` : "No ranked units found");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

Object.values(inputs).forEach((input) => input.addEventListener("input", render));
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
["exportButton", "exportTop"].forEach((id) => document.getElementById(id).addEventListener("click", () => exportStl()));
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
document.getElementById("armyResults").addEventListener("click", (event) => {
  const action = event.target.dataset.armyAction;
  const card = event.target.closest("[data-recommendation]");
  if (!action || !card) return;
  const recommendation = armyRecommendations.find((item) => item.id === card.dataset.recommendation);
  if (!recommendation || recommendation.baseSize <= 0 || recommendation.baseDepth <= 0) return;
  rememberUnitBase(recommendation);
  const config = recommendationConfig(recommendation);
  if (action === "load") {
    writeState(config);
    document.querySelector(".workspace").scrollIntoView({ behavior: "smooth" });
    showToast(`${recommendation.name} loaded into the designer`);
  }
  if (action === "save") saveRecommendation(recommendation);
  if (action === "export") exportStl(config, recommendation.name);
});

render();
renderPresets();
