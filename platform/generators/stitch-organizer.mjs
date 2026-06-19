const generatorType = "stitch_organizer";
const version = 3;
const stitchStyles = ["thread-slot-tray", "floss-card"];

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
  if (style === "workstation-tray") return "thread-slot-tray";
  return stitchStyles.includes(style) ? style : "thread-slot-tray";
}

function normalizeParameters(input = {}) {
  const threads = Array.isArray(input.threads)
    ? input.threads.slice(0, 120).map(normalizeThread)
    : Array.isArray(input.threadRefs)
      ? input.threadRefs.slice(0, 120).map((reference, index) => normalizeThread(typeof reference === "object" ? reference : { number: reference }, index))
      : [];
  const fallbackCount = integerInRange(input.threadCount, 1, 120, 24);
  return {
    style: normalizeStyle(input.style),
    projectName: String(input.projectName || "Stitch project tray").slice(0, 120),
    threads: threads.length ? threads : Array.from({ length: fallbackCount }, (_, index) => normalizeThread({}, index)),
    columns: integerInRange(input.columns, 1, 16, 3),
    slotWidth: numberInRange(input.slotWidth, 4, 50, 18),
    slotDepth: numberInRange(input.slotDepth, 8, 90, 42),
    labelTextSize: numberInRange(input.labelTextSize, 5, 18, 10),
    engravingDepth: numberInRange(input.engravingDepth, 0.3, 1.5, 1),
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

function plateWithRectangularVoids({ x = 0, y = 0, z = 0, w, d, h, voids = [], stripHeight = 1.2 }) {
  const boxes = [];
  const strips = Math.max(12, Math.ceil(d / stripHeight));
  const actualStrip = d / strips;
  for (let index = 0; index < strips; index += 1) {
    const stripY = y + index * actualStrip;
    const stripEnd = stripY + actualStrip;
    const intervals = voids.flatMap((voidShape) => {
      const voidY = Number(voidShape.y);
      const voidEnd = voidY + Number(voidShape.d);
      if (voidEnd <= stripY || voidY >= stripEnd) return [];
      return [[Math.max(0, Number(voidShape.x) - x), Math.min(w, Number(voidShape.x) + Number(voidShape.w) - x)]];
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

const glyphSegments = {
  "0": "abcedf", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgecd", "7": "abc", "8": "abcdefg", "9": "abfgcd",
  A: "abcefg", B: "cdefg", C: "afed", D: "bcdeg", E: "afged", F: "afge", G: "afedc", H: "bcefg", I: "bc", J: "bcde", K: "efg", L: "fed", M: "abcef", N: "ceg", O: "abcedf", P: "abfge", Q: "abcfged", R: "abfgec", S: "afgcd", T: "afg", U: "bcdef", V: "cde", W: "bcdef", X: "fgbc", Y: "fbgcd", Z: "abged"
};

function glyphSegmentRects(character, x, y, size) {
  const segments = glyphSegments[character] || glyphSegments[String(character).toUpperCase()] || "g";
  const width = size * 0.62;
  const height = size;
  const t = Math.max(0.45, size * 0.13);
  const half = height / 2;
  const rects = {
    a: { x: x + t, y, w: width - t * 2, d: t },
    b: { x: x + width - t, y: y + t, w: t, d: half - t },
    c: { x: x + width - t, y: y + half, w: t, d: half - t },
    d: { x: x + t, y: y + height - t, w: width - t * 2, d: t },
    e: { x, y: y + half, w: t, d: half - t },
    f: { x, y: y + t, w: t, d: half - t },
    g: { x: x + t, y: y + half - t / 2, w: width - t * 2, d: t }
  };
  return [...segments].map((segment) => rects[segment]).filter(Boolean);
}

function engravingVoidsForText(text, centerX, centerY, requestedSize, maxWidth) {
  const clean = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "?";
  const charAdvance = requestedSize * 0.78;
  const scale = Math.min(1, maxWidth / Math.max(charAdvance, clean.length * charAdvance));
  const size = Math.max(4.5, requestedSize * scale);
  const advance = size * 0.78;
  const totalWidth = clean.length * advance - size * 0.16;
  const startX = centerX - totalWidth / 2;
  const startY = centerY - size / 2;
  return [...clean].flatMap((character, index) => glyphSegmentRects(character, startX + index * advance, startY, size));
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

function buildThreadSlotTrayGeometry(config) {
  const columns = Math.max(1, config.columns);
  const rows = Math.max(1, Math.ceil(config.threads.length / columns));
  const margin = 10;
  const labelBandDepth = Math.max(config.labelTextSize + 7, 15);
  const cellWidth = Math.max(config.slotWidth + config.wallThickness * 2, config.labelTextSize * 4.6, 34);
  const cellDepth = config.slotDepth + labelBandDepth + config.wallThickness;
  const outerWidth = margin * 2 + columns * cellWidth + Math.max(0, columns - 1) * config.gap;
  const outerDepth = margin * 2 + rows * cellDepth + Math.max(0, rows - 1) * config.gap;
  const engravingDepth = Math.min(config.engravingDepth, Math.max(0.3, config.plateThickness - 0.4));
  const baseBottomHeight = Math.max(0.4, config.plateThickness - engravingDepth);
  const engravingVoids = [];
  const engravedLabels = [];
  const slots = [];
  const boxes = [
    { x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: baseBottomHeight },
    { x: 0, y: 0, z: config.plateThickness, w: outerWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: 0, y: outerDepth - config.wallThickness * 2, z: config.plateThickness, w: outerWidth, d: config.wallThickness * 2, h: config.wallHeight },
    { x: 0, y: 0, z: config.plateThickness, w: config.wallThickness * 2, d: outerDepth, h: config.wallHeight },
    { x: outerWidth - config.wallThickness * 2, y: 0, z: config.plateThickness, w: config.wallThickness * 2, d: outerDepth, h: config.wallHeight }
  ];
  config.threads.forEach((thread, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = margin + col * (cellWidth + config.gap);
    const cellY = margin + row * (cellDepth + config.gap);
    const x = cellX + (cellWidth - config.slotWidth) / 2;
    const y = cellY;
    const labelCenterX = cellX + cellWidth / 2;
    const labelCenterY = y + config.slotDepth + config.wallThickness + labelBandDepth / 2;
    const labelMaxWidth = Math.max(config.slotWidth, cellWidth - 4);
    const labelVoids = engravingVoidsForText(thread.number, labelCenterX, labelCenterY, config.labelTextSize, labelMaxWidth);
    engravingVoids.push(...labelVoids);
    engravedLabels.push({ text: thread.number, x: labelCenterX, y: labelCenterY, depth: engravingDepth, voids: labelVoids.length });
    slots.push({ thread: thread.number, x, y, w: config.slotWidth, d: config.slotDepth, labelX: labelCenterX, labelY: labelCenterY });
    boxes.push(
      { x: x - config.wallThickness, y: y - config.wallThickness, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y: y + config.slotDepth, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight },
      { x: x + config.slotWidth, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight }
    );
  });
  boxes.push(...plateWithRectangularVoids({ x: 0, y: 0, z: baseBottomHeight, w: outerWidth, d: outerDepth, h: engravingDepth, voids: engravingVoids }));
  return {
    config,
    boxes,
    slots,
    engravedLabels,
    outerWidth,
    outerDepth,
    height: config.plateThickness + config.wallHeight,
    materialCm3: materialCm3(boxes)
  };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  return config.style === "floss-card" ? buildFlossCardGeometry(config) : buildThreadSlotTrayGeometry(config);
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
  return `Thread slot tray for ${config.threads.length} thread references with engraved labels underneath each slot`;
}

export const stitchOrganizerGenerator = {
  type: generatorType,
  version,
  name: "Stitch organizer",
  catalogueType: "thread_references",
  productFamily: "needlecraft",
  factoryLabel: "Stitch organiser",
  defaultFilament: { material: "pla", key: "pla-project-lilac", name: "Project Lilac", hex: "#8d6aa9" },
  capabilities: {
    savedDesigns: true,
    stlDownload: true,
    printFactory: true,
    catalogue: false,
    uploadStl: false,
    variants: ["thread_slot_tray", "floss_card"],
    splitPlates: false
  },
  normalizeParameters,
  buildGeometry,
  renderStl,
  safeFileName,
  describe
};
