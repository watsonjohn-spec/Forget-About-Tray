let previewTurntable = null;
const filamentColours = [
  { key: "pla-project-lilac", material: "pla", name: "Project Lilac", hex: "#8d6aa9" },
  { key: "pla-ivory", material: "pla", name: "Ivory", hex: "#eee5d4" },
  { key: "pla-black", material: "pla", name: "Black", hex: "#252124" },
  { key: "pla-thread-red", material: "pla", name: "Thread Red", hex: "#c63d4d" },
  { key: "petg-white", material: "petg", name: "PETG White", hex: "#f1f2ee" },
  { key: "petg-clear", material: "petg", name: "Translucent", hex: "#d5d7d8" },
  { key: "abs-grey", material: "abs", name: "ABS Grey", hex: "#777c7d" },
  { key: "abs-black", material: "abs", name: "ABS Black", hex: "#202223" }
];

const stitchStyleDefaults = {
  "floss-card": { columns: 2, slotWidth: 6, slotDepth: 12, embeddedTrayWidth: 150, embeddedTrayDepth: 95, engravingDepth: 1 },
  "workstation-tray": { columns: 2, slotWidth: 18, slotDepth: 42, embeddedTrayWidth: 150, embeddedTrayDepth: 95, engravingDepth: 1 }
};

const threadPreviewColours = [
  "#2b2b2b", "#c63d4d", "#f8f1df", "#f09832", "#315aa5", "#3b8f43",
  "#b45ea5", "#6b71c8", "#d44f7f", "#8f6842", "#4db6ac", "#f2cf4a"
];

function parseThreads() {
  return document.getElementById("threads").value.split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const match = /^(\S+)\s*(.*)$/.exec(trimmed);
      return { id: `thread-${index}`, number: match?.[1] || String(index + 1), name: match?.[2] || "Thread" };
    })
    .filter(Boolean);
}

function populateColours() {
  const material = document.getElementById("filamentMaterial").value || "pla";
  const select = document.getElementById("filamentColour");
  const current = select.value;
  const options = filamentColours.filter((colour) => colour.material === material);
  select.innerHTML = options.map((colour) => `<option value="${colour.key}">${colour.name}</option>`).join("");
  select.value = options.some((colour) => colour.key === current) ? current : options[0]?.key || "";
}

function selectedFilament() {
  return filamentColours.find((colour) => colour.key === document.getElementById("filamentColour").value) || filamentColours[0];
}

