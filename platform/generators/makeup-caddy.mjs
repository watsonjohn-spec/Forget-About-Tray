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
    baseThickness: numberInRange(input.baseThickness ?? 2.6, 1.2, 12),
    wallThickness: numberInRange(input.wallThickness ?? 1.7, 1, 6),
    holderHeight: numberInRange(input.holderHeight ?? 18, 5, 220),
    stepRise: numberInRange(input.stepRise ?? 22, 10, 60),
    pegboardColumns: Math.round(numberInRange(input.pegboardColumns ?? 3, 1, 8)),
    pegboardRows: Math.round(numberInRange(input.pegboardRows ?? 2, 1, 8)),
    pegboardHookSpacing: numberInRange(input.pegboardHookSpacing ?? 40, 30, 60),
    handleEnabled: true,
    handleHeight: numberInRange(input.handleHeight ?? 95, 45, 180),
    handleWidth: numberInRange(input.handleWidth ?? 70, 35, 180),
    balanceCatchalls: input.balanceCatchalls !== false,
    filamentKey: String(input.filamentKey || "pla-rose-gold").slice(0, 80),
    filamentMaterial: ["pla", "petg", "abs"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentName: String(input.filamentName || "Rose Gold").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#b76e79"
  };
}

function splitPegboardBoxes(boxes, sheetWidth, sheetDepth, mountDepth, baseThickness, baseZ = 0) {
  const chunkSize = 250;
  const chunkCols = Math.ceil(sheetWidth / chunkSize);
  const chunkRows = Math.ceil(sheetDepth / chunkSize);
  if (chunkCols === 1 && chunkRows === 1) {
    return { boxes, outerWidth: sheetWidth, outerDepth: sheetDepth + mountDepth, chunkCount: 1 };
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
      const outputY = row * (chunkDepth + mountDepth + spacing) + mountDepth;
      output.push({ x: outputX, y: outputY, z: baseZ, w: chunkWidth, d: chunkDepth, h: baseThickness, kind: "base" });
      if (column < chunkCols - 1) output.push({ x: outputX + chunkWidth - tabDepth / 2, y: outputY + chunkDepth / 2 - tab / 2, z: baseZ, w: tabDepth, d: tab, h: baseThickness, kind: "jigsaw" });
      if (row < chunkRows - 1) output.push({ x: outputX + chunkWidth / 2 - tab / 2, y: outputY + chunkDepth - tabDepth / 2, z: baseZ, w: tab, d: tabDepth, h: baseThickness, kind: "jigsaw" });
    }
  }

  boxes.filter((box) => box.kind !== "base").forEach((box) => {
    const centreX = Math.max(0, Math.min(sheetWidth - 0.001, box.x + box.w / 2));
    const centreY = Math.max(0, Math.min(sheetDepth - 0.001, box.y - mountDepth + box.d / 2));
    const column = Math.max(0, Math.min(chunkCols - 1, Math.floor(centreX / chunkWidth)));
    const row = Math.max(0, Math.min(chunkRows - 1, Math.floor(centreY / chunkDepth)));
    const sourceX = column * chunkWidth;
    const sourceY = mountDepth + row * chunkDepth;
    const outputX = column * (chunkWidth + spacing);
    const outputY = row * (chunkDepth + mountDepth + spacing) + mountDepth;
    output.push({ ...box, x: outputX + box.x - sourceX, y: outputY + box.y - sourceY });
  });

  return {
    boxes: output,
    outerWidth: chunkCols * chunkWidth + (chunkCols - 1) * spacing,
    outerDepth: chunkRows * (chunkDepth + mountDepth) + (chunkRows - 1) * spacing,
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
    const mountDepth = Math.max(16, t * 8);
    const hookRailWidth = Math.max(12, t * 7);
    const hookBladeWidth = 4.2;
    const hookBladeDepth = 4;
    const hookDrop = Math.max(18, t * 10);
    const hookLipDepth = Math.max(8, t * 5);
    const hookLipHeight = Math.max(3, t * 1.75);
    const baseZ = hookDrop + hookLipHeight;
    const outerWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const sheetDepth = rowDepths.reduce((sum, depth) => sum + depth, 0);
    const positions = cells.map((cell) => ({
      ...cell,
      x: columnOffsets[cell.column] + t,
      y: mountDepth + rowOffsets[cell.row] + t,
      z: 0
    }));
    const hookCount = Math.max(2, Math.min(10, Math.floor(outerWidth / config.pegboardHookSpacing) + 1));
    return {
      positions,
      outerWidth,
      outerDepth: sheetDepth + mountDepth,
      sheetWidth: outerWidth,
      sheetDepth,
      mountDepth,
      hookRailWidth,
      hookBladeWidth,
      hookBladeDepth,
      hookDrop,
      hookLipDepth,
      hookLipHeight,
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

function catchallWallHeight(config) {
  return Math.max(10, Math.min(28, Number(config.handleHeight || 88) / 4));
}

function makeCatchallCell({ x, y, z = 0, width, depth, row, side }, config) {
  const minimum = Math.max(12, config.wallThickness * 5);
  if (!config.balanceCatchalls || width < minimum || depth < minimum) return null;
  return {
    id: `catchall-${side ?? row ?? "space"}`,
    name: "Catchall tray",
    kind: "catchall",
    x,
    y,
    z,
    row,
    side,
    slotWidth: width,
    slotDepth: depth,
    height: catchallWallHeight(config)
  };
}

function caddyCatchalls(layout, config) {
  if (config.layoutMode !== "caddy" || !config.balanceCatchalls) return [];
  return [0, 1].map((side) => {
    const usedLength = layout.sideLengths[side] || 0;
    const depth = layout.sideDepths[side] || 0;
    const x = config.wallThickness + usedLength;
    const y = side === 0 ? layout.spineY - depth : layout.spineY + layout.spineWidth;
    return makeCatchallCell({
      x,
      y,
      width: layout.outerWidth - config.wallThickness - x,
      depth,
      side
    }, config);
  }).filter(Boolean);
}

function staircaseCatchalls(layout, config) {
  if (config.layoutMode !== "staircase" || !config.balanceCatchalls) return [];
  return layout.rowDepths.map((depth, row) => {
    const rowPositions = layout.positions.filter((position) => position.row === row);
    const endX = Math.max(config.edgeMargin, ...rowPositions.map((position) => position.x + position.slotWidth));
    const y = rowPositions[0]?.y ?? config.edgeMargin;
    return makeCatchallCell({
      x: endX,
      y,
      z: row * config.stepRise,
      width: layout.outerWidth - config.edgeMargin - endX,
      depth,
      row
    }, config);
  }).filter(Boolean);
}

function catchallWallBoxes(catchall, config, mode) {
  const t = config.wallThickness;
  const z = config.baseThickness + Number(catchall.z || 0);
  const h = catchall.height;
  if (mode === "caddy") {
    const frontY = catchall.side === 0 ? catchall.y - t : catchall.y + catchall.slotDepth;
    return [
      { x: catchall.x - t, y: frontY, z, w: catchall.slotWidth + t * 2, d: t, h, kind: "catchall" },
      { x: catchall.x - t, y: catchall.y, z, w: t, d: catchall.slotDepth, h, kind: "catchall" },
      { x: catchall.x + catchall.slotWidth, y: catchall.y, z, w: t, d: catchall.slotDepth, h, kind: "catchall" }
    ];
  }
  return [
    { x: catchall.x - t, y: catchall.y - t, z, w: catchall.slotWidth + t * 2, d: t, h, kind: "catchall" },
    { x: catchall.x - t, y: catchall.y + catchall.slotDepth, z, w: catchall.slotWidth + t * 2, d: t, h, kind: "catchall" },
    { x: catchall.x - t, y: catchall.y, z, w: t, d: catchall.slotDepth, h, kind: "catchall" },
    { x: catchall.x + catchall.slotWidth, y: catchall.y, z, w: t, d: catchall.slotDepth, h, kind: "catchall" }
  ];
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const layout = itemLayout(config);
  const { positions, outerWidth, outerDepth } = layout;
  if (config.layoutMode === "pegboard") {
    const t = config.wallThickness;
    const boxes = [{ x: 0, y: layout.mountDepth, z: layout.baseZ, w: layout.sheetWidth, d: layout.sheetDepth, h: config.baseThickness, kind: "base" }];
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
    const railHeight = layout.baseZ + config.baseThickness + Math.max(14, t * 8);
    for (let hook = 0; hook < layout.hookCount; hook += 1) {
      const railX = layout.hookCount === 1
        ? layout.sheetWidth / 2 - layout.hookRailWidth / 2
        : (hook * (layout.sheetWidth - layout.hookRailWidth)) / (layout.hookCount - 1);
      const bladeX = railX + layout.hookRailWidth / 2 - layout.hookBladeWidth / 2;
      boxes.push(
        { x: railX, y: 0, z: 0, w: layout.hookRailWidth, d: layout.mountDepth, h: railHeight, kind: "pegboard-backplate" },
        { x: bladeX, y: 0, z: 0, w: layout.hookBladeWidth, d: layout.hookBladeDepth, h: layout.hookDrop, kind: "hook" },
        { x: bladeX, y: layout.hookBladeDepth, z: 0, w: layout.hookBladeWidth, d: layout.hookLipDepth, h: layout.hookLipHeight, kind: "hook" },
        { x: bladeX, y: layout.hookBladeDepth, z: layout.hookDrop - layout.hookLipHeight, w: layout.hookBladeWidth, d: layout.hookLipDepth * 0.65, h: layout.hookLipHeight, kind: "hook" }
      );
    }
    const split = splitPegboardBoxes(boxes, layout.sheetWidth, layout.sheetDepth, layout.mountDepth, config.baseThickness, layout.baseZ);
    const materialCm3 = split.boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
    const height = Math.max(...split.boxes.map((box) => box.z + box.h));
    return {
      config,
      boxes: split.boxes,
      positions,
      outerWidth: split.outerWidth,
      outerDepth: split.outerDepth,
      assembledWidth: layout.sheetWidth,
      assembledDepth: layout.sheetDepth + layout.mountDepth,
      height,
      materialCm3,
      hookCount: layout.hookCount,
      connectorStyle: "rear-slot-drop",
      connectorDepth: layout.mountDepth,
      connectorWidth: layout.hookBladeWidth,
      connectorBackplateWidth: layout.hookRailWidth,
      connectorDrop: layout.hookDrop,
      chunkCount: split.chunkCount
    };
  }
  const catchalls = config.layoutMode === "staircase" ? staircaseCatchalls(layout, config) : caddyCatchalls(layout, config);
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
    const spineHeight = Math.max(...holderHeights, config.handleHeight * 0.55);
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
  catchalls.forEach((catchall) => {
    boxes.push(...catchallWallBoxes(catchall, config, config.layoutMode));
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
  return { config, boxes, positions, catchalls, outerWidth, outerDepth, height, materialCm3, spineY: layout.spineY, spineWidth: layout.spineWidth };
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
  productFamily: "beauty",
  factoryLabel: "Makeup caddy",
  defaultFilament: { material: "pla", key: "pla-rose-gold", name: "Rose Gold", hex: "#b76e79" },
  capabilities: {
    savedDesigns: true,
    stlDownload: true,
    printFactory: true,
    catalogue: true,
    uploadStl: false,
    variants: ["caddy", "staircase", "pegboard"],
    splitPlates: true
  },
  normalizeParameters,
  buildGeometry,
  renderStl,
  safeFileName,
  describe
};
