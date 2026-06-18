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

function stitchPreviewGeometry(config) {
  const columns = Math.max(1, config.columns);
  const rows = Math.max(1, Math.ceil(config.threads.length / columns));
  const outerWidth = columns * config.slotWidth + (columns + 1) * config.wallThickness + (columns - 1) * config.gap;
  const outerDepth = rows * config.slotDepth + (rows + 1) * config.wallThickness + (rows - 1) * config.gap + 14;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness }];
  const labels = [];
  config.threads.forEach((thread, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = config.wallThickness + col * (config.slotWidth + config.wallThickness + config.gap);
    const y = config.wallThickness + row * (config.slotDepth + config.wallThickness + config.gap);
    boxes.push(
      { x: x - config.wallThickness, y: y - config.wallThickness, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y: y + config.slotDepth, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight },
      { x: x + config.slotWidth, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight }
    );
    labels.push({
      x: x + config.slotWidth / 2,
      y: Math.min(outerDepth - 5, y + config.slotDepth + 7),
      z: config.plateThickness + 0.35,
      number: thread.number
    });
  });
  return { boxes, labels, outerWidth, outerDepth, height: config.plateThickness + config.wallHeight, rows };
}

function renderStitchPreview() {
  const config = stitchConfig();
  const geometry = stitchPreviewGeometry(config);
  window.forgetPreview3d.renderBoxes(document.getElementById("preview"), {
    width: geometry.outerWidth,
    depth: geometry.outerDepth,
    height: geometry.height,
    colour: config.filamentHex,
    boxes: geometry.boxes,
    padding: 30,
    overlay: (transform) => geometry.labels.map((label) => window.forgetPreview3d.textLabel(
      transform,
      label.x,
      label.y,
      label.z,
      escapeHtml(label.number),
      `text-anchor="middle" dominant-baseline="middle" fill="#30273a" font-size="10" font-weight="800"`
    )).join("")
  });
  document.getElementById("threadStat").textContent = config.threads.length;
  document.getElementById("rowStat").textContent = geometry.rows;
  document.getElementById("materialStat").textContent = `${Math.max(15, Math.round(config.threads.length * 2.8))} g est.`;
}

["threads", "columns", "slotWidth", "slotDepth"].forEach((id) => document.getElementById(id).addEventListener("input", renderStitchPreview));
document.getElementById("quoteButton").addEventListener("click", async () => {
  try {
    await window.generatorQuotes.request(stitchConfig(), document.getElementById("projectName").value);
    window.generatorAuth.toast("Quotes loaded");
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

window.generatorAuth.initAuth().catch((error) => { document.getElementById("loginError").textContent = error.message; });
renderStitchPreview();