function stitchConfig() {
  const filament = selectedFilament();
  return {
    style: document.getElementById("layoutStyle").value,
    projectName: document.getElementById("projectName").value.trim() || "Stitch project",
    threads: parseThreads(),
    columns: Number(document.getElementById("columns").value || 1),
    slotWidth: Number(document.getElementById("slotWidth").value || 16),
    slotDepth: Number(document.getElementById("slotDepth").value || 34),
    labelTextSize: Number(document.getElementById("threadLabelSize").value || 10),
    embeddedTrayWidth: Number(document.getElementById("embeddedTrayWidth").value || 150),
    embeddedTrayDepth: Number(document.getElementById("embeddedTrayDepth").value || 95),
    engravingDepth: Number(document.getElementById("engravingDepth").value || 1),
    gap: 2,
    wallThickness: 1.6,
    wallHeight: 10,
    plateThickness: 2,
    filamentMaterial: document.getElementById("filamentMaterial").value || "pla",
    filamentKey: filament.key,
    filamentName: filament.name,
    filamentHex: filament.hex
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function threadColour(index) {
  return threadPreviewColours[index % threadPreviewColours.length];
}

function workstationPreviewGeometry(config) {
  const columns = Math.max(1, config.columns);
  const rows = Math.max(1, Math.ceil(config.threads.length / columns));
  const labelGutterWidth = Math.max(18, config.labelTextSize * 3.2);
  const cellWidth = config.slotWidth + labelGutterWidth;
  const slotAreaWidth = columns * cellWidth + (columns + 1) * config.wallThickness + (columns - 1) * config.gap;
  const slotAreaDepth = rows * config.slotDepth + (rows + 1) * config.wallThickness + (rows - 1) * config.gap;
  const trayGap = 18;
  const outerWidth = 10 + slotAreaWidth + trayGap + config.embeddedTrayWidth + 10;
  const outerDepth = Math.max(slotAreaDepth + 22, config.embeddedTrayDepth + 32, 112);
  const boxes = [
    { x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness },
    { x: 0, y: 0, z: config.plateThickness, w: outerWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: 0, y: outerDepth - config.wallThickness * 2, z: config.plateThickness, w: outerWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: 0, y: 0, z: config.plateThickness, w: config.wallThickness * 2, d: outerDepth, h: config.wallHeight },
    { x: outerWidth - config.wallThickness * 2, y: 0, z: config.plateThickness, w: config.wallThickness * 2, d: outerDepth, h: config.wallHeight }
  ];
  const bobbinX = 10;
  const bobbinY = 10;
  const previewBoxes = [];
  const labels = [];
  const engravedLabels = [];
  config.threads.forEach((thread, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = bobbinX + config.wallThickness + col * (cellWidth + config.wallThickness + config.gap);
    const y = bobbinY + config.wallThickness + row * (config.slotDepth + config.wallThickness + config.gap);
    const labelCenterX = x + config.slotWidth + labelGutterWidth / 2;
    const labelCenterY = y + config.slotDepth / 2;
    boxes.push(
      { x: x - config.wallThickness, y: y - config.wallThickness, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y: y + config.slotDepth, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight },
      { x: x + config.slotWidth, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight }
    );
    previewBoxes.push({
      x: x + config.slotWidth * 0.12,
      y: y + config.slotDepth * 0.1,
      z: config.plateThickness + 0.4,
      w: config.slotWidth * 0.76,
      d: config.slotDepth * 0.78,
      h: Math.min(12, config.wallHeight + 2),
      previewColour: threadColour(index),
      previewOpacity: 0.48,
      previewClass: "preview-thread-bobbin"
    });
    engravedLabels.push({ text: thread.number, x: labelCenterX, y: labelCenterY, depth: config.engravingDepth });
    labels.push({ x: labelCenterX, y: labelCenterY, z: config.plateThickness + 0.9, text: thread.number, fill: "#30273a", size: config.labelTextSize });
  });
  const trayX = bobbinX + slotAreaWidth + trayGap;
  const trayY = Math.max(16, (outerDepth - config.embeddedTrayDepth) / 2);
  const trayWall = config.wallThickness * 2;
  boxes.push(
    { x: trayX, y: trayY, z: config.plateThickness, w: config.embeddedTrayWidth, d: trayWall, h: config.wallHeight },
    { x: trayX, y: trayY + config.embeddedTrayDepth - trayWall, z: config.plateThickness, w: config.embeddedTrayWidth, d: trayWall, h: config.wallHeight },
    { x: trayX, y: trayY, z: config.plateThickness, w: trayWall, d: config.embeddedTrayDepth, h: config.wallHeight },
    { x: trayX + config.embeddedTrayWidth - trayWall, y: trayY, z: config.plateThickness, w: trayWall, d: config.embeddedTrayDepth, h: config.wallHeight },
    { x: trayX + trayWall, y: trayY + trayWall, z: config.plateThickness + 0.08, w: config.embeddedTrayWidth - trayWall * 2, d: config.embeddedTrayDepth - trayWall * 2, h: 0.2, previewColour: "#efece4", previewOpacity: 0.42 }
  );
  labels.push({ x: trayX + config.embeddedTrayWidth / 2, y: trayY + 12, z: config.plateThickness + config.wallHeight + 0.8, text: "embedded tray", fill: "#30273a", size: 10 });
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  return { style: "Workstation", boxes, previewBoxes, labels, engravedLabels, holes: [], threadPaths: [], embeddedTray: { x: trayX, y: trayY, w: config.embeddedTrayWidth, d: config.embeddedTrayDepth }, outerWidth, outerDepth, height: config.plateThickness + config.wallHeight + 12, rows, materialCm3 };
}

function flossCardPreviewGeometry(config) {
  const perSide = Math.max(1, Math.ceil(config.threads.length / 2));
  const holeDiameter = Math.max(4, Math.min(12, config.slotWidth));
  const pitch = Math.max(holeDiameter + 5, config.slotDepth);
  const headerDepth = 20;
  const margin = 9;
  const outerWidth = 64;
  const outerDepth = headerDepth + margin * 2 + perSide * pitch;
  const leftX = 12;
  const rightX = outerWidth - 12;
  const boxes = [
    { x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness },
    { x: outerWidth / 2 - 4, y: headerDepth + 2, z: config.plateThickness + 0.1, w: 8, d: outerDepth - headerDepth - 8, h: 0.8, previewColour: "#343638", previewOpacity: 0.88 },
    { x: 5, y: 4, z: config.plateThickness + 0.1, w: outerWidth - 10, d: 4, h: 0.7, previewColour: "#efece4", previewOpacity: 0.92 }
  ];
  const holes = [{ x: outerWidth / 2, y: 8, rx: 4, ry: 2.4, kind: "slot" }];
  const labels = [{ x: outerWidth / 2, y: 15.5, z: config.plateThickness + 0.8, text: config.projectName, fill: "#30273a", size: Math.max(7, Math.min(12, config.labelTextSize + 1)) }];
  const threadPaths = [];
  config.threads.forEach((thread, index) => {
    const rightSide = index % 2 === 1;
    const row = Math.floor(index / 2);
    const x = rightSide ? rightX : leftX;
    const y = headerDepth + margin + row * pitch;
    const labelX = rightSide ? outerWidth / 2 + 8 : outerWidth / 2 - 8;
    holes.push({ x, y, rx: holeDiameter / 2, ry: holeDiameter / 2, kind: "hole" });
    labels.push({ x: labelX, y: y + 1.5, z: config.plateThickness + 0.8, text: thread.number, fill: "#30273a", size: config.labelTextSize });
    threadPaths.push({
      colour: threadColour(index),
      start: { x, y, z: config.plateThickness + 0.9 },
      control: { x: rightSide ? outerWidth + 10 : -10, y: y + 2, z: 7 },
      end: { x: rightSide ? outerWidth + 28 : -28, y: y + (index % 3 - 1) * 5, z: 4 }
    });
  });
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  return { style: "Floss card", boxes, previewBoxes: [], labels, holes, threadPaths, outerWidth, outerDepth, height: config.plateThickness + 8, rows: perSide, materialCm3 };
}

function stitchPreviewGeometry(config) {
  return config.style === "floss-card" ? flossCardPreviewGeometry(config) : workstationPreviewGeometry(config);
}

function curvedThreadPath(transform, thread) {
  const start = transform.project(thread.start.x, thread.start.y, thread.start.z);
  const control = transform.project(thread.control.x, thread.control.y, thread.control.z);
  const end = transform.project(thread.end.x, thread.end.y, thread.end.z);
  return `<path d="M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}" fill="none" stroke="${thread.colour}" stroke-width="4" stroke-linecap="round" opacity=".76"/>`;
}

function renderStitchPreview(view = previewTurntable?.state || {}) {
  const config = stitchConfig();
  const geometry = stitchPreviewGeometry(config);
  window.forgetPreview3d.renderBoxes(document.getElementById("preview"), {
    width: geometry.outerWidth,
    depth: geometry.outerDepth,
    height: geometry.height,
    yaw: view.yaw,
    pitch: view.pitch,
    colour: config.filamentHex,
    boxes: [...geometry.boxes, ...geometry.previewBoxes],
    padding: 30,
    overlay: (transform) => [
      ...geometry.holes.map((hole) => window.forgetPreview3d.ellipsePolygon(
        transform,
        hole.x,
        hole.y,
        config.plateThickness + 1,
        hole.rx,
        hole.ry,
        `fill="#f8f5ec" stroke="#30273a" stroke-width=".9" opacity=".95"`
      )),
      ...geometry.threadPaths.map((thread) => curvedThreadPath(transform, thread)),
      ...geometry.labels.map((label) => window.forgetPreview3d.textLabel(
        transform,
        label.x,
        label.y,
        label.z,
        escapeHtml(label.text),
        `text-anchor="middle" dominant-baseline="middle" fill="${label.fill}" font-size="${Math.max(7, Math.min(16, Number(label.size || config.labelTextSize)))}" font-weight="850"`
      ))
    ].join("")
  });
  document.getElementById("threadStat").textContent = config.threads.length;
  document.getElementById("rowStat").textContent = geometry.rows;
  document.getElementById("styleStat").textContent = geometry.style;
  document.getElementById("materialStat").textContent = `${window.forgetPrintEstimates.generatedWeightGrams(geometry.materialCm3, config.filamentMaterial).toFixed(1)} g est.`;
}

function applyStyleDefaults() {
  const style = document.getElementById("layoutStyle").value;
  const defaults = stitchStyleDefaults[style] || stitchStyleDefaults["workstation-tray"];
  const isFlossCard = style === "floss-card";
  document.getElementById("columns").value = defaults.columns;
  document.getElementById("slotWidth").value = defaults.slotWidth;
  document.getElementById("slotDepth").value = defaults.slotDepth;
  document.getElementById("embeddedTrayWidth").value = defaults.embeddedTrayWidth;
  document.getElementById("embeddedTrayDepth").value = defaults.embeddedTrayDepth;
  document.getElementById("engravingDepth").value = defaults.engravingDepth;
  document.getElementById("columnsLabel").textContent = isFlossCard ? "Hole columns" : "Bobbin columns";
  document.getElementById("slotWidthLabel").textContent = isFlossCard ? "Hole diameter" : "Slot width";
  document.getElementById("slotDepthLabel").textContent = isFlossCard ? "Hole spacing" : "Slot depth";
  previewTurntable.render();
}

document.getElementById("filamentMaterial").addEventListener("change", () => {
  populateColours();
  previewTurntable.render();
});
populateColours();
["projectName", "threads", "columns", "slotWidth", "slotDepth", "threadLabelSize", "embeddedTrayWidth", "embeddedTrayDepth", "engravingDepth", "filamentColour", "filamentMaterial"].forEach((id) => document.getElementById(id).addEventListener("input", () => previewTurntable.render()));
document.getElementById("layoutStyle").addEventListener("change", applyStyleDefaults);
document.getElementById("quoteButton").addEventListener("click", async () => {
  try {
    await window.generatorQuotes.request(stitchConfig(), document.getElementById("projectName").value);
    window.generatorAuth.toast("Quotes loaded");
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

window.generatorAuth.initAuth().catch((error) => { document.getElementById("loginError").textContent = error.message; });
window.generatorCurrentConfig = stitchConfig;
window.generatorCurrentName = () => document.getElementById("projectName").value.trim() || "Stitch project";
previewTurntable = window.forgetPreview3d.createTurntable(document.getElementById("preview"), renderStitchPreview);
document.querySelectorAll("[data-preview-turn]").forEach((button) => button.addEventListener("click", () => previewTurntable.turn(Number(button.dataset.previewTurn) * Math.PI / 8)));
document.querySelector("[data-preview-reset]").addEventListener("click", () => previewTurntable.reset());
previewTurntable.render();
