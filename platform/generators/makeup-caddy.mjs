const generatorType = "makeup_caddy";
const version = 1;

function numberInRange(value, minimum, maximum, label = "makeup caddy") {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`Invalid ${label} parameters`);
  return number;
}

function cleanItem(item, index) {
  return {
    id: String(item.id || `item-${index + 1}`).slice(0, 80),
    brand: String(item.brand || "Custom").slice(0, 80),
    name: String(item.name || `Cosmetic ${index + 1}`).slice(0, 120),
    category: String(item.category || "Other").slice(0, 80),
    width: numberInRange(item.width, 8, 180, "makeup item"),
    depth: numberInRange(item.depth, 8, 180, "makeup item"),
    height: numberInRange(item.height ?? 80, 8, 300, "makeup item"),
    clearance: numberInRange(item.clearance ?? 1.5, 0.5, 8, "makeup item")
  };
}

function normalizeParameters(input = {}) {
  const items = Array.isArray(input.items) ? input.items.slice(0, 40).map(cleanItem) : [];
  if (!items.length) throw new Error("Add at least one makeup item before exporting.");
  return {
    items,
    columns: Math.round(numberInRange(input.columns ?? 3, 1, 6)),
    gap: numberInRange(input.gap ?? 6, 2, 30),
    edgeMargin: numberInRange(input.edgeMargin ?? 8, 3, 30),
    baseThickness: numberInRange(input.baseThickness ?? 3, 1.2, 12),
    wallThickness: numberInRange(input.wallThickness ?? 2, 1, 6),
    holderHeight: numberInRange(input.holderHeight ?? 18, 5, 60),
    handleEnabled: Boolean(input.handleEnabled),
    handleHeight: numberInRange(input.handleHeight ?? 95, 45, 180),
    handleWidth: numberInRange(input.handleWidth ?? 70, 35, 180),
    filamentKey: String(input.filamentKey || "pla-rose-gold").slice(0, 80),
    filamentMaterial: ["pla", "petg"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentName: String(input.filamentName || "Rose Gold").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#b76e79"
  };
}

function itemLayout(config) {
  const rowCount = Math.ceil(config.items.length / config.columns);
  const columnWidths = Array.from({ length: config.columns }, () => 0);
  const rowDepths = Array.from({ length: rowCount }, () => 0);
  config.items.forEach((item, index) => {
    const column = index % config.columns;
    const row = Math.floor(index / config.columns);
    columnWidths[column] = Math.max(columnWidths[column], item.width + item.clearance * 2);
    rowDepths[row] = Math.max(rowDepths[row], item.depth + item.clearance * 2);
  });
  const columnStarts = [];
  const rowStarts = [];
  let cursor = config.edgeMargin;
  columnWidths.forEach((width) => {
    columnStarts.push(cursor);
    cursor += width + config.gap;
  });
  const outerWidth = cursor - config.gap + config.edgeMargin;
  cursor = config.edgeMargin;
  rowDepths.forEach((depth) => {
    rowStarts.push(cursor);
    cursor += depth + config.gap;
  });
  const outerDepth = cursor - config.gap + config.edgeMargin;
  const positions = config.items.map((item, index) => {
    const column = index % config.columns;
    const row = Math.floor(index / config.columns);
    const slotWidth = item.width + item.clearance * 2;
    const slotDepth = item.depth + item.clearance * 2;
    return {
      ...item,
      x: columnStarts[column] + (columnWidths[column] - slotWidth) / 2,
      y: rowStarts[row] + (rowDepths[row] - slotDepth) / 2,
      slotWidth,
      slotDepth,
      row,
      column
    };
  });
  return { positions, outerWidth, outerDepth };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const { positions, outerWidth, outerDepth } = itemLayout(config);
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.baseThickness }];
  const z = config.baseThickness;
  positions.forEach((position) => {
    const t = config.wallThickness;
    const h = Math.min(config.holderHeight, Math.max(5, position.height * 0.45));
    boxes.push(
      { x: position.x - t, y: position.y - t, z, w: position.slotWidth + t * 2, d: t, h },
      { x: position.x - t, y: position.y + position.slotDepth, z, w: position.slotWidth + t * 2, d: t, h },
      { x: position.x - t, y: position.y, z, w: t, d: position.slotDepth, h },
      { x: position.x + position.slotWidth, y: position.y, z, w: t, d: position.slotDepth, h }
    );
  });
  if (config.handleEnabled) {
    const t = Math.max(config.wallThickness * 2, 4);
    const handleWidth = Math.min(config.handleWidth, Math.max(35, outerWidth - config.edgeMargin * 2));
    const startX = (outerWidth - handleWidth) / 2;
    const handleY = (outerDepth - t) / 2;
    boxes.push(
      { x: startX, y: handleY, z, w: t, d: t, h: config.handleHeight },
      { x: startX + handleWidth - t, y: handleY, z, w: t, d: t, h: config.handleHeight },
      { x: startX, y: handleY, z: config.handleHeight, w: handleWidth, d: t, h: t }
    );
  }
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  const height = Math.max(config.baseThickness + config.holderHeight, config.handleEnabled ? config.handleHeight + Math.max(config.wallThickness * 2, 4) : 0);
  return { config, boxes, positions, outerWidth, outerDepth, height, materialCm3 };
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
  return `solid makeup_caddy\n${facets}\nendsolid makeup_caddy\n`;
}

function safeFileName(parameters, name) {
  const config = normalizeParameters(parameters);
  const prefix = String(name || "makeup-caddy").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "makeup-caddy";
  return `${prefix}-${config.items.length}-slots${config.handleEnabled ? "-handle" : ""}.stl`;
}

function describe(parameters) {
  const config = normalizeParameters(parameters);
  return `${config.items.length}-slot makeup caddy${config.handleEnabled ? " with centre carrying handle" : ""}`;
}

export const makeupCaddyGenerator = {
  type: generatorType,
  version,
  name: "Makeup caddy",
  catalogueType: "makeup_products",
  normalizeParameters,
  buildGeometry,
  renderStl,
  safeFileName,
  describe
};
