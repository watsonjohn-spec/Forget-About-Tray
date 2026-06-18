const filamentColours = [
  { key: "pla-workshop-green", material: "pla", name: "Workshop Green", hex: "#4f7b6f" },
  { key: "pla-jade-white", material: "pla", name: "Jade White", hex: "#ebeee9" },
  { key: "pla-sun-yellow", material: "pla", name: "Sun Yellow", hex: "#f4d03f" },
  { key: "pla-black", material: "pla", name: "Black", hex: "#202223" },
  { key: "petg-white", material: "petg", name: "PETG White", hex: "#f1f2ee" },
  { key: "petg-clear-blue", material: "petg", name: "Clear Blue", hex: "#8fb6c9" },
  { key: "petg-black", material: "petg", name: "PETG Black", hex: "#1c1e1f" },
  { key: "abs-grey", material: "abs", name: "ABS Grey", hex: "#777c7d" },
  { key: "abs-black", material: "abs", name: "ABS Black", hex: "#202223" }
];
let previewTurntable = null;
let paintMode = "paint-box";

function value(id) {
  return document.getElementById(id).value;
}

function number(id) {
  return Number(value(id) || 0);
}

function populateColours() {
  const material = value("filamentMaterial") || "pla";
  const select = document.getElementById("filamentColour");
  const current = select.value;
  const options = filamentColours.filter((colour) => colour.material === material);
  select.innerHTML = options.map((colour) => `<option value="${colour.key}">${colour.name}</option>`).join("");
  select.value = options.some((colour) => colour.key === current) ? current : options[0]?.key || "";
}

function selectedFilament() {
  return filamentColours.find((colour) => colour.key === value("filamentColour")) || filamentColours.find((colour) => colour.material === "pla") || filamentColours[0];
}

function paintConfig() {
  const filament = selectedFilament();
  return {
    layoutMode: paintMode,
    paintType: value("paintType"),
    paintCount: number("paintCount"),
    paintDiameter: number("paintDiameter"),
    brushSlots: number("brushSlots"),
    brushStandHoles: number("brushStandHoles"),
    waterPots: number("waterPots"),
    printLid: value("printLid") === "yes",
    columns: number("columns"),
    wallHeight: number("wallHeight"),
    clearance: 2,
    wallThickness: 2,
    plateThickness: 2.4,
    filamentMaterial: value("filamentMaterial") || "pla",
    filamentKey: filament.key,
    filamentName: filament.name,
    filamentHex: filament.hex
  };
}

function bottleDiameter(config) {
  if (config.paintType === "citadel") return 34;
  if (config.paintType === "vallejo") return 25;
  return config.paintDiameter;
}

function slotWalls(boxes, x, y, slot, wall, height, z) {
  boxes.push(
    { x: x - wall, y: y - wall, z, w: slot + wall * 2, d: wall, h: height, previewClass: "paint-wall" },
    { x: x - wall, y: y + slot, z, w: slot + wall * 2, d: wall, h: height, previewClass: "paint-wall" },
    { x: x - wall, y, z, w: wall, d: slot, h: height, previewClass: "paint-wall" },
    { x: x + slot, y, z, w: wall, d: slot, h: height, previewClass: "paint-wall" }
  );
}

