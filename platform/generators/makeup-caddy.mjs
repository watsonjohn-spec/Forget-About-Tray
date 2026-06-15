const generatorType = "makeup_caddy";
const version = 1;
const minimumSpineWidth = 10;

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
  const layoutMode = ["caddy", "staircase", "pegboard"].includes(input.layoutMode) ? input.layoutMode : "caddy";
  return {
    items,
    layoutMode,
    columns: Math.round(numberInRange(input.columns ?? 3, 1, 6)),
    maxSpineLength: numberInRange(input.maxSpineLength ?? 220, 100, 400),
    gap: numberInRange(input.gap ?? 6, 2, 30),
    edgeMargin: numberInRange(input.edgeMargin ?? 8, 3, 30),
    baseThickness: numberInRange(input.baseThickness ?? 3, 1.2, 12),
    wallThickness: numberInRange(input.wallThickness ?? 2, 1, 6),
    holderHeight: numberInRange(input.holderHeight ?? 18, 5, 220),
    stepRise: numberInRange(input.stepRise ?? 22, 10, 60),
    pegboardColumns: Math.round(numberInRange(input.pegboardColumns ?? 3, 1, 8)),
    pegboardRows: Math.round(numberInRange(input.pegboardRows ?? 2, 1, 8)),
    pegboardHookSpacing: numberInRange(input.pegboardHookSpacing ?? 40, 30, 60),
    handleEnabled: true,
    handleHeight: numberInRange(input.handleHeight ?? 95, 45, 180),
    handleWidth: numberInRange(input.handleWidth ?? 70, 35, 180),
    filamentKey: String(input.filamentKey || "pla-rose-gold").slice(0, 80),
    filamentMaterial: ["pla", "petg"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentName: String(input.filamentName || "Rose Gold").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#b76e79"
  };
}

