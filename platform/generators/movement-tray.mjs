const generatorType = "movement_tray";
const version = 1;

function numberInRange(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error("Invalid movement tray parameters");
  return number;
}

function normalizeParameters(input = {}) {
  return {
    columns: numberInRange(input.columns, 1, 12),
    rows: numberInRange(input.rows, 1, 12),
    baseSize: numberInRange(input.baseSize, 10, 150),
    baseDepth: numberInRange(input.baseDepth, 10, 150),
    gap: numberInRange(input.gap ?? 1, 0, 10),
    clearance: numberInRange(input.clearance ?? 1, 0, 10),
    plateThickness: numberInRange(input.plateThickness ?? 2, 0.8, 10),
    wallHeight: numberInRange(input.wallHeight ?? 3, 0, 20),
    wallThickness: numberInRange(input.wallThickness ?? 1.6, 0.8, 5),
    lipEnabled: Boolean(input.lipEnabled),
    notchesEnabled: Boolean(input.notchesEnabled),
    notchWidth: numberInRange(input.notchWidth ?? 2, 0.5, 20),
    includeBases: Boolean(input.includeBases),
    filamentKey: String(input.filamentKey || "pla-bambu-green").slice(0, 80),
    filamentMaterial: ["pla", "petg"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentName: String(input.filamentName || "Bambu Green").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#00AE42"
  };
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

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const innerWidth = config.columns * config.baseSize + (config.columns - 1) * config.gap + config.clearance * 2;
  const innerDepth = config.rows * config.baseDepth + (config.rows - 1) * config.gap + config.clearance * 2;
  const wall = config.lipEnabled ? config.wallThickness : 0;
  const outerWidth = innerWidth + wall * 2;
  const outerDepth = innerDepth + wall * 2;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness }];

  if (config.lipEnabled) {
    const z = config.plateThickness;
    const h = config.wallHeight;
    const notch = config.notchesEnabled ? Math.min(config.notchWidth, config.baseSize * 0.45) : 0;
    segmentSpans(config.columns, config.baseSize, config.gap, config.clearance, notch).forEach(({ start, length }) => {
      boxes.push({ x: wall + start, y: 0, z, w: length, d: wall, h });
      boxes.push({ x: wall + start, y: outerDepth - wall, z, w: length, d: wall, h });
    });
    segmentSpans(config.rows, config.baseDepth, config.gap, config.clearance, notch).forEach(({ start, length }) => {
      boxes.push({ x: 0, y: wall + start, z, w: wall, d: length, h });
      boxes.push({ x: outerWidth - wall, y: wall + start, z, w: wall, d: length, h });
    });
    boxes.push(
      { x: 0, y: 0, z, w: wall, d: wall, h },
      { x: outerWidth - wall, y: 0, z, w: wall, d: wall, h },
      { x: 0, y: outerDepth - wall, z, w: wall, d: wall, h },
      { x: outerWidth - wall, y: outerDepth - wall, z, w: wall, d: wall, h }
    );
  }

  if (config.includeBases) {
    const baseStartY = outerDepth + 5;
    for (let column = 0; column < config.columns; column += 1) {
      for (let row = 0; row < config.rows; row += 1) {
        boxes.push({
          x: column * (config.baseSize + config.gap),
          y: baseStartY + row * (config.baseDepth + config.gap),
          z: 0,
          w: config.baseSize,
          d: config.baseDepth,
          h: config.plateThickness
        });
      }
    }
  }

  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  return { config, boxes, innerWidth, innerDepth, outerWidth, outerDepth, materialCm3 };
}

function boxTriangles({ x, y, z, w, d, h }) {
  const p = [
    [x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z],
    [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]
  ];
  return [
    [p[0], p[2], p[1]], [p[0], p[3], p[2]], [p[4], p[5], p[6]], [p[4], p[6], p[7]],
    [p[0], p[1], p[5]], [p[0], p[5], p[4]], [p[1], p[2], p[6]], [p[1], p[6], p[5]],
    [p[2], p[3], p[7]], [p[2], p[7], p[6]], [p[3], p[0], p[4]], [p[3], p[4], p[7]]
  ];
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
  return `solid movement_tray\n${facets}\nendsolid movement_tray\n`;
}

function safeFileName(parameters, name) {
  const config = normalizeParameters(parameters);
  const prefix = String(name || "movement-tray").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "movement-tray";
  const base = config.baseSize === config.baseDepth ? `${config.baseSize}mm` : `${config.baseSize}x${config.baseDepth}mm`;
  return `${prefix}-${config.columns}x${config.rows}-${base}.stl`;
}

function describe(parameters) {
  const { config } = buildGeometry(parameters);
  return `${config.columns} x ${config.rows} tray for ${config.baseSize} x ${config.baseDepth}mm bases${config.includeBases ? ", including printable bases" : ""}`;
}

export const movementTrayGenerator = {
  type: generatorType,
  version,
  name: "Movement tray",
  catalogueType: "old_world_units",
  normalizeParameters,
  buildGeometry,
  renderStl,
  safeFileName,
  describe
};
