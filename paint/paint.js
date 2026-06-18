function value(id) {
  return document.getElementById(id).value;
}

function number(id) {
  return Number(value(id) || 0);
}

function paintConfig() {
  return {
    paintType: value("paintType"),
    paintCount: number("paintCount"),
    paintDiameter: number("paintDiameter"),
    brushSlots: number("brushSlots"),
    columns: number("columns"),
    wallHeight: number("wallHeight"),
    clearance: 2,
    wallThickness: 2,
    plateThickness: 2.4,
    filamentMaterial: "pla",
    filamentKey: "pla-workshop-green",
    filamentName: "Workshop Green",
    filamentHex: "#4f7b6f"
  };
}

function bottleDiameter(config) {
  if (config.paintType === "citadel") return 34;
  if (config.paintType === "vallejo") return 25;
  return config.paintDiameter;
}

function paintPreviewGeometry(config) {
  const diameter = bottleDiameter(config);
  const columns = Math.max(1, config.columns);
  const rows = Math.max(1, Math.ceil(config.paintCount / columns));
  const slot = diameter + config.clearance * 2;
  const brushDepth = config.brushSlots ? 22 : 0;
  const outerWidth = columns * slot + (columns + 1) * config.wallThickness;
  const outerDepth = rows * slot + (rows + 1) * config.wallThickness + brushDepth;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness }];
  const cylinders = [];
  for (let index = 0; index < config.paintCount; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = config.wallThickness + col * (slot + config.wallThickness);
    const y = config.wallThickness + row * (slot + config.wallThickness);
    boxes.push(
      { x: x - config.wallThickness, y: y - config.wallThickness, z: config.plateThickness, w: slot + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y: y + slot, z: config.plateThickness, w: slot + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y, z: config.plateThickness, w: config.wallThickness, d: slot, h: config.wallHeight },
      { x: x + slot, y, z: config.plateThickness, w: config.wallThickness, d: slot, h: config.wallHeight }
    );
    cylinders.push({
      cx: x + slot / 2,
      cy: y + slot / 2,
      z: config.plateThickness + 0.2,
      rx: diameter / 2,
      ry: diameter / 2,
      h: Math.max(3, Math.min(11, config.wallHeight * 0.5)),
      previewColour: "#f8fbf6",
      previewOpacity: 0.38,
      previewClass: "preview-placement-footprint"
    });
  }
  if (config.brushSlots) {
    const y = outerDepth - brushDepth;
    const pitch = outerWidth / config.brushSlots;
    for (let index = 1; index < config.brushSlots; index += 1) {
      boxes.push({ x: index * pitch - 0.75, y, z: config.plateThickness, w: 1.5, d: brushDepth, h: 9 });
    }
    boxes.push({ x: 0, y, z: config.plateThickness, w: outerWidth, d: config.wallThickness, h: 9 });
  }
  return { boxes, cylinders, outerWidth, outerDepth, height: config.plateThickness + config.wallHeight, rows, diameter };
}

function renderPaintPreview() {
  const config = paintConfig();
  const geometry = paintPreviewGeometry(config);
  window.forgetPreview3d.renderBoxes(document.getElementById("preview"), {
    width: geometry.outerWidth,
    depth: geometry.outerDepth,
    height: geometry.height,
    colour: config.filamentHex,
    boxes: geometry.boxes,
    cylinders: geometry.cylinders,
    padding: 28
  });
  document.getElementById("paintStat").textContent = config.paintCount;
  document.getElementById("rowStat").textContent = geometry.rows;
  document.getElementById("brushStat").textContent = config.brushSlots;
  document.getElementById("materialStat").textContent = `${Math.max(20, Math.round(config.paintCount * geometry.diameter * .18 + config.brushSlots * 1.5))} g est.`;
}

document.querySelectorAll("input,select").forEach((input) => input.addEventListener("input", renderPaintPreview));
document.getElementById("quoteButton").addEventListener("click", async () => {
  try {
    await window.generatorQuotes.request(paintConfig(), value("projectName"));
    window.generatorAuth.toast("Quotes loaded");
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

window.generatorAuth.initAuth().catch((error) => { document.getElementById("loginError").textContent = error.message; });
renderPaintPreview();
