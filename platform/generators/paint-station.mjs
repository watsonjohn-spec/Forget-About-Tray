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
    paintType,
    paintCount: integerInRange(input.paintCount, 1, 80, 18),
    paintDiameter: diameter,
    brushSlots: integerInRange(input.brushSlots, 0, 40, 8),
    columns: integerInRange(input.columns, 1, 12, 6),
    clearance: numberInRange(input.clearance, 0, 8, 2),
    wallThickness: numberInRange(input.wallThickness, 1, 6, 2),
    wallHeight: numberInRange(input.wallHeight, 5, 50, 18),
    plateThickness: numberInRange(input.plateThickness, 1, 10, 2.4),
    filamentMaterial: ["pla", "petg"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentKey: String(input.filamentKey || "pla-green").slice(0, 80),
    filamentName: String(input.filamentName || "Workshop Green").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#4f7b6f"
  };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const slot = config.paintDiameter + config.clearance * 2;
  const rows = Math.ceil(config.paintCount / config.columns);
  const brushDepth = config.brushSlots ? 22 : 0;
  const outerWidth = config.columns * slot + (config.columns + 1) * config.wallThickness;
  const outerDepth = rows * slot + (rows + 1) * config.wallThickness + brushDepth;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness }];
  for (let index = 0; index < config.paintCount; index += 1) {
    const col = index % config.columns;
    const row = Math.floor(index / config.columns);
    const x = config.wallThickness + col * (slot + config.wallThickness);
    const y = config.wallThickness + row * (slot + config.wallThickness);
    boxes.push(
      { x: x - config.wallThickness, y: y - config.wallThickness, z: config.plateThickness, w: slot + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y: y + slot, z: config.plateThickness, w: slot + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y, z: config.plateThickness, w: config.wallThickness, d: slot, h: config.wallHeight },
      { x: x + slot, y, z: config.plateThickness, w: config.wallThickness, d: slot, h: config.wallHeight }
    );
  }
  if (config.brushSlots) {
    const y = outerDepth - brushDepth;
    const pitch = outerWidth / config.brushSlots;
    for (let index = 1; index < config.brushSlots; index += 1) {
      boxes.push({ x: index * pitch - .75, y, z: config.plateThickness, w: 1.5, d: brushDepth, h: 9 });
    }
    boxes.push({ x: 0, y, z: config.plateThickness, w: outerWidth, d: config.wallThickness, h: 9 });
  }
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  return { config, boxes, outerWidth, outerDepth, height: config.plateThickness + config.wallHeight, materialCm3 };
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
  return `${prefix}-${config.paintType}-${config.paintCount}-paints.stl`;
}

function describe(parameters) {
  const config = normalizeParameters(parameters);
  return `${config.paintType} paint station for ${config.paintCount} paints and ${config.brushSlots} brushes`;
}

export const paintStationGenerator = { type: generatorType, version, name: "Paint station", catalogueType: "paint_bottles", normalizeParameters, buildGeometry, renderStl, safeFileName, describe };
