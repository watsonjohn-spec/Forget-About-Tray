let previewTurntable = null;

const stitchStyleDefaults = {
  "floss-card": { columns: 2, slotWidth: 6, slotDepth: 12 },
  "workstation-tray": { columns: 6, slotWidth: 16, slotDepth: 34 }
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

function stitchConfig() {
  return {
    style: document.getElementById("layoutStyle").value,
    threads: parseThreads(),
    columns: Number(document.getElementById("columns").value || 1),
    slotWidth: Number(document.getElementById("slotWidth").value || 16),
    slotDepth: Number(document.getElementById("slotDepth").value || 34),
    gap: 2,
    wallThickness: 1.6,
    wallHeight: 10,
    plateThickness: 2,
    filamentMaterial: "pla",
    filamentKey: "pla-project-lilac",
    filamentName: "Project Lilac",
    filamentHex: "#8d6aa9"
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
  const slotAreaWidth = columns * config.slotWidth + (columns + 1) * config.wallThickness + (columns - 1) * config.gap;
  const slotAreaDepth = rows * config.slotDepth + (rows + 1) * config.wallThickness + (rows - 1) * config.gap;
  const toolWidth = Math.max(96, Math.min(170, slotAreaWidth * 0.92));
  const outerWidth = slotAreaWidth + toolWidth + 28;
  const outerDepth = Math.max(slotAreaDepth + 22, 112);
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
  config.threads.forEach((thread, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = bobbinX + config.wallThickness + col * (config.slotWidth + config.wallThickness + config.gap);
    const y = bobbinY + config.wallThickness + row * (config.slotDepth + config.wallThickness + config.gap);
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
    labels.push({ x: x + config.slotWidth / 2, y: y + 5, z: config.plateThickness + config.wallHeight + 0.6, text: thread.number, fill: "#fffdf4" });
  });
  const toolX = bobbinX + slotAreaWidth + 16;
  const toolY = 16;
  const toolD = outerDepth - 32;
  boxes.push(
    { x: toolX, y: toolY, z: config.plateThickness, w: toolWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: toolX, y: toolY + toolD - config.wallThickness * 2, z: config.plateThickness, w: toolWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: toolX, y: toolY, z: config.plateThickness, w: config.wallThickness * 2, d: toolD, h: config.wallHeight },
    { x: toolX + toolWidth - config.wallThickness * 2, y: toolY, z: config.plateThickness, w: config.wallThickness * 2, d: toolD, h: config.wallHeight },
    { x: toolX + 10, y: toolY + toolD * 0.58, z: config.plateThickness + 0.1, w: toolWidth - 20, d: config.wallThickness, h: config.wallHeight * 0.55 }
  );
  labels.push({ x: toolX + toolWidth / 2, y: toolY + 11, z: config.plateThickness + config.wallHeight + 0.8, text: "tools", fill: "#30273a" });
  return { style: "Workstation", boxes, previewBoxes, labels, holes: [], threadPaths: [], outerWidth, outerDepth, height: config.plateThickness + config.wallHeight + 12, rows };
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
  const labels = [{ x: outerWidth / 2, y: 16, z: config.plateThickness + 0.8, text: "PROJECT", fill: "#30273a" }];
  const threadPaths = [];
  config.threads.forEach((thread, index) => {
    const rightSide = index % 2 === 1;
    const row = Math.floor(index / 2);
    const x = rightSide ? rightX : leftX;
    const y = headerDepth + margin + row * pitch;
    const labelX = rightSide ? outerWidth / 2 + 8 : outerWidth / 2 - 8;
    holes.push({ x, y, rx: holeDiameter / 2, ry: holeDiameter / 2, kind: "hole" });
    labels.push({ x: labelX, y: y + 1.5, z: config.plateThickness + 0.8, text: thread.number, fill: "#30273a" });
    threadPaths.push({
      colour: threadColour(index),
      start: { x, y, z: config.plateThickness + 0.9 },
      control: { x: rightSide ? outerWidth + 10 : -10, y: y + 2, z: 7 },
      end: { x: rightSide ? outerWidth + 28 : -28, y: y + (index % 3 - 1) * 5, z: 4 }
    });
  });
  return { style: "Floss card", boxes, previewBoxes: [], labels, holes, threadPaths, outerWidth, outerDepth, height: config.plateThickness + 8, rows: perSide };
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
        `text-anchor="middle" dominant-baseline="middle" fill="${label.fill}" font-size="9" font-weight="850"`
      ))
    ].join("")
  });
  document.getElementById("threadStat").textContent = config.threads.length;
  document.getElementById("rowStat").textContent = geometry.rows;
  document.getElementById("styleStat").textContent = geometry.style;
  document.getElementById("materialStat").textContent = `${Math.max(15, Math.round(geometry.boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000 * 1.24))} g est.`;
}

function applyStyleDefaults() {
  const defaults = stitchStyleDefaults[document.getElementById("layoutStyle").value] || stitchStyleDefaults["workstation-tray"];
  document.getElementById("columns").value = defaults.columns;
  document.getElementById("slotWidth").value = defaults.slotWidth;
  document.getElementById("slotDepth").value = defaults.slotDepth;
  document.getElementById("columnsLabel").textContent = defaults.columns === 2 ? "Hole columns" : "Bobbin columns";
  document.getElementById("slotWidthLabel").textContent = defaults.columns === 2 ? "Hole diameter" : "Slot width";
  document.getElementById("slotDepthLabel").textContent = defaults.columns === 2 ? "Hole spacing" : "Slot depth";
  previewTurntable.render();
}

["threads", "columns", "slotWidth", "slotDepth"].forEach((id) => document.getElementById(id).addEventListener("input", () => previewTurntable.render()));
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
previewTurntable = window.forgetPreview3d.createTurntable(document.getElementById("preview"), renderStitchPreview);
document.querySelectorAll("[data-preview-turn]").forEach((button) => button.addEventListener("click", () => previewTurntable.turn(Number(button.dataset.previewTurn) * Math.PI / 8)));
document.querySelector("[data-preview-reset]").addEventListener("click", () => previewTurntable.reset());
previewTurntable.render();
