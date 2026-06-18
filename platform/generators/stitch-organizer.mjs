const generatorType = "stitch_organizer";
const version = 2;
const stitchStyles = ["floss-card", "workstation-tray"];

function numberInRange(value, minimum, maximum, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error("Invalid stitch organizer parameters");
  return number;
}

function integerInRange(value, minimum, maximum, fallback) {
  return Math.round(numberInRange(value, minimum, maximum, fallback));
}

function normalizeThread(thread = {}, index) {
  return {
    id: String(thread.id || `thread-${index + 1}`).slice(0, 80),
    number: String(thread.number || index + 1).slice(0, 30),
    name: String(thread.name || "Thread").slice(0, 80)
  };
}

function normalizeStyle(style) {
  return stitchStyles.includes(style) ? style : "workstation-tray";
}

function normalizeParameters(input = {}) {
  const threads = Array.isArray(input.threads) ? input.threads.slice(0, 120).map(normalizeThread) : [];
  const fallbackCount = integerInRange(input.threadCount, 1, 120, 24);
  return {
    style: normalizeStyle(input.style),
    threads: threads.length ? threads : Array.from({ length: fallbackCount }, (_, index) => normalizeThread({}, index)),
    columns: integerInRange(input.columns, 1, 16, 8),
    slotWidth: numberInRange(input.slotWidth, 4, 40, 16),
    slotDepth: numberInRange(input.slotDepth, 8, 80, 34),
    gap: numberInRange(input.gap, 0, 12, 2),
    plateThickness: numberInRange(input.plateThickness, 1, 10, 2),
    wallThickness: numberInRange(input.wallThickness, 1, 6, 1.6),
    wallHeight: numberInRange(input.wallHeight, 4, 40, 10),
    filamentMaterial: ["pla", "petg", "abs"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentKey: String(input.filamentKey || "pla-lilac").slice(0, 80),
    filamentName: String(input.filamentName || "Project Lilac").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#8d6aa9"
  };
}

function materialCm3(boxes) {
  return boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) / 1000;
}

