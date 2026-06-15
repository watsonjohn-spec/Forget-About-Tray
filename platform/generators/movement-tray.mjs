const generatorType = "movement_tray";
const version = 1;
const storageMode = "storage_insert";

function numberInRange(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error("Invalid movement tray parameters");
  return number;
}

function integerInRange(value, minimum, maximum) {
  return Math.round(numberInRange(value, minimum, maximum));
}

function filamentParameters(input = {}) {
  return {
    filamentKey: String(input.filamentKey || "pla-bambu-green").slice(0, 80),
    filamentMaterial: ["pla", "petg"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentName: String(input.filamentName || "Bambu Green").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#00AE42"
  };
}

function cleanInsertUnit(unit = {}, index) {
  const width = numberInRange(unit.baseSize ?? unit.width, 10, 180);
  const depth = numberInRange(unit.baseDepth ?? unit.depth ?? unit.baseSize ?? unit.width, 10, 180);
  const count = integerInRange(unit.count ?? (Number(unit.columns || 1) * Number(unit.rows || 1)), 1, 500);
  return {
    id: String(unit.id || `unit-${index + 1}`).slice(0, 80),
    name: String(unit.name || `Unit ${index + 1}`).slice(0, 120),
    count,
    copies: integerInRange(unit.copies ?? 1, 1, 40),
    baseSize: width,
    baseDepth: depth,
    columns: integerInRange(unit.columns ?? Math.ceil(Math.sqrt(count)), 1, 40),
    rows: integerInRange(unit.rows ?? Math.ceil(count / Math.max(1, Number(unit.columns || Math.ceil(Math.sqrt(count))))), 1, 40)
  };
}

function normalizeParameters(input = {}) {
  if (input.mode === storageMode || input.trayType === storageMode || input.storageInsert) {
    const insertUnits = Array.isArray(input.insertUnits) ? input.insertUnits.slice(0, 80).map(cleanInsertUnit) : [];
    if (!insertUnits.length) throw new Error("Add at least one unit before exporting a storage insert.");
    const internalLength = numberInRange(input.boxInternalLength ?? input.boxLength ?? input.box?.internalLength, 80, 900);
    const internalWidth = numberInRange(input.boxInternalWidth ?? input.boxWidth ?? input.box?.internalWidth, 80, 700);
    return {
      mode: storageMode,
      columns: 1,
      rows: 1,
      baseSize: 25,
      baseDepth: 25,
      boxKey: String(input.boxKey || input.box?.key || "custom").slice(0, 80),
      boxName: String(input.boxName || input.box?.name || "Custom box").slice(0, 120),
      boxInternalLength: internalLength,
      boxInternalWidth: internalWidth,
      boxInternalDepth: numberInRange(input.boxInternalDepth ?? input.boxDepth ?? input.box?.internalDepth ?? 80, 20, 500),
      insertUnits,
      gap: numberInRange(input.gap ?? 3, 0, 20),
      clearance: numberInRange(input.clearance ?? 1, 0, 10),
      plateThickness: numberInRange(input.plateThickness ?? 2, 0.8, 10),
      wallHeight: numberInRange(input.wallHeight ?? 4, 1, 35),
      wallThickness: numberInRange(input.wallThickness ?? 1.4, 0.8, 6),
      includeBases: Boolean(input.includeBases),
      insertMagnetHoles: Boolean(input.insertMagnetHoles),
      baseMagnetHoles: Boolean(input.baseMagnetHoles),
      magnetHoleDiameter: numberInRange(input.magnetHoleDiameter ?? 2, 1, 8),
      splitThreshold: numberInRange(input.splitThreshold ?? 250, 120, 400),
      ...filamentParameters(input)
    };
  }
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
    ...filamentParameters(input)
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

function buildTrayGeometry(config) {
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

function rectWithVoids({ x = 0, y = 0, z = 0, w, d, h, voids = [] }) {
  const clipped = voids.map((voidBox) => ({
    x: Math.max(0, Math.min(w, voidBox.x)),
    y: Math.max(0, Math.min(d, voidBox.y)),
    w: Math.max(0, Math.min(w, voidBox.x + voidBox.w) - Math.max(0, voidBox.x)),
    d: Math.max(0, Math.min(d, voidBox.y + voidBox.d) - Math.max(0, voidBox.y))
  })).filter((voidBox) => voidBox.w > 0.05 && voidBox.d > 0.05);
  if (!clipped.length) return [{ x, y, z, w, d, h }];
  const yEdges = [...new Set([0, d, ...clipped.flatMap((voidBox) => [voidBox.y, voidBox.y + voidBox.d]).map((edge) => Number(edge.toFixed(4)))])].sort((a, b) => a - b);
  const boxes = [];
  for (let yIndex = 0; yIndex < yEdges.length - 1; yIndex += 1) {
    const y1 = yEdges[yIndex];
    const y2 = yEdges[yIndex + 1];
    if (y2 - y1 <= 0.05) continue;
    const activeVoids = clipped.filter((voidBox) => voidBox.y < y2 - 0.001 && voidBox.y + voidBox.d > y1 + 0.001);
    const xEdges = [...new Set([0, w, ...activeVoids.flatMap((voidBox) => [voidBox.x, voidBox.x + voidBox.w]).map((edge) => Number(edge.toFixed(4)))])].sort((a, b) => a - b);
    for (let xIndex = 0; xIndex < xEdges.length - 1; xIndex += 1) {
      const x1 = xEdges[xIndex];
      const x2 = xEdges[xIndex + 1];
      if (x2 - x1 <= 0.05) continue;
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      if (activeVoids.some((voidBox) => centerX > voidBox.x && centerX < voidBox.x + voidBox.w && centerY > voidBox.y && centerY < voidBox.y + voidBox.d)) continue;
      boxes.push({ x: x + x1, y: y + y1, z, w: x2 - x1, d: y2 - y1, h });
    }
  }
  return boxes;
}

function storageSlots(config) {
  const start = config.wallThickness + config.clearance;
  const maxX = config.boxInternalLength - config.wallThickness - config.clearance;
  const maxY = config.boxInternalWidth - config.wallThickness - config.clearance;
  let x = start;
  let y = start;
  let rowDepth = 0;
  let unplaced = 0;
  const slots = [];
  config.insertUnits.forEach((unit, unitIndex) => {
    const total = unit.count * unit.copies;
    for (let index = 0; index < total; index += 1) {
      const slotWidth = unit.baseSize + config.clearance * 2;
      const slotDepth = unit.baseDepth + config.clearance * 2;
      if (x > start && x + slotWidth > maxX) {
        x = start;
        y += rowDepth + config.gap;
        rowDepth = 0;
      }
      if (y + slotDepth > maxY) {
        unplaced += 1;
        continue;
      }
      slots.push({
        x,
        y,
        w: slotWidth,
        d: slotDepth,
        unitIndex,
        unitName: unit.name,
        baseSize: unit.baseSize,
        baseDepth: unit.baseDepth
      });
      x += slotWidth + config.gap;
      rowDepth = Math.max(rowDepth, slotDepth);
    }
    if (x > start) x += config.gap;
  });
  return { slots, unplaced };
}

function baseBoxesWithOptionalHole({ x, y, z, w, d, h, holeDiameter = 0 }) {
  if (!holeDiameter) return [{ x, y, z, w, d, h }];
  const hole = Math.min(holeDiameter, w - 1, d - 1);
  return rectWithVoids({
    x,
    y,
    z,
    w,
    d,
    h,
    voids: [{ x: (w - hole) / 2, y: (d - hole) / 2, w: hole, d: hole }]
  });
}

function slotWallBoxes(slot, config, offsetX = 0, offsetY = 0) {
  const t = config.wallThickness;
  const z = config.plateThickness;
  const h = config.wallHeight;
  return [
    { x: offsetX + slot.x - t, y: offsetY + slot.y - t, z, w: slot.w + t * 2, d: t, h },
    { x: offsetX + slot.x - t, y: offsetY + slot.y + slot.d, z, w: slot.w + t * 2, d: t, h },
    { x: offsetX + slot.x - t, y: offsetY + slot.y, z, w: t, d: slot.d, h },
    { x: offsetX + slot.x + slot.w, y: offsetY + slot.y, z, w: t, d: slot.d, h }
  ];
}

function puzzleVoids(region, tabDepth, tabLength) {
  const voids = [];
  if (region.notchLeft) voids.push({ x: 0, y: region.d / 2 - tabLength / 2, w: tabDepth, d: tabLength });
  if (region.notchTop) voids.push({ x: region.w / 2 - tabLength / 2, y: 0, w: tabLength, d: tabDepth });
  return voids;
}

function puzzleTabs(region, config, tabDepth, tabLength, outX, outY) {
  const tabs = [];
  if (region.tabRight) tabs.push({ x: outX + region.w, y: outY + region.d / 2 - tabLength / 2, z: 0, w: tabDepth, d: tabLength, h: config.plateThickness });
  if (region.tabBottom) tabs.push({ x: outX + region.w / 2 - tabLength / 2, y: outY + region.d, z: 0, w: tabLength, d: tabDepth, h: config.plateThickness });
  return tabs;
}

function storageRegions(config) {
  const split = config.boxInternalLength > config.splitThreshold || config.boxInternalWidth > config.splitThreshold;
  if (!split) return [{ x0: 0, y0: 0, w: config.boxInternalLength, d: config.boxInternalWidth, outX: 0, outY: 0, split: false }];
  const leftWidth = config.boxInternalLength / 2;
  const rightWidth = config.boxInternalLength - leftWidth;
  const topDepth = config.boxInternalWidth / 2;
  const bottomDepth = config.boxInternalWidth - topDepth;
  const printGap = 18;
  const tabDepth = 8;
  const tabLength = Math.min(34, Math.max(18, Math.min(config.boxInternalLength, config.boxInternalWidth) / 8));
  return [
    { x0: 0, y0: 0, w: leftWidth, d: topDepth, outX: tabDepth, outY: tabDepth, tabRight: true, tabBottom: true, split: true, tabDepth, tabLength },
    { x0: leftWidth, y0: 0, w: rightWidth, d: topDepth, outX: leftWidth + printGap + tabDepth * 3, outY: tabDepth, notchLeft: true, tabBottom: true, split: true, tabDepth, tabLength },
    { x0: 0, y0: topDepth, w: leftWidth, d: bottomDepth, outX: tabDepth, outY: topDepth + printGap + tabDepth * 3, tabRight: true, notchTop: true, split: true, tabDepth, tabLength },
    { x0: leftWidth, y0: topDepth, w: rightWidth, d: bottomDepth, outX: leftWidth + printGap + tabDepth * 3, outY: topDepth + printGap + tabDepth * 3, notchLeft: true, notchTop: true, split: true, tabDepth, tabLength }
  ];
}

function buildStorageInsertGeometry(config) {
  const { slots, unplaced } = storageSlots(config);
  const regions = storageRegions(config);
  const split = regions.length > 1;
  const boxes = [];
  regions.forEach((region) => {
    const tabDepth = region.tabDepth || 0;
    const tabLength = region.tabLength || 0;
    const regionSlots = slots.filter((slot) => {
      const centerX = slot.x + slot.w / 2;
      const centerY = slot.y + slot.d / 2;
      return centerX >= region.x0 && centerX < region.x0 + region.w && centerY >= region.y0 && centerY < region.y0 + region.d;
    });
    const magnetVoids = config.insertMagnetHoles ? regionSlots.map((slot) => ({
      x: slot.x + slot.w / 2 - config.magnetHoleDiameter / 2 - region.x0,
      y: slot.y + slot.d / 2 - config.magnetHoleDiameter / 2 - region.y0,
      w: config.magnetHoleDiameter,
      d: config.magnetHoleDiameter
    })) : [];
    boxes.push(...rectWithVoids({
      x: region.outX,
      y: region.outY,
      z: 0,
      w: region.w,
      d: region.d,
      h: config.plateThickness,
      voids: [...magnetVoids, ...puzzleVoids(region, tabDepth, tabLength)]
    }));
    boxes.push(...puzzleTabs(region, config, tabDepth, tabLength, region.outX, region.outY));
    regionSlots.forEach((slot) => {
      boxes.push(...slotWallBoxes(slot, config, region.outX - region.x0, region.outY - region.y0));
    });
  });

  if (config.includeBases) {
    const outputWidth = split
      ? Math.max(...regions.map((region) => region.outX + region.w + (region.tabRight ? region.tabDepth : 0)))
      : config.boxInternalLength;
    const startY = (split ? Math.max(...regions.map((region) => region.outY + region.d + (region.tabBottom ? region.tabDepth : 0))) : config.boxInternalWidth) + 12;
    const baseGap = Math.max(2, config.gap);
    let x = 0;
    let y = startY;
    let rowDepth = 0;
    slots.forEach((slot) => {
      if (x > 0 && x + slot.baseSize > outputWidth) {
        x = 0;
        y += rowDepth + baseGap;
        rowDepth = 0;
      }
      boxes.push(...baseBoxesWithOptionalHole({
        x,
        y,
        z: 0,
        w: slot.baseSize,
        d: slot.baseDepth,
        h: config.plateThickness,
        holeDiameter: config.baseMagnetHoles ? config.magnetHoleDiameter : 0
      }));
      x += slot.baseSize + baseGap;
      rowDepth = Math.max(rowDepth, slot.baseDepth);
    });
  }

  const materialCm3 = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
  const outputOuterWidth = Math.max(...boxes.map((box) => box.x + box.w), config.boxInternalLength);
  const outputOuterDepth = Math.max(...boxes.map((box) => box.y + box.d), config.boxInternalWidth);
  return {
    config,
    boxes,
    slots,
    unplaced,
    regions,
    split,
    innerWidth: config.boxInternalLength,
    innerDepth: config.boxInternalWidth,
    outerWidth: outputOuterWidth,
    outerDepth: outputOuterDepth,
    assembledWidth: config.boxInternalLength,
    assembledDepth: config.boxInternalWidth,
    materialCm3
  };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  return config.mode === storageMode ? buildStorageInsertGeometry(config) : buildTrayGeometry(config);
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
  if (config.mode === storageMode) return `${prefix}-${config.boxKey || "box"}-insert${config.boxInternalLength > config.splitThreshold || config.boxInternalWidth > config.splitThreshold ? "-4-plates" : ""}.stl`;
  const base = config.baseSize === config.baseDepth ? `${config.baseSize}mm` : `${config.baseSize}x${config.baseDepth}mm`;
  return `${prefix}-${config.columns}x${config.rows}-${base}.stl`;
}

function describe(parameters) {
  const { config } = buildGeometry(parameters);
  if (config.mode === storageMode) {
    const unitCount = config.insertUnits.reduce((sum, unit) => sum + unit.count * unit.copies, 0);
    return `${config.boxName} insert for ${unitCount} models${config.insertMagnetHoles ? ", with 2mm insert magnet holes" : ""}${config.includeBases ? ", including printable bases" : ""}`;
  }
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
