const defaults = {
  columns: 4,
  rows: 3,
  baseSize: 25,
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
  "columns", "rows", "baseSize", "gap", "clearance", "plateThickness",
  "wallHeight", "wallThickness", "notchWidth"
];
const checkboxKeys = ["lipEnabled", "notchesEnabled"];
const inputs = Object.fromEntries([...numericKeys, ...checkboxKeys].map((key) => [key, document.getElementById(key)]));
let state = { ...defaults };
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
  const innerWidth = config.columns * config.baseSize + (config.columns - 1) * config.gap + config.clearance * 2;
  const innerDepth = config.rows * config.baseSize + (config.rows - 1) * config.gap + config.clearance * 2;
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
  const innerDepth = config.rows * config.baseSize + (config.rows - 1) * config.gap + config.clearance * 2;
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

  const verticalSegments = segmentSpans(config.rows, config.baseSize, config.gap, config.clearance, notch);
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
    button.classList.toggle("active", Number(button.dataset.base) === state.baseSize);
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
  const pitch = state.baseSize + state.gap;
  for (let column = 1; column < state.columns; column += 1) {
    const x = xStart + column * state.baseSize + (column - 0.5) * state.gap;
    markup += `<line x1="${project(x, wall, base)[0]}" y1="${project(x, wall, base)[1]}" x2="${project(x, d-wall, base)[0]}" y2="${project(x, d-wall, base)[1]}" stroke="#66823c" stroke-width="0.8" stroke-dasharray="3 4" opacity=".55"/>`;
  }
  for (let row = 1; row < state.rows; row += 1) {
    const y = yStart + row * state.baseSize + (row - 0.5) * state.gap;
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

function fileName() {
  return `movement-tray-${state.columns}x${state.rows}-${formatNumber(state.baseSize)}mm.stl`;
}

function formatNumber(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "").replace(".", "-");
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

function stlText() {
  const triangles = trayMetrics().boxes.flatMap(boxTriangles);
  const facets = triangles.map((triangle) => {
    const n = normal(triangle);
    return `  facet normal ${n.join(" ")}\n    outer loop\n${triangle.map((vertex) => `      vertex ${vertex.join(" ")}`).join("\n")}\n    endloop\n  endfacet`;
  }).join("\n");
  return `solid movement_tray\n${facets}\nendsolid movement_tray\n`;
}

function exportStl() {
  const blob = new Blob([stlText()], { type: "model/stl" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName();
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`${fileName()} exported`);
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
    render();
  });
});
["exportButton", "exportTop"].forEach((id) => document.getElementById(id).addEventListener("click", exportStl));
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

render();
renderPresets();