function mergeIntervals(intervals) {
  const sorted = intervals.filter((interval) => interval[1] > interval[0]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  sorted.forEach((interval) => {
    const last = merged.at(-1);
    if (!last || interval[0] > last[1]) merged.push([...interval]);
    else last[1] = Math.max(last[1], interval[1]);
  });
  return merged;
}

function plateWithCircularVoids({ x = 0, y = 0, z = 0, w, d, h, voids = [], stripHeight = 1.4 }) {
  const boxes = [];
  const strips = Math.max(12, Math.ceil(d / stripHeight));
  const actualStrip = d / strips;
  for (let index = 0; index < strips; index += 1) {
    const stripY = y + index * actualStrip;
    const centerY = stripY + actualStrip / 2;
    const intervals = voids.flatMap((voidShape) => {
      const rx = voidShape.rx || voidShape.r;
      const ry = voidShape.ry || voidShape.r;
      const relativeY = centerY - voidShape.y;
      if (!rx || !ry || Math.abs(relativeY) >= ry) return [];
      const halfWidth = rx * Math.sqrt(Math.max(0, 1 - (relativeY * relativeY) / (ry * ry)));
      return [[Math.max(0, voidShape.x - halfWidth - x), Math.min(w, voidShape.x + halfWidth - x)]];
    });
    const merged = mergeIntervals(intervals);
    let cursor = 0;
    merged.forEach(([start, end]) => {
      if (start > cursor + 0.05) boxes.push({ x: x + cursor, y: stripY, z, w: start - cursor, d: actualStrip, h });
      cursor = Math.max(cursor, end);
    });
    if (cursor < w - 0.05) boxes.push({ x: x + cursor, y: stripY, z, w: w - cursor, d: actualStrip, h });
  }
  return boxes;
}

function buildFlossCardGeometry(config) {
  const perSide = Math.max(1, Math.ceil(config.threads.length / 2));
  const holeDiameter = Math.max(4, Math.min(12, config.slotWidth));
  const pitch = Math.max(holeDiameter + 5, config.slotDepth);
  const headerDepth = 20;
  const margin = 9;
  const outerWidth = 64;
  const outerDepth = headerDepth + margin * 2 + perSide * pitch;
  const leftX = 12;
  const rightX = outerWidth - 12;
  const voids = [{ x: outerWidth / 2, y: 8, rx: 4, ry: 2.4 }];
  config.threads.forEach((thread, index) => {
    const rightSide = index % 2 === 1;
    const row = Math.floor(index / 2);
    voids.push({
      x: rightSide ? rightX : leftX,
      y: headerDepth + margin + row * pitch,
      rx: holeDiameter / 2,
      ry: holeDiameter / 2
    });
  });
  const boxes = [
    ...plateWithCircularVoids({ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness, voids }),
    { x: outerWidth / 2 - 4, y: headerDepth + 2, z: config.plateThickness, w: 8, d: outerDepth - headerDepth - 8, h: 0.8 },
    { x: 5, y: 4, z: config.plateThickness, w: outerWidth - 10, d: 4, h: 0.7 }
  ];
  return {
    config,
    boxes,
    outerWidth,
    outerDepth,
    height: config.plateThickness + 1,
    materialCm3: materialCm3(boxes)
  };
}

function buildWorkstationGeometry(config) {
  const columns = Math.max(1, config.columns);
  const rows = Math.max(1, Math.ceil(config.threads.length / columns));
  const slotAreaWidth = columns * config.slotWidth + (columns + 1) * config.wallThickness + (columns - 1) * config.gap;
  const slotAreaDepth = rows * config.slotDepth + (rows + 1) * config.wallThickness + (rows - 1) * config.gap;
  const toolWidth = Math.max(96, Math.min(170, slotAreaWidth * 0.92));
  const outerWidth = slotAreaWidth + toolWidth + 28;
  const outerDepth = Math.max(slotAreaDepth + 22, 112);
  const boxes = [
    { x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness },
    { x: 0, y: 0, z: config.plateThickness, w: outerWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: 0, y: outerDepth - config.wallThickness * 2, z: config.plateThickness, w: outerWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: 0, y: 0, z: config.plateThickness, w: config.wallThickness * 2, d: outerDepth, h: config.wallHeight },
    { x: outerWidth - config.wallThickness * 2, y: 0, z: config.plateThickness, w: config.wallThickness * 2, d: outerDepth, h: config.wallHeight }
  ];
  const bobbinX = 10;
  const bobbinY = 10;
  config.threads.forEach((thread, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = bobbinX + config.wallThickness + col * (config.slotWidth + config.wallThickness + config.gap);
    const y = bobbinY + config.wallThickness + row * (config.slotDepth + config.wallThickness + config.gap);
    boxes.push(
      { x: x - config.wallThickness, y: y - config.wallThickness, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y: y + config.slotDepth, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight },
      { x: x + config.slotWidth, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight }
    );
  });
  const toolX = bobbinX + slotAreaWidth + 16;
  const toolY = 16;
  const toolD = outerDepth - 32;
  boxes.push(
    { x: toolX, y: toolY, z: config.plateThickness, w: toolWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: toolX, y: toolY + toolD - config.wallThickness * 2, z: config.plateThickness, w: toolWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: toolX, y: toolY, z: config.plateThickness, w: config.wallThickness * 2, d: toolD, h: config.wallHeight },
    { x: toolX + toolWidth - config.wallThickness * 2, y: toolY, z: config.plateThickness, w: config.wallThickness * 2, d: toolD, h: config.wallHeight },
    { x: toolX + 10, y: toolY + toolD * 0.58, z: config.plateThickness, w: toolWidth - 20, d: config.wallThickness, h: config.wallHeight * 0.55 }
  );
  return {
    config,
    boxes,
    outerWidth,
    outerDepth,
    height: config.plateThickness + config.wallHeight,
    materialCm3: materialCm3(boxes)
  };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  return config.style === "floss-card" ? buildFlossCardGeometry(config) : buildWorkstationGeometry(config);
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
  return `solid stitch_organizer\n${facets}\nendsolid stitch_organizer\n`;
}

function safeFileName(parameters, name) {
  const config = normalizeParameters(parameters);
  const prefix = String(name || "stitch-organizer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stitch-organizer";
  return `${prefix}-${config.style}-${config.threads.length}-threads.stl`;
}

function describe(parameters) {
  const config = normalizeParameters(parameters);
  if (config.style === "floss-card") return `Floss card for ${config.threads.length} thread references`;
  return `Stitch workstation tray for ${config.threads.length} thread references, bobbins, tools, and phone`;
}

export const stitchOrganizerGenerator = { type: generatorType, version, name: "Stitch organizer", catalogueType: "thread_references", normalizeParameters, buildGeometry, renderStl, safeFileName, describe };
