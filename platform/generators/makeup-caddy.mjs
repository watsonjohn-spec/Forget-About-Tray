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
    layoutMode: input.layoutMode === "staircase" ? "staircase" : "caddy",
    columns: Math.round(numberInRange(input.columns ?? 3, 1, 6)),
    maxSpineLength: numberInRange(input.maxSpineLength ?? 220, 100, 400),
    gap: numberInRange(input.gap ?? 6, 2, 30),
    edgeMargin: numberInRange(input.edgeMargin ?? 8, 3, 30),
    baseThickness: numberInRange(input.baseThickness ?? 3, 1.2, 12),
    wallThickness: numberInRange(input.wallThickness ?? 2, 1, 6),
    holderHeight: numberInRange(input.holderHeight ?? 18, 5, 220),
    stepRise: numberInRange(input.stepRise ?? 22, 10, 60),
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
  const prepared = config.items.map((item) => ({ ...item, slotWidth: item.width + item.clearance * 2, slotDepth: item.depth + item.clearance * 2 }));
  if (config.layoutMode === "staircase") {
    const rows = [];
    prepared.forEach((item) => {
      let row = rows.at(-1);
      const used = row?.reduce((sum, candidate) => sum + candidate.slotWidth, 0) + Math.max(0, (row?.length || 0) - 1) * config.gap;
      if (!row || used + item.slotWidth + config.gap > config.maxSpineLength) {
        row = [];
        rows.push(row);
      }
      row.push(item);
    });
    const rowDepths = rows.map((row) => Math.max(...row.map((item) => item.slotDepth)));
    const outerWidth = Math.max(...rows.map((row) => row.reduce((sum, item) => sum + item.slotWidth, 0) + (row.length - 1) * config.gap)) + config.edgeMargin * 2;
    const outerDepth = rowDepths.reduce((sum, depth) => sum + depth, 0) + Math.max(0, rows.length - 1) * config.gap + config.edgeMargin * 2;
    const positions = [];
    let y = config.edgeMargin;
    rows.forEach((row, rowIndex) => {
      let x = config.edgeMargin;
      row.forEach((item, column) => {
        positions.push({ ...item, x, y, z: rowIndex * config.stepRise, row: rowIndex, column });
        x += item.slotWidth + config.gap;
      });
      y += rowDepths[rowIndex] + config.gap;
    });
    return { positions, outerWidth, outerDepth, rowDepths };
  }
  const sides = [[], []];
  prepared.forEach((item, index) => sides[index % 2].push(item));
  const sideDepths = sides.map((side) => Math.max(0, ...side.map((item) => item.slotDepth)));
  const spineWidth = Math.max(config.wallThickness * 3, 8);
  const sideLengths = sides.map((side) => side.reduce((sum, item) => sum + item.slotWidth, 0) + Math.max(0, side.length - 1) * config.gap);
  const outerWidth = Math.max(...sideLengths, 60) + config.edgeMargin * 2;
  const outerDepth = sideDepths[0] + spineWidth + sideDepths[1] + config.edgeMargin * 2;
  const positions = [];
  sides.forEach((side, sideIndex) => {
    let x = config.edgeMargin;
    side.forEach((item, column) => {
      const y = sideIndex === 0 ? config.edgeMargin + sideDepths[0] - item.slotDepth : config.edgeMargin + sideDepths[0] + spineWidth;
      positions.push({ ...item, x, y, z: 0, row: sideIndex, column });
      x += item.slotWidth + config.gap;
    });
  });
  return { positions, outerWidth, outerDepth, spineWidth, spineY: config.edgeMargin + sideDepths[0] };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const layout = itemLayout(config);
  const { positions, outerWidth, outerDepth } = layout;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.baseThickness }];
  if (config.layoutMode === "staircase") {
    let y = config.edgeMargin;
    layout.rowDepths.forEach((depth, index) => {
      const height = config.baseThickness + index * config.stepRise;
      boxes.push({ x: 0, y, z: 0, w: outerWidth, d: depth, h: height });
      boxes.push({ x: 0, y: y + depth - config.wallThickness, z: height, w: outerWidth, d: config.wallThickness, h: config.stepRise + config.wallThickness });
      y += depth + config.gap;
    });
  } else {
    boxes.push({ x: 0, y: layout.spineY, z: config.baseThickness, w: outerWidth, d: layout.spineWidth, h: config.wallThickness });
  }
  positions.forEach((position) => {
    const t = config.wallThickness;
    const h = Math.max(8, position.height * 2 / 3);
    const z = config.baseThickness + Number(position.z || 0);
    boxes.push(
      { x: position.x - t, y: position.y - t, z, w: position.slotWidth + t * 2, d: t, h },
      { x: position.x - t, y: position.y + position.slotDepth, z, w: position.slotWidth + t * 2, d: t, h },
      { x: position.x - t, y: position.y, z, w: t, d: position.slotDepth, h },
      { x: position.x + position.slotWidth, y: position.y, z, w: t, d: position.slotDepth, h }
    );
  });
  if (config.handleEnabled && config.layoutMode === "caddy") {
    const t = Math.max(config.wallThickness * 2, 4);
    const handleWidth = Math.min(config.handleWidth, Math.max(35, outerWidth - config.edgeMargin * 2));
    const startX = (outerWidth - handleWidth) / 2;
    const handleY = layout.spineY + (layout.spineWidth - t) / 2;
    boxes.push(
      { x: startX, y: handleY, z: config.baseThickness, w: t, d: t, h: config.handleHeight },
      { x: startX + handleWidth - t, y: handleY, z: config.baseThickness, w: t, d: t, h: config.handleHeight },
      { x: startX, y: handleY, z: config.baseThickness + config.handleHeight, w: handleWidth, d: t, h: t }
    );
  }
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  const holderTop = Math.max(...positions.map((position) => config.baseThickness + Number(position.z || 0) + position.height * 2 / 3));
  const height = Math.max(holderTop, config.handleEnabled && config.layoutMode === "caddy" ? config.baseThickness + config.handleHeight + Math.max(config.wallThickness * 2, 4) : 0);
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
  return `${config.items.length}-slot ${config.layoutMode === "staircase" ? "freestanding staircase case" : "makeup caddy"}${config.handleEnabled && config.layoutMode === "caddy" ? " with centre carrying handle" : ""}`;
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
