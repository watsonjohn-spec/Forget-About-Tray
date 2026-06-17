const generatorType = "stitch_organizer";
const version = 1;

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

function normalizeParameters(input = {}) {
  const threads = Array.isArray(input.threads) ? input.threads.slice(0, 120).map(normalizeThread) : [];
  const fallbackCount = integerInRange(input.threadCount, 1, 120, 24);
  return {
    threads: threads.length ? threads : Array.from({ length: fallbackCount }, (_, index) => normalizeThread({}, index)),
    columns: integerInRange(input.columns, 1, 16, 8),
    slotWidth: numberInRange(input.slotWidth, 8, 40, 16),
    slotDepth: numberInRange(input.slotDepth, 20, 80, 34),
    gap: numberInRange(input.gap, 0, 12, 2),
    plateThickness: numberInRange(input.plateThickness, 1, 10, 2),
    wallThickness: numberInRange(input.wallThickness, 1, 6, 1.6),
    wallHeight: numberInRange(input.wallHeight, 4, 40, 10),
    filamentMaterial: ["pla", "petg"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla",
    filamentKey: String(input.filamentKey || "pla-lilac").slice(0, 80),
    filamentName: String(input.filamentName || "Project Lilac").slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#8d6aa9"
  };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const rows = Math.ceil(config.threads.length / config.columns);
  const outerWidth = config.columns * config.slotWidth + (config.columns + 1) * config.wallThickness + (config.columns - 1) * config.gap;
  const outerDepth = rows * config.slotDepth + (rows + 1) * config.wallThickness + (rows - 1) * config.gap + 14;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness }];
  for (let index = 0; index < config.threads.length; index += 1) {
    const col = index % config.columns;
    const row = Math.floor(index / config.columns);
    const x = config.wallThickness + col * (config.slotWidth + config.wallThickness + config.gap);
    const y = config.wallThickness + row * (config.slotDepth + config.wallThickness + config.gap);
    boxes.push(
      { x: x - config.wallThickness, y: y - config.wallThickness, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y: y + config.slotDepth, z: config.plateThickness, w: config.slotWidth + config.wallThickness * 2, d: config.wallThickness, h: config.wallHeight },
      { x: x - config.wallThickness, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight },
      { x: x + config.slotWidth, y, z: config.plateThickness, w: config.wallThickness, d: config.slotDepth, h: config.wallHeight }
    );
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
  return `solid stitch_organizer\n${facets}\nendsolid stitch_organizer\n`;
}

function safeFileName(parameters, name) {
  const config = normalizeParameters(parameters);
  const prefix = String(name || "stitch-organizer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stitch-organizer";
  return `${prefix}-${config.threads.length}-threads.stl`;
}

function describe(parameters) {
  const config = normalizeParameters(parameters);
  return `Stitch project tray for ${config.threads.length} thread references`;
}

export const stitchOrganizerGenerator = { type: generatorType, version, name: "Stitch organizer", catalogueType: "thread_references", normalizeParameters, buildGeometry, renderStl, safeFileName, describe };
