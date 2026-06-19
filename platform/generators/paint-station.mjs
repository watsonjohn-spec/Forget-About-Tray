const generatorType = "paint_station";
const version = 1;

function numberInRange(value, minimum, maximum, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error("Invalid paint station parameters");
  return number;
}

function integerInRange(value, minimum, maximum, fallback) {
  return Math.round(numberInRange(value, minimum, maximum, fallback));
}

function normalizeParameters(input = {}) {
  const paintType = ["citadel", "vallejo", "generic"].includes(input.paintType) ? input.paintType : "citadel";
  const diameter = paintType === "citadel" ? 34 : paintType === "vallejo" ? 25 : numberInRange(input.paintDiameter, 12, 70, 30);
  return {
    layoutMode: ["paint-box", "painting-station"].includes(input.layoutMode) ? input.layoutMode : "paint-box",
    paintType,
    paintCount: integerInRange(input.paintCount, 1, 80, 18),
    paintDiameter: diameter,
    brushSlots: integerInRange(input.brushSlots, 0, 40, 8),
    brushStandHoles: integerInRange(input.brushStandHoles, 0, 30, 10),
    waterPots: integerInRange(input.waterPots, 0, 4, 2),
    printLid: input.printLid === true,
    columns: integerInRange(input.columns, 1, 12, 6),
    clearance: numberInRange(input.clearance, 0, 8, 2),
    wallThickness: numberInRange(input.wallThickness, 1, 6, 2),
    wallHeight: numberInRange(input.wallHeight, 5, 50, 18),
    plateThickness: numberInRange(input.plateThickness, 1, 10, 2.4),
    filamentMaterial: ["pla", "petg", "abs"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentKey: String(input.filamentKey || "pla-green").slice(0, 80),
    filamentName: String(input.filamentName || "Workshop Green").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#4f7b6f"
  };
}

function slotWalls(boxes, config, x, y, slot) {
  boxes.push(
    { x: x - config.wallThickness, y: y - config.wallThickness, z: config.plateThickness, w: slot + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
    { x: x - config.wallThickness, y: y + slot, z: config.plateThickness, w: slot + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
    { x: x - config.wallThickness, y, z: config.plateThickness, w: config.wallThickness, d: slot, h: config.wallHeight },
    { x: x + slot, y, z: config.plateThickness, w: config.wallThickness, d: slot, h: config.wallHeight }
  );
}

function buildPaintBox(config, slot) {
  const rows = Math.ceil(config.paintCount / config.columns);
  const brushDepth = config.brushSlots ? 24 : 0;
  const lidGap = config.printLid ? 14 : 0;
  const lidDepth = config.printLid ? 34 : 0;
  const outerWidth = config.columns * slot + (config.columns + 1) * config.wallThickness;
  const trayDepth = rows * slot + (rows + 1) * config.wallThickness + brushDepth;
  const outerDepth = trayDepth + lidGap + lidDepth;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: trayDepth, h: config.plateThickness }];
  for (let index = 0; index < config.paintCount; index += 1) {
    const col = index % config.columns;
    const row = Math.floor(index / config.columns);
    slotWalls(boxes, config, config.wallThickness + col * (slot + config.wallThickness), config.wallThickness + row * (slot + config.wallThickness), slot);
  }
  if (config.brushSlots) {
    const y = trayDepth - brushDepth;
    const pitch = outerWidth / config.brushSlots;
    for (let index = 1; index < config.brushSlots; index += 1) boxes.push({ x: index * pitch - .75, y, z: config.plateThickness, w: 1.5, d: brushDepth, h: 9 });
    boxes.push({ x: 0, y, z: config.plateThickness, w: outerWidth, d: config.wallThickness, h: 9 });
  }
  if (config.printLid) boxes.push({ x: 0, y: trayDepth + lidGap, z: 0, w: outerWidth, d: lidDepth, h: config.plateThickness });
  return { boxes, outerWidth, outerDepth, height: config.plateThickness + config.wallHeight };
}

function buildPaintingStation(config, slot) {
  const backCount = Math.max(1, Math.min(config.columns, config.paintCount));
  const sideCount = Math.max(0, Math.ceil((config.paintCount - backCount) / 2));
  const centreWidth = Math.max(120, backCount * slot * 0.72);
  const centreDepth = Math.max(86, sideCount * slot * 0.6);
  const sideWidth = slot + config.wallThickness * 2;
  const backDepth = slot + config.wallThickness * 2;
  const outerWidth = sideWidth * 2 + centreWidth + config.wallThickness * 2;
  const outerDepth = backDepth + centreDepth + 58;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness }];
  for (let index = 0; index < config.paintCount; index += 1) {
    if (index < backCount) {
      const spacing = centreWidth / backCount;
      slotWalls(boxes, config, sideWidth + config.wallThickness + index * spacing + (spacing - slot) / 2, config.wallThickness, slot);
    } else {
      const sideIndex = index - backCount;
      const left = sideIndex % 2 === 0;
      const row = Math.floor(sideIndex / 2);
      slotWalls(boxes, config, left ? config.wallThickness : outerWidth - sideWidth + config.wallThickness, backDepth + config.wallThickness + row * slot, slot);
    }
  }
  if (config.brushStandHoles) boxes.push({ x: sideWidth + 12, y: outerDepth - 57, z: config.plateThickness, w: centreWidth - 24, d: 16, h: 12 });
  if (config.waterPots) {
    const potWidth = 42;
    for (let index = 0; index < config.waterPots; index += 1) boxes.push({ x: outerWidth / 2 + (index - (config.waterPots - 1) / 2) * 51 - potWidth / 2, y: outerDepth - 54, z: config.plateThickness, w: potWidth, d: potWidth, h: 14 });
  }
  return { boxes, outerWidth, outerDepth, height: config.plateThickness + config.wallHeight + 5 };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const slot = config.paintDiameter + config.clearance * 2;
  const geometry = config.layoutMode === "painting-station" ? buildPaintingStation(config, slot) : buildPaintBox(config, slot);
  const { boxes, outerWidth, outerDepth, height } = geometry;
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  return { config, boxes, outerWidth, outerDepth, height, materialCm3 };
}