function paintBoxGeometry(config) {
  const diameter = bottleDiameter(config);
  const columns = Math.max(1, config.columns);
  const rows = Math.max(1, Math.ceil(config.paintCount / columns));
  const slot = diameter + config.clearance * 2;
  const brushDepth = config.brushSlots ? 24 : 0;
  const lidGap = config.printLid ? 14 : 0;
  const lidDepth = config.printLid ? 34 : 0;
  const outerWidth = columns * slot + (columns + 1) * config.wallThickness;
  const trayDepth = rows * slot + (rows + 1) * config.wallThickness + brushDepth;
  const outerDepth = trayDepth + lidGap + lidDepth;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: trayDepth, h: config.plateThickness, previewClass: "paint-base" }];
  const cylinders = [];
  for (let index = 0; index < config.paintCount; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = config.wallThickness + col * (slot + config.wallThickness);
    const y = config.wallThickness + row * (slot + config.wallThickness);
    slotWalls(boxes, x, y, slot, config.wallThickness, config.wallHeight, config.plateThickness);
    cylinders.push({
      cx: x + slot / 2,
      cy: y + slot / 2,
      z: config.plateThickness + 0.2,
      rx: diameter / 2,
      ry: diameter / 2,
      h: Math.max(3, Math.min(11, config.wallHeight * 0.5)),
      previewColour: "#f8fbf6",
      previewOpacity: 0.42,
      previewClass: "preview-placement-footprint"
    });
  }
  if (config.brushSlots) {
    const y = trayDepth - brushDepth;
    const pitch = outerWidth / Math.max(1, config.brushSlots);
    for (let index = 1; index < config.brushSlots; index += 1) {
      boxes.push({ x: index * pitch - 0.7, y, z: config.plateThickness, w: 1.4, d: brushDepth, h: 9, previewClass: "brush-divider" });
    }
    boxes.push({ x: 0, y, z: config.plateThickness, w: outerWidth, d: config.wallThickness, h: 9, previewClass: "brush-rail" });
  }
  if (config.printLid) {
    boxes.push({
      x: 0,
      y: trayDepth + lidGap,
      z: 0,
      w: outerWidth,
      d: lidDepth,
      h: config.plateThickness,
      previewColour: window.forgetPreview3d.mixColour(config.filamentHex, "#ffffff", 0.22),
      previewClass: "second-plate-lid"
    });
  }
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  return { boxes, cylinders, outerWidth, outerDepth, height: config.plateThickness + config.wallHeight, rows, diameter, materialCm3 };
}

function paintingStationGeometry(config) {
  const diameter = bottleDiameter(config);
  const slot = diameter + config.clearance * 2;
  const wall = config.wallThickness;
  const backCount = Math.max(1, Math.min(config.columns, config.paintCount));
  const sideCount = Math.max(0, Math.ceil((config.paintCount - backCount) / 2));
  const centreWidth = Math.max(120, backCount * slot * 0.72);
  const centreDepth = Math.max(86, sideCount * slot * 0.6);
  const sideWidth = slot + wall * 2;
  const backDepth = slot + wall * 2;
  const outerWidth = sideWidth * 2 + centreWidth + wall * 2;
  const outerDepth = backDepth + centreDepth + 58;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness, previewClass: "station-base" }];
  const cylinders = [];
  const positions = [];
  for (let index = 0; index < config.paintCount; index += 1) {
    if (index < backCount) {
      const spacing = centreWidth / backCount;
      positions.push({ x: sideWidth + wall + index * spacing + (spacing - slot) / 2, y: wall });
    } else {
      const sideIndex = index - backCount;
      const left = sideIndex % 2 === 0;
      const row = Math.floor(sideIndex / 2);
      positions.push({
        x: left ? wall : outerWidth - sideWidth + wall,
        y: backDepth + wall + row * slot
      });
    }
  }
  positions.forEach((position) => {
    slotWalls(boxes, position.x, position.y, slot, wall, config.wallHeight, config.plateThickness);
    cylinders.push({
      cx: position.x + slot / 2,
      cy: position.y + slot / 2,
      z: config.plateThickness + 0.4,
      rx: diameter / 2,
      ry: diameter / 2,
      h: Math.max(4, Math.min(12, config.wallHeight * 0.52)),
      previewColour: "#fffaf0",
      previewOpacity: 0.38,
      previewClass: "preview-placement-footprint"
    });
  });
  const potDiameter = 42;
  for (let index = 0; index < config.waterPots; index += 1) {
    const x = outerWidth / 2 + (index - (config.waterPots - 1) / 2) * (potDiameter + 9);
    const y = outerDepth - 33;
    cylinders.push({ cx: x, cy: y, z: config.plateThickness, rx: potDiameter / 2, ry: potDiameter / 2, h: 14, previewColour: "#c9e3eb", previewOpacity: 0.62, previewClass: "water-pot" });
  }
  if (config.brushStandHoles) {
    const railY = outerDepth - 57;
    boxes.push({ x: sideWidth + 12, y: railY, z: config.plateThickness, w: centreWidth - 24, d: 16, h: 12, previewClass: "brush-stand-rail" });
    const pitch = (centreWidth - 36) / Math.max(1, config.brushStandHoles - 1);
    for (let index = 0; index < config.brushStandHoles; index += 1) {
      cylinders.push({ cx: sideWidth + 18 + pitch * index, cy: railY + 8, z: config.plateThickness + 12, rx: 2.4, ry: 2.4, h: 1.2, previewColour: "#2e3f39", previewOpacity: 0.74, previewClass: "brush-hole" });
    }
  }
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  const rows = Math.max(1, 1 + sideCount);
  return { boxes, cylinders, outerWidth, outerDepth, height: config.plateThickness + config.wallHeight + 5, rows, diameter, materialCm3 };
}