function splitPegboardBoxes(boxes, sheetWidth, sheetDepth, hookDepth, baseThickness, baseZ = 0) {
  const chunkSize = 250;
  const chunkCols = Math.ceil(sheetWidth / chunkSize);
  const chunkRows = Math.ceil(sheetDepth / chunkSize);
  if (chunkCols === 1 && chunkRows === 1) {
    return { boxes, outerWidth: sheetWidth, outerDepth: sheetDepth + hookDepth, chunkCount: 1 };
  }

  const spacing = 18;
  const tab = 18;
  const tabDepth = Math.max(4, baseThickness);
  const chunkWidth = sheetWidth / chunkCols;
  const chunkDepth = sheetDepth / chunkRows;
  const output = [];

  for (let row = 0; row < chunkRows; row += 1) {
    for (let column = 0; column < chunkCols; column += 1) {
      const outputX = column * (chunkWidth + spacing);
      const outputY = row * (chunkDepth + hookDepth + spacing) + hookDepth;
      output.push({ x: outputX, y: outputY, z: baseZ, w: chunkWidth, d: chunkDepth, h: baseThickness, kind: "base" });
      if (column < chunkCols - 1) output.push({ x: outputX + chunkWidth - tabDepth / 2, y: outputY + chunkDepth / 2 - tab / 2, z: baseZ, w: tabDepth, d: tab, h: baseThickness, kind: "jigsaw" });
      if (row < chunkRows - 1) output.push({ x: outputX + chunkWidth / 2 - tab / 2, y: outputY + chunkDepth - tabDepth / 2, z: baseZ, w: tab, d: tabDepth, h: baseThickness, kind: "jigsaw" });
    }
  }

  boxes.filter((box) => box.kind !== "base").forEach((box) => {
    const centreX = Math.max(0, Math.min(sheetWidth - 0.001, box.x + box.w / 2));
    const centreY = Math.max(0, Math.min(sheetDepth - 0.001, box.y - hookDepth + box.d / 2));
    const column = Math.max(0, Math.min(chunkCols - 1, Math.floor(centreX / chunkWidth)));
    const row = Math.max(0, Math.min(chunkRows - 1, Math.floor(centreY / chunkDepth)));
    const sourceX = column * chunkWidth;
    const sourceY = hookDepth + row * chunkDepth;
    const outputX = column * (chunkWidth + spacing);
    const outputY = row * (chunkDepth + hookDepth + spacing) + hookDepth;
    output.push({ ...box, x: outputX + box.x - sourceX, y: outputY + box.y - sourceY });
  });

  return {
    boxes: output,
    outerWidth: chunkCols * chunkWidth + (chunkCols - 1) * spacing,
    outerDepth: chunkRows * (chunkDepth + hookDepth) + (chunkRows - 1) * spacing,
    chunkCount: chunkCols * chunkRows
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
  if (config.layoutMode === "pegboard") {
    const columns = config.pegboardColumns;
    const rows = Math.max(config.pegboardRows, Math.ceil(prepared.length / columns));
    const t = config.wallThickness;
    const cells = prepared.map((item, index) => ({
      ...item,
      column: index % columns,
      row: Math.floor(index / columns),
      cellWidth: item.slotWidth + t * 2,
      cellDepth: item.slotDepth + t * 2
    }));
    const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(24, ...cells.filter((cell) => cell.column === column).map((cell) => cell.cellWidth)));
    const rowDepths = Array.from({ length: rows }, (_, row) => Math.max(24, ...cells.filter((cell) => cell.row === row).map((cell) => cell.cellDepth)));
    const columnOffsets = columnWidths.map((_, column) => columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0));
    const rowOffsets = rowDepths.map((_, row) => rowDepths.slice(0, row).reduce((sum, depth) => sum + depth, 0));
    const hookDepth = Math.max(12, t * 6);
    const hookWidth = 4.2;
    const hookBladeDepth = 12;
    const hookDrop = Math.max(7, t * 3.5);
    const hookCatchDepth = 4;
    const hookCatchHeight = 2;
    const baseZ = hookDrop;
    const outerWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const sheetDepth = rowDepths.reduce((sum, depth) => sum + depth, 0);
    const positions = cells.map((cell) => ({
      ...cell,
      x: columnOffsets[cell.column] + t,
      y: hookDepth + rowOffsets[cell.row] + t,
      z: 0
    }));
    const hookCount = Math.max(2, Math.min(10, Math.floor(outerWidth / config.pegboardHookSpacing) + 1));
    return {
      positions,
      outerWidth,
      outerDepth: sheetDepth + hookDepth,
      sheetWidth: outerWidth,
      sheetDepth,
      hookDepth,
      hookWidth,
      hookBladeDepth,
      hookDrop,
      hookCatchDepth,
      hookCatchHeight,
      baseZ,
      hookCount
    };
  }
  const sides = [[], []];
  prepared.forEach((item, index) => sides[index % 2].push(item));
  const sideDepths = sides.map((side) => Math.max(0, ...side.map((item) => item.slotDepth)));
  const spineWidth = Math.max(config.wallThickness * 4, minimumSpineWidth);
  const sideLengths = sides.map((side) => side.reduce((sum, item) => sum + item.slotWidth, 0) + Math.max(0, side.length - 1) * config.gap);
  const outerWidth = Math.max(...sideLengths) + config.wallThickness * 2;
  const outerDepth = sideDepths[0] + spineWidth + sideDepths[1] + config.wallThickness * 2;
  const spineY = config.wallThickness + sideDepths[0];
  const positions = [];
  sides.forEach((side, sideIndex) => {
    let x = config.wallThickness;
    side.forEach((item, column) => {
      const y = sideIndex === 0 ? spineY - item.slotDepth : spineY + spineWidth;
      positions.push({ ...item, x, y, z: 0, row: sideIndex, side: sideIndex, column });
      x += item.slotWidth + config.gap;
    });
  });
  return { positions, outerWidth, outerDepth, spineWidth, spineY, sideDepths, sideLengths };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const layout = itemLayout(config);
  const { positions, outerWidth, outerDepth } = layout;
  if (config.layoutMode === "pegboard") {
    const t = config.wallThickness;
    const boxes = [{ x: 0, y: layout.hookDepth, z: layout.baseZ, w: layout.sheetWidth, d: layout.sheetDepth, h: config.baseThickness, kind: "base" }];
    positions.forEach((position) => {
      const h = Math.max(8, position.height * 2 / 3);
      const z = layout.baseZ + config.baseThickness;
      boxes.push(
        { x: position.x - t, y: position.y - t, z, w: position.slotWidth + t * 2, d: t, h, kind: "wall" },
        { x: position.x - t, y: position.y + position.slotDepth, z, w: position.slotWidth + t * 2, d: t, h, kind: "wall" },
        { x: position.x - t, y: position.y, z, w: t, d: position.slotDepth, h, kind: "wall" },
        { x: position.x + position.slotWidth, y: position.y, z, w: t, d: position.slotDepth, h, kind: "wall" }
      );
    });
    for (let hook = 0; hook < layout.hookCount; hook += 1) {
      const hookX = layout.hookCount === 1 ? layout.sheetWidth / 2 - layout.hookWidth / 2 : (hook * (layout.sheetWidth - layout.hookWidth)) / (layout.hookCount - 1);
      const hookY = (layout.hookDepth - layout.hookBladeDepth) / 2;
      boxes.push(
        { x: hookX, y: hookY, z: 0, w: layout.hookWidth, d: layout.hookBladeDepth, h: layout.hookDrop, kind: "hook" },
        { x: hookX, y: hookY + layout.hookBladeDepth - layout.hookCatchDepth, z: 0, w: layout.hookWidth, d: layout.hookCatchDepth, h: layout.hookDrop + layout.hookCatchHeight, kind: "hook" }
      );
    }
    const split = splitPegboardBoxes(boxes, layout.sheetWidth, layout.sheetDepth, layout.hookDepth, config.baseThickness, layout.baseZ);
    const materialCm3 = split.boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
    const height = Math.max(...split.boxes.map((box) => box.z + box.h));
    return {
      config,
      boxes: split.boxes,
      positions,
      outerWidth: split.outerWidth,
      outerDepth: split.outerDepth,
      assembledWidth: layout.sheetWidth,
      assembledDepth: layout.sheetDepth + layout.hookDepth,
      height,
      materialCm3,
      hookCount: layout.hookCount,
      connectorWidth: layout.hookWidth,
      connectorDrop: layout.hookDrop,
      chunkCount: split.chunkCount
    };
  }
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
    const holderHeights = positions.map((position) => Math.max(8, position.height * 2 / 3));
    const spineHeight = Math.max(...holderHeights, config.handleHeight / 2);
    boxes.push({ x: 0, y: layout.spineY, z: config.baseThickness, w: outerWidth, d: layout.spineWidth, h: spineHeight });
  }
  positions.forEach((position) => {
    const t = config.wallThickness;
    const h = Math.max(8, position.height * 2 / 3);
    const z = config.baseThickness + Number(position.z || 0);
    if (config.layoutMode === "caddy") {
      const frontY = position.side === 0 ? position.y - t : position.y + position.slotDepth;
      boxes.push(
        { x: position.x - t, y: frontY, z, w: position.slotWidth + t * 2, d: t, h },
        { x: position.x - t, y: position.y, z, w: t, d: position.slotDepth, h },
        { x: position.x + position.slotWidth, y: position.y, z, w: t, d: position.slotDepth, h }
      );
    } else {
      boxes.push(
        { x: position.x - t, y: position.y - t, z, w: position.slotWidth + t * 2, d: t, h },
        { x: position.x - t, y: position.y + position.slotDepth, z, w: position.slotWidth + t * 2, d: t, h },
        { x: position.x - t, y: position.y, z, w: t, d: position.slotDepth, h },
        { x: position.x + position.slotWidth, y: position.y, z, w: t, d: position.slotDepth, h }
      );
    }
  });
  if (config.layoutMode === "caddy") {
    const t = Math.max(config.wallThickness * 2, 4);
    const handleWidth = Math.min(Math.max(t * 2, config.handleWidth), outerWidth);
    const startX = (outerWidth - handleWidth) / 2;
    const handleRise = Math.max(config.handleHeight, Math.max(...positions.map((position) => position.height * 2 / 3)) + t * 2);
    const handleY = layout.spineY;
    boxes.push(
      { x: startX, y: handleY, z: config.baseThickness, w: t, d: layout.spineWidth, h: handleRise },
      { x: startX + handleWidth - t, y: handleY, z: config.baseThickness, w: t, d: layout.spineWidth, h: handleRise },
      { x: startX, y: handleY, z: config.baseThickness + handleRise, w: handleWidth, d: layout.spineWidth, h: t }
    );
  }
  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  const holderTop = Math.max(...positions.map((position) => config.baseThickness + Number(position.z || 0) + position.height * 2 / 3));
  const height = Math.max(holderTop, ...boxes.map((box) => box.z + box.h));
  return { config, boxes, positions, outerWidth, outerDepth, height, materialCm3, spineY: layout.spineY, spineWidth: layout.spineWidth };
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
  const suffix = config.layoutMode === "caddy" ? "-handle" : `-${config.layoutMode}`;
  return `${prefix}-${config.items.length}-slots${suffix}.stl`;
}

function describe(parameters) {
  const config = normalizeParameters(parameters);
  if (config.layoutMode === "pegboard") return `${config.items.length}-slot SKADIS-style pegboard makeup sheet`;
  return `${config.items.length}-slot ${config.layoutMode === "staircase" ? "freestanding staircase case" : "makeup caddy with integrated carrying spine"}`;
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