function boxTriangles({ x, y, z, w, d, h }) {
  const p = [[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z],[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]];
  return [[p[0],p[2],p[1]],[p[0],p[3],p[2]],[p[4],p[5],p[6]],[p[4],p[6],p[7]],[p[0],p[1],p[5]],[p[0],p[5],p[4]],[p[1],p[2],p[6]],[p[1],p[6],p[5]],[p[2],p[3],p[7]],[p[2],p[7],p[6]],[p[3],p[0],p[4]],[p[3],p[4],p[7]]];
}

function triangleNormal([a, b, c]) {
  const u = b.map((value, index) => value - a[index]);
  const v = c.map((value, index) => value - a[index]);
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...cross) || 1;
  return cross.map((value) => value / length);
}

function renderStl(parameters) {
  const facets = buildGeometry(parameters).boxes.flatMap(boxTriangles).map((triangle) => {
    const normal = triangleNormal(triangle);
    return `  facet normal ${normal.join(" ")}\n    outer loop\n${triangle.map((vertex) => `      vertex ${vertex.join(" ")}`).join("\n")}\n    endloop\n  endfacet`;
  }).join("\n");
  return `solid paint_station\n${facets}\nendsolid paint_station\n`;
}

function safeFileName(parameters, name) {
  const config = normalizeParameters(parameters);
  const prefix = String(name || "paint-station").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paint-station";
  return `${prefix}-${config.layoutMode}-${config.paintType}-${config.paintCount}-paints.stl`;
}

function describe(parameters) {
  const config = normalizeParameters(parameters);
  return `${config.paintType} ${config.layoutMode.replace("-", " ")} for ${config.paintCount} paints and ${config.brushSlots || config.brushStandHoles} brush slots`;
}

export const paintStationGenerator = {
  type: generatorType,
  version,
  name: "Paint station",
  catalogueType: "paint_bottles",
  productFamily: "hobby-paint",
  factoryLabel: "Paint station",
  defaultFilament: { material: "pla", key: "pla-green", name: "Workshop Green", hex: "#4f7b6f" },
  capabilities: {
    savedDesigns: true,
    stlDownload: true,
    printFactory: true,
    catalogue: true,
    uploadStl: false,
    variants: ["paint_box", "painting_station"],
    splitPlates: true
  },
  normalizeParameters,
  buildGeometry,
  renderStl,
  safeFileName,
  describe
};