function paintPreviewGeometry(config) {
  return config.layoutMode === "painting-station" ? paintingStationGeometry(config) : paintBoxGeometry(config);
}

function renderPaintPreview(view = previewTurntable?.state || {}) {
  const config = paintConfig();
  const geometry = paintPreviewGeometry(config);
  window.forgetPreview3d.renderBoxes(document.getElementById("preview"), {
    width: geometry.outerWidth,
    depth: geometry.outerDepth,
    height: geometry.height,
    yaw: view.yaw,
    pitch: view.pitch,
    colour: config.filamentHex,
    boxes: geometry.boxes,
    cylinders: geometry.cylinders,
    padding: 28
  });
  document.getElementById("paintStat").textContent = config.paintCount;
  document.getElementById("rowStat").textContent = geometry.rows;
  document.getElementById("brushStat").textContent = config.layoutMode === "painting-station" ? `${config.brushStandHoles} holes` : config.brushSlots;
  document.getElementById("materialStat").textContent = `${window.forgetPrintEstimates.generatedWeightGrams(geometry.materialCm3, config.filamentMaterial).toFixed(1)} g est.`;
}

function setPaintMode(mode) {
  paintMode = mode;
  document.querySelectorAll("[data-paint-mode]").forEach((button) => button.classList.toggle("active", button.dataset.paintMode === mode));
  document.getElementById("printLid").closest("label").hidden = mode !== "paint-box";
  document.getElementById("waterPots").closest("label").hidden = mode !== "painting-station";
  document.getElementById("brushStandHoles").closest("label").hidden = mode !== "painting-station";
  document.getElementById("brushSlots").closest("label").hidden = mode !== "paint-box";
  previewTurntable?.render();
}

document.getElementById("filamentMaterial").addEventListener("change", () => {
  populateColours();
  previewTurntable.render();
});
populateColours();
document.querySelectorAll("input,select").forEach((input) => input.addEventListener("input", () => previewTurntable.render()));
document.querySelectorAll("[data-paint-mode]").forEach((button) => button.addEventListener("click", () => setPaintMode(button.dataset.paintMode)));
document.getElementById("quoteButton").addEventListener("click", async () => {
  try {
    await window.generatorQuotes.request(paintConfig(), value("projectName"));
    window.generatorAuth.toast("Quotes loaded");
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

window.generatorCurrentConfig = paintConfig;
window.generatorCurrentName = () => value("projectName") || "Paint station";
window.generatorAuth.initAuth().catch((error) => { document.getElementById("loginError").textContent = error.message; });
previewTurntable = window.forgetPreview3d.createTurntable(document.getElementById("preview"), renderPaintPreview);
document.querySelectorAll("[data-preview-turn]").forEach((button) => button.addEventListener("click", () => previewTurntable.turn(Number(button.dataset.previewTurn) * Math.PI / 8)));
document.querySelector("[data-preview-reset]").addEventListener("click", () => previewTurntable.reset());
setPaintMode("paint-box");
previewTurntable.render();
