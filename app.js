const defaults = {
  columns: 4,
  rows: 3,
  baseSize: 25,
  baseDepth: 25,
  baseShape: "square",
  gap: 1,
  clearance: 1,
  plateThickness: 2,
  lipEnabled: true,
  wallHeight: 3,
  wallThickness: 1.6,
  notchesEnabled: true,
  notchWidth: 2,
  outputMode: "tray",
  includeBases: false,
  filamentKey: "pla-bambu-green",
  filamentMaterial: "pla",
  filamentName: "Bambu Green",
  filamentHex: "#00AE42"
};

const numericKeys = [
  "columns", "rows", "baseSize", "baseDepth", "gap", "clearance", "plateThickness",
  "wallHeight", "wallThickness", "notchWidth"
];
const checkboxKeys = ["lipEnabled", "notchesEnabled"];
const rectangleBaseLengths = [50, 60, 75, 100, 150];
const circleBaseDiameters = [25, 28.5, 32, 40, 50, 60, 80, 90, 100, 130, 160];
const ovalBaseSizes = [
  { width: 60, depth: 35 },
  { width: 75, depth: 42 },
  { width: 90, depth: 52 },
  { width: 105, depth: 70 },
  { width: 120, depth: 92 },
  { width: 170, depth: 105 }
];
const storageInsertMode = "storage_insert";
const storageBaseShapes = ["square", "rectangle", "circle", "oval"];
const trayOutputModes = ["tray", "tray-and-bases", "bases-only"];
const reallyUsefulBoxes = [
  { key: "rub-4l", name: "4 litre Really Useful Box", internalLength: 348, internalWidth: 220, internalDepth: 68 },
  { key: "rub-9l", name: "9 litre Really Useful Box", internalLength: 335, internalWidth: 210, internalDepth: 140 },
  { key: "rub-11l", name: "11 litre Really Useful Box", internalLength: 375, internalWidth: 310, internalDepth: 91 },
  { key: "rub-18l", name: "18 litre Really Useful Box", internalLength: 395, internalWidth: 335, internalDepth: 170 },
  { key: "rub-19l", name: "19 litre Really Useful Box", internalLength: 315, internalWidth: 205, internalDepth: 270 },
  { key: "rub-35l", name: "35 litre Really Useful Box", internalLength: 370, internalWidth: 310, internalDepth: 280 },
  { key: "rub-64l", name: "64 litre Really Useful Box", internalLength: 605, internalWidth: 370, internalDepth: 280 },
  { key: "rub-84l", name: "84 litre Really Useful Box", internalLength: 605, internalWidth: 370, internalDepth: 355 },
  { key: "custom", name: "Custom box", internalLength: 348, internalWidth: 220, internalDepth: 68 }
];
const storageDepthPresets = [
  { key: "3", label: "Shallow - 3mm", wallHeight: 3 },
  { key: "4", label: "Standard - 4mm", wallHeight: 4 },
  { key: "6", label: "Deep - 6mm", wallHeight: 6 },
  { key: "8", label: "Extra deep - 8mm", wallHeight: 8 }
];
const filamentColours = [
  ["pla", "Jade White", "#EBEEE9"], ["pla", "Beige", "#E8D5B5"], ["pla", "Yellow", "#F4D03F"],
  ["pla", "Orange", "#F07C24"], ["pla", "Red", "#C73A3A"], ["pla", "Magenta", "#C04473"],
  ["pla", "Purple", "#6E4B8B"], ["pla", "Blue", "#2F68A2"], ["pla", "Cyan", "#32AFC3"],
  ["pla", "Bambu Green", "#00AE42"], ["pla", "Mistletoe Green", "#3F6B47"], ["pla", "Brown", "#6F4E37"],
  ["pla", "Gray", "#8A8D8F"], ["pla", "Silver", "#A6A8A9"], ["pla", "Black", "#202223"],
  ["petg", "White", "#F1F2EE"], ["petg", "Yellow", "#F3C623"], ["petg", "Orange", "#E87524"],
  ["petg", "Red", "#B93636"], ["petg", "Blue", "#32658C"], ["petg", "Green", "#398052"],
  ["petg", "Gray", "#777C7D"], ["petg", "Black", "#1C1E1F"],
  ["abs", "Natural", "#E6DFCF"], ["abs", "Gray", "#777C7D"], ["abs", "Black", "#202223"]
].map(([material, name, hex]) => ({ material, name, hex, key: `${material}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` }));
const inputs = Object.fromEntries([...numericKeys, ...checkboxKeys].map((key) => [key, document.getElementById(key)]));
const filamentColourInput = document.getElementById("filamentColour");
const filamentMaterialInput = document.getElementById("filamentMaterial");
const storageFilamentColourInput = document.getElementById("storageFilamentColour");
const storageFilamentMaterialInput = document.getElementById("storageFilamentMaterial");
function populateStorageFilamentControls(material = "pla", selectedKey = "") {
  if (!storageFilamentColourInput || !storageFilamentMaterialInput) return;
  storageFilamentMaterialInput.value = material;
  const options = filamentColours.filter((colour) => colour.material === material);
  storageFilamentColourInput.innerHTML = options.map((colour) => `<option value="${colour.key}">${colour.name}</option>`).join("");
  storageFilamentColourInput.value = options.some((colour) => colour.key === selectedKey) ? selectedKey : options[0]?.key || "";
}
function populateFilamentColours(material = "pla", selectedKey = "") {
  const options = filamentColours.filter((colour) => colour.material === material);
  filamentColourInput.innerHTML = options.map((colour) => `<option value="${colour.key}">${colour.name}</option>`).join("");
  filamentColourInput.value = options.some((colour) => colour.key === selectedKey) ? selectedKey : options[0]?.key || "";
  populateStorageFilamentControls(material, filamentColourInput.value);
}
populateFilamentColours(defaults.filamentMaterial, defaults.filamentKey);
let state = { ...defaults };
let armyRecommendations = [];
let activeArmyRecommendationId = "";
let armyEditingId = "";
let armyEditOriginalState = null;
let armyParseReport = { lines: 0, candidates: 0 };
let storageRecommendations = [];
let storageParseReport = { lines: 0, candidates: 0 };
let storageState = {
  boxKey: "rub-4l",
  boxName: "4 litre Really Useful Box",
  boxInternalLength: 348,
  boxInternalWidth: 220,
  boxInternalDepth: 68,
  insertMagnetHoles: false,
  includeBases: false,
  baseMagnetHoles: false,
  magnetHoleDiameter: 2,
  splitThreshold: 250,
  gap: 3,
  clearance: 1,
  plateThickness: 2,
  wallHeight: 4,
  wallThickness: 1.4
};

function isRoundBaseShape(shape) {
  return shape === "circle" || shape === "oval";
}

function normalizeStorageBaseShape(shape, width, depth) {
  if (storageBaseShapes.includes(shape)) return shape;
  return Number(width) === Number(depth) ? "square" : "rectangle";
}

function shapeLocksDepth(shape) {
  return shape === "square" || shape === "circle";
}

function storageShapeLabel(shape) {
  return ({ square: "Square", rectangle: "Rectangle", circle: "Circle", oval: "Oval" })[shape] || "Rectangle";
}

function storageBaseArea(width, depth, shape) {
  return isRoundBaseShape(shape) ? Math.PI * (width / 2) * (depth / 2) : width * depth;
}

const { normalizeTrayOutputMode, packedLooseBaseLayout } = window.trayLayout;

function trayHasTray(config = state) {
  return window.trayLayout.trayHasTray(config);
}

function trayIncludesBases(config = state) {
  return window.trayLayout.trayIncludesBases(config);
}

function storageSlotWallVolume(slot, config) {
  const t = config.wallThickness;
  if (isRoundBaseShape(slot.baseShape)) {
    const outerArea = Math.PI * ((slot.w + t * 2) / 2) * ((slot.d + t * 2) / 2);
    const innerArea = Math.PI * (slot.w / 2) * (slot.d / 2);
    return (outerArea - innerArea) * config.wallHeight;
  }
  return ((slot.w + t * 2) * t * 2 + slot.d * t * 2) * config.wallHeight;
}
let pendingExportConfig = null;
let pendingExportPrefix = "";
let adCountdownTimer = null;
let toastTimer;
let unlimitedExportsVerified = false;
let accountExportState = { freeExportUsed: false, unlimitedExports: false };
let cloudPresets = [];
let cloudArmyProjects = [];
let catalogueContext = "army";
let accountOrders = [];
let marketplaceQuotes = [];
let selectedMarketplaceQuoteId = "";
let previewYaw = -Math.PI / 4;
let previewPitch = Math.PI / 5;
let previewDrag = null;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rectangleDepth(width, preferred) {
  if (preferred && preferred !== width && rectangleBaseLengths.includes(preferred)) return preferred;
  return rectangleBaseLengths.find((length) => length > width) || rectangleBaseLengths.find((length) => length !== width);
}

function baseDepthForShape(shape, width, preferred) {
  const normalizedShape = normalizeStorageBaseShape(shape, width, preferred);
  if (shapeLocksDepth(normalizedShape)) return width;
  if (normalizedShape === "oval") {
    const preset = ovalBaseSizes.find((base) => Number(base.width) === Number(width));
    if (preset) return preset.depth;
    if (preferred && preferred !== width) return preferred;
    return ovalBaseSizes.find((base) => base.width > width)?.depth || ovalBaseSizes[0].depth;
  }
  return rectangleDepth(width, preferred);
}

function readState() {
  numericKeys.forEach((key) => {
    const input = inputs[key];
    state[key] = clamp(Number(input.value) || defaults[key], Number(input.getAttribute("min")), Number(input.getAttribute("max")));
    input.value = state[key];
  });
  checkboxKeys.forEach((key) => { state[key] = inputs[key].checked; });
  state.outputMode = normalizeTrayOutputMode({ outputMode: document.querySelector('input[name="printOutputMode"]:checked')?.value });
  state.includeBases = trayIncludesBases(state);
  if (filamentMaterialInput && filamentMaterialInput.value !== state.filamentMaterial) populateFilamentColours(filamentMaterialInput.value, filamentColourInput.value);
  const filament = filamentColours.find((colour) => colour.key === filamentColourInput.value) || filamentColours[0];
  state.filamentKey = filament.key;
  state.filamentMaterial = filament.material;
  state.filamentName = filament.name;
  state.filamentHex = filament.hex;
  state.baseShape = normalizeStorageBaseShape(document.querySelector("[data-base-shape].active")?.dataset.baseShape || "square", state.baseSize, state.baseDepth);
  state.baseDepth = baseDepthForShape(state.baseShape, state.baseSize, state.baseDepth);
  if (shapeLocksDepth(state.baseShape) || !inputs.baseDepth.value || inputs.baseDepth.value !== String(state.baseDepth)) {
    inputs.baseDepth.value = state.baseDepth;
  }
}

function writeState(nextState) {
  state = { ...defaults, ...nextState };
  state.outputMode = normalizeTrayOutputMode(nextState);
  state.includeBases = trayIncludesBases(state);
  state.baseShape = normalizeStorageBaseShape(nextState.baseShape, state.baseSize, state.baseDepth);
  state.baseDepth = baseDepthForShape(state.baseShape, state.baseSize, state.baseDepth);
  numericKeys.forEach((key) => { inputs[key].value = state[key]; });
  checkboxKeys.forEach((key) => { inputs[key].checked = state[key]; });
  document.querySelector(`input[name="printOutputMode"][value="${state.outputMode}"]`).checked = true;
  if (filamentMaterialInput) filamentMaterialInput.value = state.filamentMaterial || defaults.filamentMaterial;
  populateFilamentColours(state.filamentMaterial || defaults.filamentMaterial, state.filamentKey || defaults.filamentKey);
  filamentColourInput.value = state.filamentKey || defaults.filamentKey;
  document.querySelectorAll("[data-base-shape]").forEach((button) => button.classList.toggle("active", button.dataset.baseShape === state.baseShape));
  render();
}

function trayMetrics(config = state) {
  if (config.mode === storageInsertMode) return storageInsertMetrics(config);
  config = { ...defaults, ...config };
  config.outputMode = normalizeTrayOutputMode(config);
  config.includeBases = trayIncludesBases(config);
  const hasTray = trayHasTray(config);
  const innerWidth = config.columns * config.baseSize + (config.columns - 1) * config.gap + config.clearance * 2;
  const innerDepth = config.rows * config.baseDepth + (config.rows - 1) * config.gap + config.clearance * 2;
  const wall = config.lipEnabled ? config.wallThickness : 0;
  const trayOuterWidth = innerWidth + wall * 2;
  const trayOuterDepth = innerDepth + wall * 2;
  const baseLayout = config.includeBases ? packedLooseBaseLayout(config, hasTray ? trayOuterWidth : 0, hasTray ? trayOuterDepth : 0) : null;
  const outerWidth = hasTray ? Math.max(trayOuterWidth, baseLayout?.width || trayOuterWidth) : (baseLayout?.width || 0);
  const outerDepth = hasTray ? Math.max(trayOuterDepth, baseLayout?.depth || trayOuterDepth) : (baseLayout?.depth || 0);
  const height = hasTray ? config.plateThickness + (config.lipEnabled ? config.wallHeight : 0) : config.plateThickness;
  const boxes = hasTray ? buildBoxes(config) : [];
  const baseVolume = config.includeBases ? config.columns * config.rows * storageBaseArea(config.baseSize, config.baseDepth, config.baseShape) * config.plateThickness : 0;
  const volume = boxes.reduce((sum, box) => sum + box.w * box.d * box.h, 0) + baseVolume;
  return { innerWidth, innerDepth, trayOuterWidth, trayOuterDepth, outerWidth, outerDepth, height, boxes, baseLayout, volume };
}

function readStorageState() {
  const selected = reallyUsefulBoxes.find((box) => box.key === document.getElementById("storageBoxSelect").value) || reallyUsefulBoxes[0];
  const custom = selected.key === "custom";
  storageState.boxKey = selected.key;
  storageState.boxName = selected.name;
  storageState.boxInternalLength = custom ? Number(document.getElementById("storageBoxLength").value || selected.internalLength) : selected.internalLength;
  storageState.boxInternalWidth = custom ? Number(document.getElementById("storageBoxWidth").value || selected.internalWidth) : selected.internalWidth;
  storageState.boxInternalDepth = custom ? Number(document.getElementById("storageBoxDepth").value || selected.internalDepth) : selected.internalDepth;
  const depthPreset = document.getElementById("storageWallHeightPreset").value;
  storageState.wallHeight = depthPreset === "custom"
    ? Number(document.getElementById("storageWallHeight").value || storageState.wallHeight)
    : Number(depthPreset);
  storageState.insertMagnetHoles = document.querySelector('input[name="storageInsertMagnets"]:checked')?.value === "yes";
  storageState.includeBases = document.getElementById("storageIncludeBases").checked;
  storageState.baseMagnetHoles = document.querySelector('input[name="storageBaseMagnets"]:checked')?.value === "yes";
  const filament = filamentColours.find((colour) => colour.key === filamentColourInput.value) || filamentColours[0];
  storageState.filamentKey = filament.key;
  storageState.filamentMaterial = filament.material;
  storageState.filamentName = filament.name;
  storageState.filamentHex = filament.hex;
  document.getElementById("storageCustomBoxFields").hidden = !custom;
  document.getElementById("storageWallHeight").disabled = depthPreset !== "custom";
}

function storageInsertUnits() {
  return storageRecommendations
    .map((item) => ({
      id: item.id,
      name: item.name,
      count: item.count,
      copies: item.copies || 1,
      baseShape: normalizeStorageBaseShape(item.baseShape, item.baseSize, item.baseDepth),
      baseSize: item.baseSize,
      baseDepth: shapeLocksDepth(normalizeStorageBaseShape(item.baseShape, item.baseSize, item.baseDepth)) ? item.baseSize : item.baseDepth,
      columns: item.columns,
      rows: item.rows
    }))
    .filter((item) => item.count > 0 && item.baseSize > 0 && item.baseDepth > 0);
}

function storageInsertConfig() {
  readStorageState();
  return {
    mode: storageInsertMode,
    boxKey: storageState.boxKey,
    boxName: storageState.boxName,
    boxInternalLength: storageState.boxInternalLength,
    boxInternalWidth: storageState.boxInternalWidth,
    boxInternalDepth: storageState.boxInternalDepth,
    insertUnits: storageInsertUnits(),
    gap: storageState.gap,
    clearance: storageState.clearance,
    plateThickness: storageState.plateThickness,
    wallHeight: storageState.wallHeight,
    wallThickness: storageState.wallThickness,
    includeBases: storageState.includeBases,
    insertMagnetHoles: storageState.insertMagnetHoles,
    baseMagnetHoles: storageState.baseMagnetHoles,
    magnetHoleDiameter: storageState.magnetHoleDiameter,
    splitThreshold: storageState.splitThreshold,
    filamentKey: storageState.filamentKey || state.filamentKey,
    filamentMaterial: storageState.filamentMaterial || state.filamentMaterial,
    filamentName: storageState.filamentName || state.filamentName,
    filamentHex: storageState.filamentHex || state.filamentHex
  };
}

function populateStorageBoxes() {
  const select = document.getElementById("storageBoxSelect");
  select.innerHTML = reallyUsefulBoxes.map((box) => `<option value="${box.key}">${box.name} - ${box.internalLength} x ${box.internalWidth} x ${box.internalDepth}mm internal</option>`).join("");
  select.value = storageState.boxKey;
  document.getElementById("storageBoxLength").value = storageState.boxInternalLength;
  document.getElementById("storageBoxWidth").value = storageState.boxInternalWidth;
  document.getElementById("storageBoxDepth").value = storageState.boxInternalDepth;
  const preset = storageDepthPresets.find((item) => item.wallHeight === storageState.wallHeight);
  document.getElementById("storageWallHeightPreset").value = preset?.key || "custom";
  document.getElementById("storageWallHeight").value = storageState.wallHeight;
  document.getElementById("storageWallHeight").disabled = Boolean(preset);
}

function loadStorageConfig(config) {
  storageState = {
    ...storageState,
    boxKey: config.boxKey || "custom",
    boxName: config.boxName || "Custom box",
    boxInternalLength: config.boxInternalLength || 348,
    boxInternalWidth: config.boxInternalWidth || 220,
    boxInternalDepth: config.boxInternalDepth || 68,
    insertMagnetHoles: Boolean(config.insertMagnetHoles),
    includeBases: Boolean(config.includeBases),
    baseMagnetHoles: Boolean(config.baseMagnetHoles),
    wallHeight: Number(config.wallHeight || storageState.wallHeight || 4)
  };
  storageRecommendations = (config.insertUnits || []).map((unit, index) => ({
    id: unit.id || `stored-${index}`,
    name: unit.name || `Unit ${index + 1}`,
    count: unit.count || 1,
    copies: unit.copies || 1,
    columns: unit.columns || 1,
    rows: unit.rows || unit.count || 1,
    baseSize: unit.baseSize,
    baseDepth: shapeLocksDepth(normalizeStorageBaseShape(unit.baseShape, unit.baseSize, unit.baseDepth)) ? unit.baseSize : unit.baseDepth,
    baseShape: normalizeStorageBaseShape(unit.baseShape, unit.baseSize, unit.baseDepth),
    matched: true
  }));
  if (!reallyUsefulBoxes.some((box) => box.key === storageState.boxKey)) storageState.boxKey = "custom";
  document.getElementById("storageBoxSelect").value = storageState.boxKey;
  document.getElementById("storageBoxLength").value = storageState.boxInternalLength;
  document.getElementById("storageBoxWidth").value = storageState.boxInternalWidth;
  document.getElementById("storageBoxDepth").value = storageState.boxInternalDepth;
  const depthPreset = storageDepthPresets.find((item) => item.wallHeight === storageState.wallHeight);
  document.getElementById("storageWallHeightPreset").value = depthPreset?.key || "custom";
  document.getElementById("storageWallHeight").value = storageState.wallHeight;
  document.getElementById("storageWallHeight").disabled = Boolean(depthPreset);
  document.querySelector(`input[name="storageInsertMagnets"][value="${storageState.insertMagnetHoles ? "yes" : "no"}"]`).checked = true;
  document.getElementById("storageIncludeBases").checked = storageState.includeBases;
  document.querySelector(`input[name="storageBaseMagnets"][value="${storageState.baseMagnetHoles ? "yes" : "no"}"]`).checked = true;
  switchMode("storage");
  renderStorageRecommendations();
}

function storageSlots(config = storageInsertConfig()) {
  const slots = [];
  const start = config.wallThickness + config.clearance;
  const maxX = config.boxInternalLength - config.wallThickness - config.clearance;
  const maxY = config.boxInternalWidth - config.wallThickness - config.clearance;
  let x = start;
  let y = start;
  let rowDepth = 0;
  let unplaced = 0;
  config.insertUnits.forEach((unit, unitIndex) => {
    const total = unit.count * (unit.copies || 1);
    const baseShape = normalizeStorageBaseShape(unit.baseShape, unit.baseSize, unit.baseDepth);
    const baseDepth = shapeLocksDepth(baseShape) ? unit.baseSize : unit.baseDepth;
    for (let index = 0; index < total; index += 1) {
      const slotWidth = unit.baseSize + config.clearance * 2;
      const slotDepth = baseDepth + config.clearance * 2;
      if (x > start && x + slotWidth > maxX) {
        x = start;
        y += rowDepth + config.gap;
        rowDepth = 0;
      }
      if (y + slotDepth > maxY) {
        unplaced += 1;
        continue;
      }
      slots.push({ x, y, w: slotWidth, d: slotDepth, unitIndex, name: unit.name, baseSize: unit.baseSize, baseDepth, baseShape });
      x += slotWidth + config.gap;
      rowDepth = Math.max(rowDepth, slotDepth);
    }
    if (x > start) x += config.gap;
  });
  return { slots, unplaced };
}

function storageInsertMetrics(config = storageInsertConfig()) {
  const { slots, unplaced } = storageSlots(config);
  const split = config.boxInternalLength > config.splitThreshold || config.boxInternalWidth > config.splitThreshold;
  const baseVolume = config.boxInternalLength * config.boxInternalWidth * config.plateThickness;
  const wallVolume = slots.reduce((sum, slot) => sum + storageSlotWallVolume(slot, config), 0);
  const basesVolume = config.includeBases ? slots.reduce((sum, slot) => sum + storageBaseArea(slot.baseSize, slot.baseDepth, slot.baseShape) * config.plateThickness, 0) : 0;
  return {
    innerWidth: config.boxInternalLength,
    innerDepth: config.boxInternalWidth,
    outerWidth: config.boxInternalLength,
    outerDepth: config.boxInternalWidth,
    assembledWidth: config.boxInternalLength,
    assembledDepth: config.boxInternalWidth,
    height: config.plateThickness + config.wallHeight,
    slots,
    unplaced,
    split,
    plateCount: split ? 4 : 1,
    volume: baseVolume + wallVolume + basesVolume
  };
}

function effectiveStoragePrintVolumeMm3(volume) {
  return window.forgetPrintEstimates.calibratedMaterialCm3(volume / 1000) * 1000;
}

function storageValidationMessages(config, metrics) {
  const messages = [];
  if (metrics.unplaced) messages.push(`${metrics.unplaced} slots do not fit this box`);
  if (metrics.split) messages.push("prints as 4 jigsaw plates");
  if (config.includeBases && metrics.slots.length) messages.push(`${metrics.slots.length} matching bases added`);
  if (config.plateThickness + config.wallHeight > config.boxInternalDepth) messages.push("insert depth exceeds box depth");
  return messages;
}

function buildBoxes(config = state) {
  const innerWidth = config.columns * config.baseSize + (config.columns - 1) * config.gap + config.clearance * 2;
  const innerDepth = config.rows * config.baseDepth + (config.rows - 1) * config.gap + config.clearance * 2;
  const wall = config.lipEnabled ? config.wallThickness : 0;
  const outerWidth = innerWidth + wall * 2;
  const outerDepth = innerDepth + wall * 2;
  const boxes = [{ x: 0, y: 0, z: 0, w: outerWidth, d: outerDepth, h: config.plateThickness }];

  if (!config.lipEnabled) return boxes;

  const z = config.plateThickness;
  const h = config.wallHeight;
  const notch = config.notchesEnabled ? Math.min(config.notchWidth, config.baseSize * 0.45) : 0;

  const horizontalSegments = segmentSpans(config.columns, config.baseSize, config.gap, config.clearance, notch);
  horizontalSegments.forEach(({ start, length }) => {
    boxes.push({ x: wall + start, y: 0, z, w: length, d: wall, h });
    boxes.push({ x: wall + start, y: outerDepth - wall, z, w: length, d: wall, h });
  });

  const verticalSegments = segmentSpans(config.rows, config.baseDepth, config.gap, config.clearance, notch);
  verticalSegments.forEach(({ start, length }) => {
    boxes.push({ x: 0, y: wall + start, z, w: wall, d: length, h });
    boxes.push({ x: outerWidth - wall, y: wall + start, z, w: wall, d: length, h });
  });

  boxes.push(
    { x: 0, y: 0, z, w: wall, d: wall, h },
    { x: outerWidth - wall, y: 0, z, w: wall, d: wall, h },
    { x: 0, y: outerDepth - wall, z, w: wall, d: wall, h },
    { x: outerWidth - wall, y: outerDepth - wall, z, w: wall, d: wall, h }
  );

  return boxes;
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

function render() {
  readState();
  const metrics = trayMetrics();
  document.getElementById("columnsOutput").textContent = state.columns;
  document.getElementById("rowsOutput").textContent = state.rows;
  document.getElementById("unitCount").textContent = `${state.columns * state.rows} models`;
  document.getElementById("widthLabel").textContent = `${metrics.outerWidth.toFixed(1)} mm`;
  document.getElementById("depthLabel").textContent = `${metrics.outerDepth.toFixed(1)} mm`;
  document.getElementById("outerSize").textContent = `${metrics.outerWidth.toFixed(1)} × ${metrics.outerDepth.toFixed(1)} mm`;
  document.getElementById("totalHeight").textContent = `${metrics.height.toFixed(1)} mm`;
  document.getElementById("materialEstimate").textContent = `${window.forgetPrintEstimates.generatedWeightGrams(metrics.volume / 1000, state.filamentMaterial).toFixed(1)} g`;
  document.getElementById("bodyCount").textContent = state.columns * state.rows;
  document.getElementById("exportFilename").textContent = fileName();
  document.getElementById("lipFields").classList.toggle("disabled", !state.lipEnabled || !trayHasTray(state));
  document.getElementById("baseDepthField").hidden = shapeLocksDepth(state.baseShape);
  document.querySelectorAll("[data-base-shape]").forEach((button) => button.classList.toggle("active", button.dataset.baseShape === state.baseShape));
  document.querySelectorAll("[data-base]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.base) === state.baseSize);
  });
  drawPreview(metrics);
}

function shadeHex(hex, amount) {
  const value = hex.replace("#", "");
  const number = Number.parseInt(value, 16);
  const channel = (shift) => clamp((number >> shift & 255) + amount, 0, 255).toString(16).padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function drawPreview(metrics) {
  const svg = document.getElementById("trayPreview");
  const hasTray = trayHasTray(state);
  const w = metrics.trayOuterWidth || 0;
  const d = metrics.trayOuterDepth || 0;
  const base = state.plateThickness;
  const boxes = [...metrics.boxes];
  const cylinders = [];

  const wall = state.lipEnabled ? state.wallThickness : 0;
  const xStart = wall + state.clearance;
  const yStart = wall + state.clearance;
  if (state.includeBases && metrics.baseLayout?.placements?.length) {
    metrics.baseLayout.placements.forEach((placement) => {
      if (isRoundBaseShape(state.baseShape)) {
        cylinders.push({
          cx: placement.x + placement.w / 2,
          cy: placement.y + placement.d / 2,
          z: 0,
          rx: placement.w / 2,
          ry: placement.d / 2,
          h: state.plateThickness,
          previewClass: "preview-loose-base"
        });
      } else {
        boxes.push({ x: placement.x, y: placement.y, z: 0, w: placement.w, d: placement.d, h: state.plateThickness, previewClass: "preview-loose-base" });
      }
    });
  }

  window.forgetPreview3d.renderBoxes(svg, {
    width: metrics.outerWidth,
    depth: metrics.outerDepth,
    height: metrics.height,
    yaw: previewYaw,
    pitch: previewPitch,
    viewHeight: 450,
    colour: state.filamentHex,
    boxes,
    cylinders,
    overlay: (transform) => {
      if (!hasTray) return "";
      const filamentDark = window.forgetPreview3d.shadeColour(state.filamentHex, -70);
      let markup = "";
      for (let column = 1; column < state.columns; column += 1) {
        const x = xStart + column * state.baseSize + (column - 0.5) * state.gap;
        const p1 = transform.project(x, wall, base + 0.05);
        const p2 = transform.project(x, d - wall, base + 0.05);
        markup += `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" stroke="${filamentDark}" stroke-width="0.8" stroke-dasharray="3 4" opacity=".55"/>`;
      }
      for (let row = 1; row < state.rows; row += 1) {
        const y = yStart + row * state.baseDepth + (row - 0.5) * state.gap;
        const p1 = transform.project(wall, y, base + 0.05);
        const p2 = transform.project(w - wall, y, base + 0.05);
        markup += `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" stroke="${filamentDark}" stroke-width="0.8" stroke-dasharray="3 4" opacity=".55"/>`;
      }
      return markup;
    }
  });
}

function fileName(config = state, prefix = "movement-tray") {
  if (config.mode === storageInsertMode) {
    const suffix = config.boxInternalLength > (config.splitThreshold || 250) || config.boxInternalWidth > (config.splitThreshold || 250) ? "-4-plates" : "";
    return `${slugify(prefix || config.boxName || "box-insert")}-${config.boxKey || "custom"}-insert${suffix}.stl`;
  }
  const base = config.baseSize === config.baseDepth
    ? `${formatNumber(config.baseSize)}mm`
    : `${formatNumber(config.baseSize)}x${formatNumber(config.baseDepth)}mm`;
  const shape = normalizeStorageBaseShape(config.baseShape, config.baseSize, config.baseDepth);
  const shapeSuffix = shape === "square" || shape === "rectangle" ? "" : `-${shape}`;
  const outputSuffix = normalizeTrayOutputMode(config) === "bases-only" ? "-bases-only" : "";
  return `${slugify(prefix)}-${config.columns}x${config.rows}-${base}${shapeSuffix}${outputSuffix}.stl`;
}

function formatNumber(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "").replace(".", "-");
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "movement-tray";
}

async function fetchStlFile(config = state, prefix = "movement-tray", downloadToken = "") {
  const response = await authorizedFetch("/api/account/export-stl", {
    method: "POST",
    body: JSON.stringify({ config, name: prefix, downloadToken })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "The STL could not be downloaded.");
  }
  const blob = await response.blob();
  const headerName = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1];
  return { blob, filename: headerName || fileName(config, prefix) };
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function exportStl(config = state, prefix = "movement-tray", downloadToken = "") {
  const file = await fetchStlFile(config, prefix, downloadToken);
  downloadBlob(file.blob, file.filename);
  showToast(`${file.filename} exported`);
}

async function emailStl(config = state, prefix = "movement-tray", downloadToken = "") {
  const file = await fetchStlFile(config, prefix, downloadToken);
  downloadBlob(file.blob, file.filename);
  const subject = encodeURIComponent(`STL file: ${file.filename}`);
  const body = encodeURIComponent(`The STL file ${file.filename} has been downloaded to this device. Attach it to this email before sending.`);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  showToast("STL downloaded and email app opened");
}

function freeExportUsed() {
  return accountExportState.freeExportUsed;
}

async function authorizedFetch(path, options = {}) {
  return fetch(checkoutApiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...await accountService.authHeaders(),
      ...(options.headers || {})
    }
  });
}

function platformHeaders() {
  return window.platformService?.requestHeaders() || {};
}

async function refreshExportState() {
  if (!accountService.isSignedIn()) return accountExportState;
  try {
    const response = await authorizedFetch("/api/account/export-status");
    if (!response.ok) throw new Error("Export access could not be checked.");
    const result = await response.json();
    accountExportState = result;
    unlimitedExportsVerified = Boolean(result.unlimitedExports);
  } catch {
    accountExportState = { freeExportUsed: true, unlimitedExports: false };
  }
  return accountExportState;
}

async function hasUnlimitedExports() {
  if (unlimitedExportsVerified) return true;
  return Boolean((await refreshExportState()).unlimitedExports);
}

async function requestExport(config = state, prefix = "movement-tray") {
  pendingExportConfig = { ...config };
  pendingExportPrefix = prefix;
  const unlimited = await hasUnlimitedExports();
  clearInterval(adCountdownTimer);
  document.getElementById("exportDialogTitle").textContent = fileName(config, prefix);
  document.getElementById("exportChoices").hidden = false;
  document.getElementById("chooseUnlockedExport").hidden = !unlimited;
  document.getElementById("chooseEmailExport").hidden = !unlimited;
  document.getElementById("chooseAdExport").hidden = unlimited || freeExportUsed();
  document.getElementById("chooseUnlimitedExport").hidden = unlimited;
  document.getElementById("adGate").hidden = true;
  document.getElementById("unlockExports").hidden = true;
  document.getElementById("printOrder").hidden = true;
  document.getElementById("exportDialog").showModal();
}

function startAdGate() {
  let seconds = 30;
  const countdown = document.getElementById("adCountdown");
  const download = document.getElementById("completeAdExport");
  const email = document.getElementById("completeAdEmailExport");
  document.getElementById("exportChoices").hidden = true;
  document.getElementById("adGate").hidden = false;
  download.disabled = true;
  email.disabled = true;
  countdown.textContent = `Download unlocks in ${seconds} seconds`;
  clearInterval(adCountdownTimer);
  adCountdownTimer = setInterval(() => {
    seconds -= 1;
    countdown.textContent = seconds > 0 ? `Download unlocks in ${seconds} seconds` : "Your STL is ready";
    if (seconds <= 0) {
      clearInterval(adCountdownTimer);
      download.disabled = false;
      email.disabled = false;
    }
  }, 1000);
}

async function showPrintOrder() {
  const metrics = trayMetrics(pendingExportConfig);
  document.getElementById("exportChoices").hidden = true;
  document.getElementById("unlockExports").hidden = true;
  document.getElementById("printOrder").hidden = false;
  const outputMode = normalizeTrayOutputMode(pendingExportConfig);
  const outputLabel = outputMode === "bases-only" ? "Bases only" : outputMode === "tray-and-bases" ? "Tray + bases" : "Tray only";
  document.getElementById("printOrderSummary").innerHTML = pendingExportConfig.mode === storageInsertMode ? `
    <div><dt>Insert</dt><dd>${escapeHtml(pendingExportConfig.boxName)}</dd></div>
    <div><dt>Slots</dt><dd>${metrics.slots.length}${metrics.unplaced ? ` placed, ${metrics.unplaced} overflow` : ""}</dd></div>
    <div><dt>Footprint</dt><dd>${metrics.assembledWidth.toFixed(1)} x ${metrics.assembledDepth.toFixed(1)} mm</dd></div>
    <div><dt>Print plates</dt><dd>${metrics.plateCount}</dd></div>
  ` : `
    <div><dt>Output</dt><dd>${outputLabel}</dd></div>
    <div><dt>Formation</dt><dd>${pendingExportConfig.columns} x ${pendingExportConfig.rows}</dd></div>
    <div><dt>Base</dt><dd>${pendingExportConfig.baseSize} x ${pendingExportConfig.baseDepth} mm</dd></div>
    <div><dt>Outer size</dt><dd>${metrics.outerWidth.toFixed(1)} x ${metrics.outerDepth.toFixed(1)} mm</dd></div>
  `;
  await configureStripeCheckout();
}

function showUnlockExports() {
  document.getElementById("exportChoices").hidden = true;
  document.getElementById("printOrder").hidden = true;
  document.getElementById("unlockExports").hidden = false;
  configureUnlockCheckout();
}

function checkoutApiBase() {
  return document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "");
}

function checkoutApiUrl(path) {
  return `${checkoutApiBase()}${path}`;
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

async function configureStripeCheckout() {
  const button = document.getElementById("stripeCheckoutButton");
  const status = document.getElementById("stripeCheckoutStatus");
  const quotesContainer = document.getElementById("providerQuotes");
  button.disabled = true;
  selectedMarketplaceQuoteId = "";
  marketplaceQuotes = [];
  quotesContainer.innerHTML = `<div class="provider-empty">Checking available printers...</div>`;
  status.textContent = "Creating live printer quotes...";
  try {
    const [configResponse, quoteResponse] = await Promise.all([
      fetch(checkoutApiUrl("/api/checkout/config"), { headers: platformHeaders() }),
      authorizedFetch("/api/marketplace/quotes", {
        method: "POST",
        body: JSON.stringify({ config: pendingExportConfig, name: pendingExportPrefix || "Printed design" })
      })
    ]);
    if (!configResponse.ok || !quoteResponse.ok) throw new Error("Stripe checkout backend is not available.");
    const config = await configResponse.json();
    const result = await quoteResponse.json();
    marketplaceQuotes = result.quotes || [];
    populateProviderFilters();
    renderProviderQuotes();
    if (!config.enabled) throw new Error(config.reason || "Stripe is not configured.");
    status.textContent = marketplaceQuotes.length
      ? `${marketplaceQuotes.length} printer option${marketplaceQuotes.length === 1 ? "" : "s"} available. Select one to continue in ${config.mode === "test" ? "Stripe test mode" : "Stripe live mode"}.`
      : result.message || "No matching printers are available yet.";
  } catch (error) {
    quotesContainer.innerHTML = `<div class="provider-empty">${escapeHtml(error.message)}</div>`;
    status.textContent = `${error.message} Deploy a secure Node checkout backend and set checkout-api-url when using GitHub Pages.`;
  }
}

function populateProviderFilters() {
  const colour = document.getElementById("providerColourFilter");
  const current = colour.value;
  const options = [...new Map(marketplaceQuotes.map((quote) => [quote.colourKey, quote])).values()];
  colour.innerHTML = `<option value="">All colours</option>${options.map((quote) => `<option value="${escapeHtml(quote.colourKey)}">${escapeHtml(quote.colourName)}</option>`).join("")}`;
  colour.value = options.some((quote) => quote.colourKey === current) ? current : "";
}

function filteredProviderQuotes() {
  const colour = document.getElementById("providerColourFilter").value;
  const maximumLead = Number(document.getElementById("providerLeadFilter").value || 0);
  const minimumRating = Number(document.getElementById("providerRatingFilter").value || 0);
  return marketplaceQuotes.filter((quote) => (
    (!colour || quote.colourKey === colour)
    && (!maximumLead || quote.leadTimeDays <= maximumLead)
    && (!minimumRating || quote.ratingAverage >= minimumRating)
  ));
}

function renderProviderQuotes() {
  const quotes = filteredProviderQuotes();
  const container = document.getElementById("providerQuotes");
  container.innerHTML = quotes.length ? quotes.map((quote) => `
    <article class="provider-quote ${quote.id === selectedMarketplaceQuoteId ? "selected" : ""}">
      <span class="provider-colour" style="background:${escapeHtml(quote.colourHex || "#c8c8c8")}"></span>
      <span class="provider-main">
        <strong>${escapeHtml(quote.providerName)}</strong>
        <small>${escapeHtml(quote.basedIn)} · ${quote.ratingCount ? `${quote.ratingAverage.toFixed(1)} / 5 from ${quote.ratingCount}` : "New provider"} · ${quote.leadTimeDays} day lead time${quote.estimatedPrintHours ? ` · ${window.forgetPrintEstimates.printTimeLabel(quote.estimatedPrintHours)} print` : ""}</small>
        ${quote.providerStatus === "pending_review" ? `<em>Prototype provider · platform review pending</em>` : ""}
      </span>
      <span class="provider-price"><strong>${formatMoney(quote.totalIncVatPence, quote.currency)}</strong><small>all in</small></span>
      <details>
        <summary>Price breakdown</summary>
        <span>Material (${quote.estimatedWeightGrams}g) ${formatMoney(quote.materialCostPence, quote.currency)}</span>
        <span>Printer fee ${formatMoney(quote.printerFeePence, quote.currency)}</span>
        <span>Postage ${formatMoney(quote.postagePence, quote.currency)}</span>
        <span>Forget About commission ${formatMoney(quote.commissionPence, quote.currency)}</span>
        <span>Platform fee ${formatMoney(quote.platformFeePence, quote.currency)}</span>
        <span>VAT ${formatMoney(quote.vatAmountPence, quote.currency)}</span>
      </details>
      <button type="button" data-provider-quote="${escapeHtml(quote.id)}">${quote.id === selectedMarketplaceQuoteId ? "Selected" : "Select printer"}</button>
    </article>
  `).join("") : `<div class="provider-empty">No printers match these filters.</div>`;
  document.getElementById("stripeCheckoutButton").disabled = !selectedMarketplaceQuoteId;
}

async function beginStripeCheckout() {
  const button = document.getElementById("stripeCheckoutButton");
  const status = document.getElementById("stripeCheckoutStatus");
  button.disabled = true;
  status.textContent = "Creating secure Stripe Checkout...";
  try {
    if (!selectedMarketplaceQuoteId) throw new Error("Select a printer before continuing.");
    const response = await authorizedFetch("/api/marketplace/checkout/session", {
      method: "POST",
      body: JSON.stringify({ quoteId: selectedMarketplaceQuoteId })
    });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || "Stripe Checkout could not be created.");
    window.location.assign(result.url);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function configureUnlockCheckout() {
  const button = document.getElementById("unlockCheckoutButton");
  const status = document.getElementById("unlockCheckoutStatus");
  button.disabled = true;
  status.textContent = "Checking Stripe configuration...";
  try {
    const response = await fetch(checkoutApiUrl("/api/checkout/config"), { headers: platformHeaders() });
    if (!response.ok) throw new Error("Stripe checkout backend is not available.");
    const config = await response.json();
    document.getElementById("unlockExportsPrice").textContent = formatMoney(config.unlimitedExportsPrice, config.currency);
    if (!config.enabled) throw new Error(config.reason || "Stripe is not configured.");
    button.disabled = false;
    status.textContent = `${config.mode === "test" ? "Stripe test mode" : "Stripe live mode"} - one payment unlocks your account.`;
  } catch (error) {
    status.textContent = `${error.message} Open the checkout-enabled version of the site to purchase.`;
  }
}

async function beginUnlockCheckout() {
  const button = document.getElementById("unlockCheckoutButton");
  const status = document.getElementById("unlockCheckoutStatus");
  button.disabled = true;
  status.textContent = "Creating secure Stripe Checkout...";
  try {
    const response = await authorizedFetch("/api/checkout/unlock/session", {
      method: "POST",
      body: "{}"
    });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || "Stripe Checkout could not be created.");
    window.location.assign(result.url);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function verifyUnlockPurchase(sessionId) {
  try {
    const response = await authorizedFetch("/api/checkout/unlock/verify", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
    const result = await response.json();
    if (!response.ok || !result.unlocked) throw new Error(result.error || "Stripe could not confirm the purchase.");
    unlimitedExportsVerified = true;
    accountExportState.unlimitedExports = true;
    showToast("Unlimited STL exports unlocked on your account.");
  } catch (error) {
    showToast(error.message);
  } finally {
    history.replaceState({}, "", window.location.pathname);
  }
}

async function verifyPrintPurchase(sessionId) {
  try {
    const response = await authorizedFetch("/api/checkout/print/verify", { method: "POST", body: JSON.stringify({ sessionId }) });
    const result = await response.json();
    if (!response.ok || !result.paid) throw new Error(result.error || "Print payment could not be confirmed.");
    showToast("Print order confirmed and sent to the factory.");
  } catch (error) {
    showToast(error.message);
  }
}

function localPresets() {
  try {
    return JSON.parse(localStorage.getItem("movement-tray-presets")) || [];
  } catch {
    return [];
  }
}

function presets() {
  return accountService.isSignedIn() ? cloudPresets : localPresets();
}

async function persistPreset(name, config, clientRef = `${Date.now()}`) {
  if (!accountService.isSignedIn()) {
    const saved = localPresets();
    saved.unshift({ id: clientRef, name, state: config });
    localStorage.setItem("movement-tray-presets", JSON.stringify(saved.slice(0, 12)));
    return;
  }
  await accountService.upsertDesign({ client_ref: clientRef, name, generator_version: 1, parameters: config });
  await refreshCloudData();
}

async function savePreset() {
  try {
    const suggested = `${state.columns} × ${state.rows} · ${state.baseSize}mm`;
    const name = window.prompt("Name this saved preset", suggested)?.trim();
    if (!name) return;
    await persistPreset(name, { ...state });
    renderPresets();
    showToast(`${name} preset saved`);
  } catch (error) {
    showToast(error.message);
  }
}

function renderPresets() {
  const container = document.getElementById("presets");
  const saved = presets();
  if (!saved.length) {
    container.innerHTML = `<div class="empty-presets">Your saved tray configurations will appear here.</div>`;
    return;
  }
  container.innerHTML = saved.map((preset) => {
    const metric = trayMetrics(preset.state);
    return `
      <article class="preset-card">
        <div><h3>${preset.name}</h3><p>${metric.outerWidth.toFixed(1)} × ${metric.outerDepth.toFixed(1)} mm · ${preset.state.lipEnabled ? "lipped" : "flat"}</p></div>
        <div class="preset-actions">
          <button type="button" data-load="${preset.id}">Load</button>
          <button type="button" data-delete="${preset.id}">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

const baseCatalogue = window.baseCatalogue || [];
const warhammer40000Catalogue = [
  ["Adeptus Astartes", "Intercessor Squad", 32, 32, "circle"],
  ["Adeptus Astartes", "Tactical Squad", 32, 32, "circle"],
  ["Adeptus Astartes", "Terminator Squad", 40, 40, "circle"],
  ["Adeptus Astartes", "Jump Pack Intercessors", 32, 32, "circle"],
  ["Adeptus Astartes", "Outriders", 90, 52, "oval"],
  ["Adeptus Astartes", "Redemptor Dreadnought", 90, 90, "circle"],
  ["Astra Militarum", "Infantry Squad", 25, 25, "circle"],
  ["Astra Militarum", "Heavy Weapons Squad", 60, 60, "circle"],
  ["Astra Militarum", "Sentinel", 80, 80, "circle"],
  ["Tyranids", "Termagants", 28.5, 28.5, "circle"],
  ["Tyranids", "Hormagaunts", 28.5, 28.5, "circle"],
  ["Tyranids", "Genestealers", 32, 32, "circle"],
  ["Tyranids", "Tyranid Warriors", 50, 50, "circle"],
  ["Tyranids", "Carnifex", 105, 70, "oval"],
  ["Orks", "Boyz", 32, 32, "circle"],
  ["Orks", "Gretchin", 25, 25, "circle"],
  ["Orks", "Nobz", 32, 32, "circle"],
  ["Orks", "Deff Dread", 60, 60, "circle"],
  ["Aeldari", "Guardian Defenders", 28.5, 28.5, "circle"],
  ["Aeldari", "Wraithguard", 40, 40, "circle"],
  ["Aeldari", "Wraithlord", 60, 60, "circle"],
  ["Chaos Space Marines", "Legionaries", 32, 32, "circle"],
  ["Chaos Space Marines", "Raptors", 32, 32, "circle"],
  ["Chaos Space Marines", "Chaos Terminator Squad", 40, 40, "circle"]
].map(([army, name, width, depth, baseShape]) => ({
  id: `warhammer-40000-${normalizeText(`${army}-${name}`).replace(/\s+/g, "-")}`,
  gameSystem: "Warhammer 40,000",
  army,
  name,
  width,
  depth,
  baseShape,
  aliases: [normalizeText(name)]
}));

const ageOfSigmarCatalogue = [
  ["Stormcast Eternals", "Liberators", 40, 40, "circle"],
  ["Stormcast Eternals", "Vindictors", 40, 40, "circle"],
  ["Stormcast Eternals", "Sequitors", 40, 40, "circle"],
  ["Stormcast Eternals", "Prosecutors", 40, 40, "circle"],
  ["Stormcast Eternals", "Vanguard-Palladors", 90, 52, "oval"],
  ["Cities of Sigmar", "Freeguild Steelhelms", 25, 25, "circle"],
  ["Cities of Sigmar", "Freeguild Fusiliers", 28.5, 28.5, "circle"],
  ["Cities of Sigmar", "Freeguild Cavaliers", 75, 42, "oval"],
  ["Soulblight Gravelords", "Deathrattle Skeletons", 25, 25, "circle"],
  ["Soulblight Gravelords", "Deadwalker Zombies", 25, 25, "circle"],
  ["Soulblight Gravelords", "Blood Knights", 75, 42, "oval"],
  ["Nighthaunt", "Chainrasps", 25, 25, "circle"],
  ["Nighthaunt", "Grimghast Reapers", 32, 32, "circle"],
  ["Nighthaunt", "Spirit Hosts", 50, 50, "circle"],
  ["Orruk Warclans", "Ardboyz", 32, 32, "circle"],
  ["Orruk Warclans", "Gore-gruntas", 90, 52, "oval"],
  ["Gloomspite Gitz", "Stabbas", 25, 25, "circle"],
  ["Gloomspite Gitz", "Squig Herd", 25, 25, "circle"],
  ["Seraphon", "Saurus Warriors", 32, 32, "circle"],
  ["Seraphon", "Aggradon Lancers", 75, 42, "oval"],
  ["Slaves to Darkness", "Chaos Warriors", 32, 32, "circle"],
  ["Slaves to Darkness", "Chaos Knights", 75, 42, "oval"],
  ["Skaven", "Clanrats", 25, 25, "circle"],
  ["Skaven", "Stormfiends", 60, 60, "circle"]
].map(([army, name, width, depth, baseShape]) => ({
  id: `age-of-sigmar-${normalizeText(`${army}-${name}`).replace(/\s+/g, "-")}`,
  gameSystem: "Warhammer Age of Sigmar",
  army,
  name,
  width,
  depth,
  baseShape,
  aliases: [normalizeText(name)]
}));

function normaliseCatalogueEntry(entry, fallbackSystem) {
  return {
    ...entry,
    gameSystem: entry.gameSystem || fallbackSystem,
    baseShape: normalizeStorageBaseShape(entry.baseShape, entry.width, entry.depth)
  };
}

function customCatalogue() {
  try {
    return JSON.parse(localStorage.getItem("movement-tray-custom-catalogue")) || [];
  } catch {
    return [];
  }
}

function allCatalogueEntries() {
  const learned = Object.entries(learnedBases()).map(([key, entry]) => ({
    id: `learned-${key}`,
    army: "Learned bases",
    gameSystem: "Learned bases",
    name: entry.name,
    width: entry.width,
    depth: entry.depth,
    baseShape: normalizeStorageBaseShape(entry.baseShape, entry.width, entry.depth),
    aliases: [key]
  }));
  const entries = [
    ...baseCatalogue.map((entry) => normaliseCatalogueEntry(entry, "Warhammer: The Old World")),
    ...warhammer40000Catalogue,
    ...ageOfSigmarCatalogue,
    ...customCatalogue().map((entry) => normaliseCatalogueEntry(entry, "Custom")),
    ...learned
  ];
  return entries.filter((entry, index) => entries.findIndex((candidate) => (
    normalizeText(candidate.gameSystem || "") === normalizeText(entry.gameSystem || "")
    && normalizeText(candidate.army || "") === normalizeText(entry.army || "")
    && normalizeText(candidate.name) === normalizeText(entry.name)
  )) === index);
}

function localArmyProjects() {
  try {
    return JSON.parse(localStorage.getItem("movement-tray-army-projects")) || [];
  } catch {
    return [];
  }
}

function armyProjects() {
  return accountService.isSignedIn() ? cloudArmyProjects : localArmyProjects();
}

function addCatalogueRecommendation(entry, count) {
  if (catalogueContext === "storage") {
    addStorageRecommendation(entry, count);
    return;
  }
  const formation = recommendFormation(count);
  const id = `manual-${entry.id}-${Date.now()}`;
  const baseShape = normalizeStorageBaseShape(entry.baseShape, entry.width, entry.depth);
  armyRecommendations.push({
    id,
    name: entry.name,
    count,
    copies: 1,
    columns: formation.columns,
    rows: formation.rows,
    baseSize: entry.width,
    baseDepth: shapeLocksDepth(baseShape) ? entry.width : entry.depth,
    baseShape,
    matched: true
  });
  activeArmyRecommendationId = id;
  armyEditingId = "";
  renderArmyRecommendations();
  showToast(`${entry.name} added to this army`);
}

function addStorageRecommendation(entry, count) {
  const formation = recommendFormation(count);
  const id = `storage-${entry.id}-${Date.now()}`;
  const baseShape = normalizeStorageBaseShape(entry.baseShape, entry.width, entry.depth);
  storageRecommendations.push({
    id,
    name: entry.name,
    count,
    copies: 1,
    columns: formation.columns,
    rows: formation.rows,
    baseSize: entry.width,
    baseDepth: shapeLocksDepth(baseShape) ? entry.width : entry.depth,
    baseShape,
    matched: true
  });
  renderStorageRecommendations();
  showToast(`${entry.name} added to this box insert`);
}

function catalogueArmies() {
  return [...new Set(allCatalogueEntries().map((entry) => entry.army || "Other"))].sort();
}

function catalogueSystems() {
  return [...new Set(allCatalogueEntries().map((entry) => entry.gameSystem || "Other"))].sort();
}

function prepareCatalogue(context) {
  catalogueContext = context;
  const systemFilter = document.getElementById("catalogueSystemFilter");
  const filter = document.getElementById("catalogueArmyFilter");
  const currentSystem = systemFilter.value;
  const current = filter.value;
  systemFilter.innerHTML = `<option value="">All systems</option>${catalogueSystems().map((system) => `<option value="${escapeHtml(system)}">${escapeHtml(system)}</option>`).join("")}`;
  systemFilter.value = [...systemFilter.options].some((option) => option.value === currentSystem) ? currentSystem : "";
  filter.innerHTML = `<option value="">All armies</option>${catalogueArmies().map((army) => `<option value="${escapeHtml(army)}">${escapeHtml(army)}</option>`).join("")}`;
  filter.value = [...filter.options].some((option) => option.value === current) ? current : "";
  document.getElementById("customUnitCountField").hidden = context === "single";
  document.getElementById("customUnitSubmit").textContent = context === "single" ? "Use this base" : context === "storage" ? "Add to insert" : "Add tray tab";
  renderCatalogue();
  document.getElementById("catalogueDialog").showModal();
}

function applyCatalogueEntry(entry, count = 10) {
  if (catalogueContext === "single") {
    const baseShape = normalizeStorageBaseShape(entry.baseShape, entry.width, entry.depth);
    writeState({
      ...state,
      baseSize: entry.width,
      baseDepth: shapeLocksDepth(baseShape) ? entry.width : entry.depth,
      baseShape
    });
    document.getElementById("catalogueDialog").close();
    showToast(`${entry.name} base applied`);
    return;
  }
  if (catalogueContext === "storage") {
    addStorageRecommendation(entry, count);
    return;
  }
  addCatalogueRecommendation(entry, count);
}

function renderCatalogue() {
  const query = normalizeText(document.getElementById("catalogueSearch").value);
  const system = document.getElementById("catalogueSystemFilter").value;
  const army = document.getElementById("catalogueArmyFilter").value;
  const entries = allCatalogueEntries().filter((entry) => (
    (!system || entry.gameSystem === system)
    && (!army || entry.army === army)
    && (!query || normalizeText(`${entry.name} ${entry.army || ""} ${entry.gameSystem || ""}`).includes(query))
  ));
  document.getElementById("catalogueList").innerHTML = entries.map((entry) => `
    <article class="catalogue-entry ${catalogueContext === "single" ? "single-catalogue-entry" : ""}" data-catalogue-id="${escapeHtml(entry.id)}">
      <div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.army || "Other")} - ${entry.width} x ${entry.depth} mm</small><span class="catalogue-system">${escapeHtml(entry.gameSystem || "Other")}</span></div>
      ${catalogueContext === "single" ? "" : `<input type="number" min="2" max="500" value="10" aria-label="Model count for ${escapeHtml(entry.name)}">`}
      <button type="button">${catalogueContext === "single" ? "Use base" : "Add"}</button>
    </article>
  `).join("") || `<div class="dialog-empty">No matching catalogue entries.</div>`;
}

async function saveArmyProject() {
  if (!armyRecommendations.length) {
    showToast("Add or parse some trays before saving");
    return;
  }
  const saved = armyProjects();
  const name = document.getElementById("armyProjectName").value.trim() || `Army project ${saved.length + 1}`;
  const existing = saved.findIndex((project) => project.name.toLowerCase() === name.toLowerCase());
  const project = {
    id: existing >= 0 ? saved[existing].id : `${Date.now()}`,
    name,
    listText: document.getElementById("armyList").value,
    recommendations: structuredClone(armyRecommendations)
  };
  try {
    if (accountService.isSignedIn()) {
      const clientRef = existing >= 0 ? saved[existing].clientRef : project.id;
      await accountService.upsertProject({
        client_ref: clientRef,
        name,
        project_type: "army_list",
        source_text: project.listText,
        items: project.recommendations
      });
      await refreshCloudData();
    } else {
      if (existing >= 0) saved.splice(existing, 1);
      saved.unshift(project);
      localStorage.setItem("movement-tray-army-projects", JSON.stringify(saved.slice(0, 20)));
    }
    document.getElementById("armyProjectName").value = name;
    showToast(`${name} saved`);
  } catch (error) {
    showToast(error.message);
  }
}

function renderSavedArmies() {
  const saved = armyProjects();
  document.getElementById("savedArmiesList").innerHTML = saved.length ? saved.map((project) => `
    <article data-army-project="${project.id}">
      <div><strong>${escapeHtml(project.name)}</strong><small>${project.recommendations.length} tray types</small></div>
      <button type="button" data-project-action="load">Load</button>
      <button type="button" data-project-action="delete">Delete</button>
    </article>
  `).join("") : `<div class="dialog-empty">No saved army projects yet.</div>`;
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function recommendFormation(count) {
  let best = { columns: Math.min(count, 12), rows: 1, score: Infinity };
  for (let columns = 1; columns <= 12; columns += 1) {
    for (let rows = 1; rows <= 12; rows += 1) {
      const capacity = columns * rows;
      if (capacity < count || columns < rows) continue;
      const empty = capacity - count;
      const ratio = columns / rows;
      const score = empty * 20 + Math.abs(ratio - 1.25) * 2 + (rows === 1 ? 8 : 0) + Math.abs(columns - 5) * 0.15;
      if (score < best.score) best = { columns, rows, score };
    }
  }
  return { columns: best.columns, rows: best.rows };
}

function quantityFromLine(line, alias = "") {
  const normalized = normalizeText(line);
  const leading = normalized.match(/^(\d{1,3})\s*x?\s+/);
  if (!alias) return leading ? Number(leading[1]) : 0;
  const aliasIndex = alias ? normalized.indexOf(alias) : normalized.length;
  const beforeAlias = normalized.slice(0, Math.max(0, aliasIndex));
  const beforeMatches = [...beforeAlias.matchAll(/\b(\d{1,3})\s*x?\b/g)];
  if (beforeMatches.length) return Number(beforeMatches.at(-1)[1]);
  const rawAliasIndex = line.toLowerCase().indexOf(alias);
  const afterAlias = rawAliasIndex >= 0 ? line.slice(rawAliasIndex + alias.length) : "";
  const afterPatterns = [
    /^\s*(?:x|:|-)?\s*[\[(]\s*(\d{1,3})\s*[\])]/i,
    /^\s*(?:x|:|-)\s*(\d{1,3})\b/i,
    /^\s+(\d{1,3})\s*(?:models?|strong)?\b/i,
    /\b(?:models?|unit size|quantity|qty)\s*[:x-]?\s*(\d{1,3})\b/i
  ];
  for (const pattern of afterPatterns) {
    const match = afterAlias.match(pattern);
    if (match) {
      const remainder = afterAlias.slice(match[0].length);
      if (/^\s*(?:pts?|points?)\b/i.test(remainder)) continue;
      return Number(match[1]);
    }
  }
  return leading ? Number(leading[1]) : 0;
}

function unknownNameFromLine(line) {
  return line
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^\d{1,3}\s*[xX]?\s+/, "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
    .replace(/\s+[-:]\s+\d+\s*(pts?|points?).*$/i, "")
    .replace(/\s+\d+\s*(pts?|points?).*$/i, "")
    .trim();
}

function firstPlausibleQuantity(line) {
  const withoutPoints = line
    .replace(/\b\d[\d,]*\s*(?:pts?|points?)\b/gi, "")
    .replace(/\[\s*\d[\d,]*\s*(?:pts?|points?)?[^\]]*\]/gi, "");
  const patterns = [
    /^\s*[+\-*•]?\s*(\d{1,3})\s*x?\s+/i,
    /[\[(]\s*(\d{1,3})\s*[\])]/,
    /\b(?:models?|unit size|quantity|qty)\s*[:x-]?\s*(\d{1,3})\b/i,
    /\s[-:]\s*(\d{1,3})\s*$/
  ];
  for (const pattern of patterns) {
    const match = withoutPoints.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
}

function learnedBases() {
  try {
    return JSON.parse(localStorage.getItem("movement-tray-unit-bases")) || {};
  } catch {
    return {};
  }
}

function rememberUnitBase(recommendation) {
  if (recommendation.baseSize <= 0 || recommendation.baseDepth <= 0) return;
  const learned = learnedBases();
  learned[normalizeText(recommendation.name)] = {
    name: recommendation.name,
    width: recommendation.baseSize,
    depth: recommendation.baseDepth,
    baseShape: normalizeStorageBaseShape(recommendation.baseShape, recommendation.baseSize, recommendation.baseDepth)
  };
  localStorage.setItem("movement-tray-unit-bases", JSON.stringify(learned));
}

function parseArmyList(text) {
  const found = new Map();
  const learned = learnedBases();
  const ignoredNames = new Set(["points", "models", "core", "special", "rare", "characters", "lords", "heroes", "total"]);
  let lines = 0;
  let candidates = 0;
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (/^[-•]\s+/.test(line)) return;
    lines += 1;
    const normalized = normalizeText(line);
    const matches = allCatalogueEntries()
      .flatMap((entry) => entry.aliases.map((alias) => ({ entry, alias })))
      .filter(({ alias }) => normalized.includes(alias))
      .sort((a, b) => b.alias.length - a.alias.length);
    const catalogueMatch = matches[0];
    const count = quantityFromLine(line, catalogueMatch?.alias) || firstPlausibleQuantity(line);
    if (count < 2 || count > 500) return;
    candidates += 1;

    const parsedName = catalogueMatch?.entry.name || unknownNameFromLine(line);
    const learnedMatch = learned[normalizeText(parsedName)];
    const name = learnedMatch?.name || parsedName;
    if (!name || ignoredNames.has(normalizeText(name)) || name.length > 70) return;
    const key = `${catalogueMatch?.entry.id || `unknown-${normalizeText(name)}`}-${count}`;
    if (found.has(key)) {
      found.get(key).copies += 1;
      return;
    }
    const formation = recommendFormation(count);
    const baseWidth = catalogueMatch?.entry.width || learnedMatch?.width || 0;
    const baseDepth = catalogueMatch?.entry.depth || learnedMatch?.depth || 0;
    const baseShape = normalizeStorageBaseShape(catalogueMatch?.entry.baseShape || learnedMatch?.baseShape, baseWidth, baseDepth);
    found.set(key, {
      id: key,
      name,
      count,
      copies: 1,
      columns: formation.columns,
      rows: formation.rows,
      baseSize: baseWidth,
      baseDepth: shapeLocksDepth(baseShape) ? baseWidth : baseDepth,
      baseShape,
      matched: Boolean(catalogueMatch || learnedMatch)
    });
  });
  armyParseReport = { lines, candidates };
  return [...found.values()];
}

function recommendationConfig(recommendation) {
  return {
    ...defaults,
    ...(recommendation.config || {}),
    columns: recommendation.columns,
    rows: recommendation.rows,
    baseSize: recommendation.baseSize,
    baseDepth: recommendation.baseDepth,
    baseShape: normalizeStorageBaseShape(recommendation.baseShape, recommendation.baseSize, recommendation.baseDepth),
    includeBases: Boolean(recommendation.includeBases ?? recommendation.config?.includeBases)
  };
}

async function saveRecommendation(recommendation) {
  const config = recommendationConfig(recommendation);
  try {
    const suggested = `${recommendation.name} - ${recommendation.columns} x ${recommendation.rows}`;
    const name = window.prompt("Name this saved preset", suggested)?.trim();
    if (!name) return;
    await persistPreset(name, config);
    renderPresets();
    showToast(`${recommendation.name} preset saved`);
  } catch (error) {
    showToast(error.message);
  }
}

function trayThumbnailSvg(config) {
  const columns = clamp(config.columns, 1, 12);
  const rows = clamp(config.rows, 1, 12);
  const width = 104;
  const depth = Math.max(34, Math.min(66, width * (rows * config.baseDepth) / (columns * config.baseSize)));
  const verticals = Array.from({ length: columns - 1 }, (_, index) => {
    const x = ((index + 1) / columns) * width;
    return `<line x1="${x}" y1="0" x2="${x}" y2="${depth}"/>`;
  }).join("");
  const horizontals = Array.from({ length: rows - 1 }, (_, index) => {
    const y = ((index + 1) / rows) * depth;
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`;
  }).join("");
  return `<svg class="tray-thumb" viewBox="0 0 150 88" aria-hidden="true"><g transform="translate(28 4) skewY(14) scale(1 .82)"><rect width="${width}" height="${depth}" rx="3"/><g>${verticals}${horizontals}</g></g></svg>`;
}

function storagePalette(index) {
  const colours = ["#5f7d4b", "#8a6846", "#4f7b6f", "#946a43", "#6f7f45", "#3f6652", "#7c7546", "#5c7446"];
  return colours[index % colours.length];
}

function drawStoragePreview(metrics, config) {
  const svg = document.getElementById("storagePreview");
  const pad = 24;
  const scale = Math.min((760 - pad * 2) / config.boxInternalLength, (420 - pad * 2) / config.boxInternalWidth);
  const x0 = (760 - config.boxInternalLength * scale) / 2;
  const y0 = (420 - config.boxInternalWidth * scale) / 2;
  const magnet = config.insertMagnetHoles ? config.magnetHoleDiameter : 0;
  const slotMarkup = metrics.slots.map((slot) => {
    const colour = storagePalette(slot.unitIndex);
    const cx = x0 + (slot.x + slot.w / 2) * scale;
    const cy = y0 + (slot.y + slot.d / 2) * scale;
    const shape = isRoundBaseShape(slot.baseShape)
      ? `<ellipse cx="${cx}" cy="${cy}" rx="${slot.w * scale / 2}" ry="${slot.d * scale / 2}" fill="${colour}" opacity=".25" stroke="${colour}" stroke-width="1.4"/>`
      : `<rect x="${x0 + slot.x * scale}" y="${y0 + slot.y * scale}" width="${slot.w * scale}" height="${slot.d * scale}" rx="3" fill="${colour}" opacity=".25" stroke="${colour}" stroke-width="1.4"/>`;
    return `
      <g>
        ${shape}
        ${magnet ? `<circle cx="${cx}" cy="${cy}" r="${Math.max(1.5, magnet * scale / 2)}" fill="#223426" opacity=".75"/>` : ""}
      </g>
    `;
  }).join("");
  const seamMarkup = metrics.split ? `
    <line x1="${x0 + config.boxInternalLength * scale / 2}" y1="${y0}" x2="${x0 + config.boxInternalLength * scale / 2}" y2="${y0 + config.boxInternalWidth * scale}" stroke="#2d4532" stroke-width="2" stroke-dasharray="8 6"/>
    <line x1="${x0}" y1="${y0 + config.boxInternalWidth * scale / 2}" x2="${x0 + config.boxInternalLength * scale}" y2="${y0 + config.boxInternalWidth * scale / 2}" stroke="#2d4532" stroke-width="2" stroke-dasharray="8 6"/>
  ` : "";
  svg.innerHTML = `
    <rect x="${x0}" y="${y0}" width="${config.boxInternalLength * scale}" height="${config.boxInternalWidth * scale}" rx="10" fill="#f8fbef" stroke="#5f7d4b" stroke-width="2"/>
    ${slotMarkup}
    ${seamMarkup}
    <text x="${x0 + 12}" y="${y0 + 22}" fill="#2d4532" font-size="13" font-weight="800">${escapeHtml(config.boxName)}</text>
    ${metrics.unplaced ? `<text x="${x0 + 12}" y="${y0 + 42}" fill="#8a3b2d" font-size="12" font-weight="800">${metrics.unplaced} slots overflow this box</text>` : ""}
  `;
}

function renderStorageRecommendations() {
  readStorageState();
  const config = storageInsertConfig();
  const metrics = storageInsertMetrics(config);
  const summary = document.getElementById("storageSummary");
  const container = document.getElementById("storageResults");
  document.getElementById("storageOuterSize").textContent = `${config.boxInternalLength.toFixed(0)} x ${config.boxInternalWidth.toFixed(0)} mm`;
  document.getElementById("storageSlotCount").textContent = `${metrics.slots.length}${metrics.unplaced ? ` / ${metrics.slots.length + metrics.unplaced}` : ""}`;
  document.getElementById("storagePlateCount").textContent = String(metrics.plateCount);
  document.getElementById("storageMaterialEstimate").textContent = `${window.forgetPrintEstimates.generatedWeightGrams(effectiveStoragePrintVolumeMm3(metrics.volume) / 1000, config.filamentMaterial, { uploaded: true }).toFixed(1)} g`;
  drawStoragePreview(metrics, config);
  if (!storageRecommendations.length) {
    summary.textContent = `${storageParseReport.lines} lines checked - no units yet`;
    container.innerHTML = `<div class="empty-army">Paste a list or add a unit from the catalogue to begin the insert.</div>`;
    return;
  }
  const unknown = storageRecommendations.filter((item) => !item.matched).length;
  const validation = storageValidationMessages(config, metrics);
  summary.textContent = `${metrics.slots.length} slots placed${unknown ? ` - ${unknown} need bases` : ""}${validation.length ? ` - ${validation.join(" - ")}` : ""}`;
  container.innerHTML = storageRecommendations.map((item, index) => {
    item.baseShape = normalizeStorageBaseShape(item.baseShape, item.baseSize, item.baseDepth);
    if (shapeLocksDepth(item.baseShape)) item.baseDepth = item.baseSize;
    const ready = item.baseSize > 0 && item.baseDepth > 0;
    const shapeOptions = storageBaseShapes.map((shape) => `<option value="${shape}" ${shape === item.baseShape ? "selected" : ""}>${storageShapeLabel(shape)}</option>`).join("");
    const depthLocked = shapeLocksDepth(item.baseShape);
    return `
      <article class="storage-unit ${ready ? "" : "needs-base"}" data-storage-unit="${escapeHtml(item.id)}">
        <div><strong>${escapeHtml(item.name)}</strong><small>${item.count} models${item.copies > 1 ? ` x ${item.copies}` : ""} ${ready ? `- ${storageShapeLabel(item.baseShape)} ${item.baseSize} x ${item.baseDepth} mm` : "- set base size"}</small></div>
        <label>Models<input data-storage-field="count" type="number" min="1" max="500" value="${item.count}"></label>
        <label>Copies<input data-storage-field="copies" type="number" min="1" max="40" value="${item.copies || 1}"></label>
        <label>Shape<select data-storage-field="baseShape">${shapeOptions}</select></label>
        <label>${item.baseShape === "circle" ? "Diameter" : "Base W"}<input data-storage-field="baseSize" type="number" min="10" max="180" value="${item.baseSize || ""}"></label>
        <label>${depthLocked ? "Auto D" : item.baseShape === "oval" ? "Oval D" : "Base D"}<input data-storage-field="baseDepth" type="number" min="10" max="180" value="${item.baseDepth || ""}" ${depthLocked ? "disabled" : ""}></label>
        <div class="storage-unit-actions">
          <button type="button" data-storage-move="-1" ${index === 0 ? "disabled" : ""}>Up</button>
          <button type="button" data-storage-move="1" ${index === storageRecommendations.length - 1 ? "disabled" : ""}>Down</button>
          <button type="button" data-storage-remove="${escapeHtml(item.id)}">Remove</button>
        </div>
      </article>
    `;
  }).join("");
}

function analyzeStorageList() {
  const textarea = document.getElementById("storageArmyList");
  const text = textarea.value.trim();
  if (!text) {
    storageRecommendations = [];
    storageParseReport = { lines: 0, candidates: 0 };
    renderStorageRecommendations();
    showToast("Paste an army list first");
    textarea.focus();
    return;
  }
  storageRecommendations = parseArmyList(text).map((item) => ({ ...item, copies: item.copies || 1 }));
  storageParseReport = { ...armyParseReport };
  renderStorageRecommendations();
  showToast(storageRecommendations.length ? `${storageRecommendations.length} unit types ready for the insert` : "No units with quantities were recognised");
  document.querySelector(".storage-results-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
}

function restoreWorkspaceHome() {
  const workspace = document.querySelector(".workspace");
  const singleMode = document.getElementById("singleMode");
  const presetsSection = singleMode.querySelector(".presets-section");
  if (workspace.parentElement !== singleMode) singleMode.insertBefore(workspace, presetsSection);
}

function startArmyEdit(recommendation) {
  armyEditOriginalState = { ...state };
  armyEditingId = recommendation.id;
  writeState(recommendationConfig(recommendation));
  renderArmyRecommendations();
}

function exitArmyEdit(save, silent = false) {
  const recommendation = armyRecommendations.find((item) => item.id === armyEditingId);
  if (save && recommendation) {
    readState();
    recommendation.columns = state.columns;
    recommendation.rows = state.rows;
    recommendation.baseSize = state.baseSize;
    recommendation.baseDepth = state.baseDepth;
    recommendation.baseShape = state.baseShape;
    recommendation.config = { ...state };
    rememberUnitBase(recommendation);
  } else if (armyEditOriginalState) {
    writeState(armyEditOriginalState);
  }
  armyEditingId = "";
  armyEditOriginalState = null;
  restoreWorkspaceHome();
  renderArmyRecommendations();
  if (!silent) showToast(save ? "Tray changes saved to this army" : "Returned without changing the tray");
}

function renderArmyRecommendations() {
  const container = document.getElementById("armyResults");
  const summary = document.getElementById("armySummary");
  const tabs = document.getElementById("armyTrayTabs");
  if (!armyEditingId) restoreWorkspaceHome();
  if (!armyRecommendations.length) {
    tabs.hidden = true;
    tabs.innerHTML = "";
    summary.textContent = `${armyParseReport.lines} lines checked - no ranked units found`;
    container.innerHTML = `<div class="empty-army">No unit quantities were recognised. Keep each unit and its model count on one line, such as "16 White Lions of Chrace [242 pts]".</div>`;
    return;
  }
  if (!armyRecommendations.some((item) => item.id === activeArmyRecommendationId)) {
    activeArmyRecommendationId = armyRecommendations[0].id;
  }
  const recognised = armyRecommendations.filter((item) => item.matched).length;
  const unknown = armyRecommendations.length - recognised;
  summary.textContent = `${armyRecommendations.length} tray types - ${unknown} need base sizes`;
  tabs.hidden = false;
  tabs.innerHTML = armyRecommendations.map((item) => `
    <button type="button" class="${item.id === activeArmyRecommendationId ? "active" : ""}" data-army-tab="${escapeHtml(item.id)}">
      ${trayThumbnailSvg(recommendationConfig(item))}
      <span><strong>${escapeHtml(item.name)}</strong>
      <small>${item.columns} x ${item.rows}${item.copies > 1 ? ` - print ${item.copies}` : ""}</small></span>
    </button>
  `).join("");
  const item = armyRecommendations.find((recommendation) => recommendation.id === activeArmyRecommendationId);
  if (armyEditingId === item.id) {
    container.innerHTML = `
      <section class="army-edit-shell">
        <div class="army-edit-bar">
          <div><strong>Editing ${escapeHtml(item.name)}</strong><small>Changes stay inside this army project.</small></div>
          <button type="button" data-army-edit="back">Back</button>
          <button type="button" data-army-edit="save">Save tray</button>
        </div>
        <div id="armyEditMount"></div>
      </section>
    `;
    document.getElementById("armyEditMount").append(document.querySelector(".workspace"));
    return;
  }
  item.baseShape = normalizeStorageBaseShape(item.baseShape, item.baseSize, item.baseDepth);
  if (shapeLocksDepth(item.baseShape)) item.baseDepth = item.baseSize;
  const ready = item.baseSize > 0 && item.baseDepth > 0;
  const shapeOptions = storageBaseShapes.map((shape) => `<option value="${shape}" ${shape === item.baseShape ? "selected" : ""}>${storageShapeLabel(shape)}</option>`).join("");
  const depthLocked = shapeLocksDepth(item.baseShape);
  const capacity = item.columns * item.rows;
  const copyText = item.copies > 1 ? `${item.copies} identical units - print ${item.copies}` : `${item.count} models`;
  container.innerHTML = `
      <article class="army-unit" data-recommendation="${escapeHtml(item.id)}">
        <div class="army-unit-preview">${trayThumbnailSvg(recommendationConfig(item))}</div>
        <div class="army-unit-name">
          <h4>${escapeHtml(item.name)}</h4>
          <p>${copyText} - ${capacity} tray spaces${capacity > item.count ? ` (${capacity - item.count} spare)` : ""}</p>
          <span class="match-pill ${item.matched ? "" : "unknown"}">${item.matched ? "Base matched" : "Set base size"}</span>
        </div>
        <div class="army-unit-fields">
          <label class="army-mini-field">Columns<input data-army-field="columns" type="number" min="1" max="12" value="${item.columns}"></label>
          <label class="army-mini-field">Rows<input data-army-field="rows" type="number" min="1" max="12" value="${item.rows}"></label>
          <label class="army-mini-field">Shape<select data-army-field="baseShape">${shapeOptions}</select></label>
          <label class="army-mini-field">${item.baseShape === "circle" ? "Diameter" : "Base W"}<input data-army-field="baseSize" type="number" min="10" max="200" value="${item.baseSize || ""}" placeholder="mm"></label>
          <label class="army-mini-field">${depthLocked ? "Auto D" : item.baseShape === "oval" ? "Oval D" : "Base D"}<input data-army-field="baseDepth" type="number" min="10" max="200" value="${item.baseDepth || ""}" placeholder="mm" ${depthLocked ? "disabled" : ""}></label>
          <label class="army-mini-field army-bases-field">Print bases<input data-army-field="includeBases" type="checkbox" ${recommendationConfig(item).includeBases ? "checked" : ""}></label>
        </div>
        <div class="army-unit-actions">
          <button type="button" data-army-action="load" ${ready ? "" : "disabled"}>Edit tray</button>
          <button type="button" data-army-action="save" ${ready ? "" : "disabled"}>Save</button>
          <button type="button" data-army-action="export" ${ready ? "" : "disabled"}>Export STL</button>
        </div>
      </article>
    `;
}

function analyzeArmyList() {
  const textarea = document.getElementById("armyList");
  const text = textarea.value.trim();
  if (!text) {
    armyRecommendations = [];
    document.getElementById("armySummary").textContent = "Waiting for a list";
    document.getElementById("armyResults").innerHTML = `<div class="empty-army">Paste an army list above, then choose Suggest trays.</div>`;
    showToast("Paste an army list first");
    textarea.focus();
    return;
  }
  armyRecommendations = parseArmyList(text);
  activeArmyRecommendationId = armyRecommendations[0]?.id || "";
  renderArmyRecommendations();
  showToast(armyRecommendations.length ? `${armyRecommendations.length} tray suggestions ready` : "No units with quantities were recognised");
  document.querySelector(".army-results-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function switchMode(mode) {
  if (mode === "single" && armyEditingId) exitArmyEdit(false, true);
  document.body.dataset.activeMode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active);
  });
  document.querySelectorAll("[data-mode-panel]").forEach((panel) => {
    const active = panel.dataset.modePanel === mode;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  if (mode === "storage") renderStorageRecommendations();
}

function activeArmyRecommendation() {
  return armyRecommendations.find((recommendation) => recommendation.id === activeArmyRecommendationId);
}

async function saveFromHeader() {
  if (document.body.dataset.activeMode === "storage") {
    const config = storageInsertConfig();
    if (!config.insertUnits.length) return showToast("Add units to the insert before saving");
    const suggested = `${config.boxName} insert`;
    const name = window.prompt("Name this saved insert", suggested)?.trim();
    if (!name) return;
    await persistPreset(name, config);
    renderPresets();
    return showToast(`${name} saved`);
  }
  if (document.body.dataset.activeMode !== "army") return savePreset();
  const recommendation = activeArmyRecommendation();
  if (!recommendation || recommendation.baseSize <= 0 || recommendation.baseDepth <= 0) return showToast("Select a tray with a confirmed base size first");
  if (armyEditingId === recommendation.id) {
    readState();
    const suggested = `${recommendation.name} - ${state.columns} x ${state.rows}`;
    const name = window.prompt("Name this saved preset", suggested)?.trim();
    if (!name) return;
    await persistPreset(name, { ...state });
    renderPresets();
    return showToast(`${recommendation.name} preset saved`);
  }
  return saveRecommendation(recommendation);
}

function exportFromHeader() {
  if (document.body.dataset.activeMode === "storage") {
    const config = storageInsertConfig();
    if (!config.insertUnits.length) return showToast("Add units to the insert before exporting");
    return requestExport(config, `${config.boxName} insert`);
  }
  if (document.body.dataset.activeMode !== "army") return requestExport();
  const recommendation = activeArmyRecommendation();
  if (!recommendation || recommendation.baseSize <= 0 || recommendation.baseDepth <= 0) return showToast("Select a tray with a confirmed base size first");
  return requestExport(armyEditingId === recommendation.id ? { ...state } : recommendationConfig(recommendation), recommendation.name);
}

async function refreshCloudData() {
  if (!accountService.isSignedIn()) return;
  const [trays, armies] = await Promise.all([accountService.loadDesigns(), accountService.loadProjects()]);
  cloudPresets = trays.map((tray) => ({
    id: tray.id,
    clientRef: tray.client_ref,
    name: tray.name,
    state: tray.parameters
  }));
  cloudArmyProjects = armies.map((army) => ({
    id: army.id,
    clientRef: army.client_ref,
    name: army.name,
    listText: army.source_text,
    recommendations: army.items
  }));
  renderPresets();
  renderSavedArmies();
}

function setAuthenticated(authenticated) {
  document.getElementById("authGate").classList.toggle("hidden", authenticated);
  document.body.classList.toggle("authenticated", authenticated);
  document.getElementById("accountMenuEmail").textContent = accountService.currentUser()?.email || "Workshop account";
  document.getElementById("accountMenu").hidden = true;
  document.getElementById("accountButton").setAttribute("aria-expanded", "false");
  if (!authenticated) {
    document.getElementById("loginForm").reset();
    document.getElementById("loginError").textContent = "";
    setTimeout(() => document.getElementById("loginUsername").focus(), 50);
  }
}

async function loadAccountDialog(view = "profile") {
  try {
    const [profile, orders] = await Promise.all([accountService.loadProfile(), accountService.loadOrders()]);
    accountOrders = orders;
    const address = profile?.default_address || {};
    document.getElementById("accountEmail").value = accountService.currentUser()?.email || "";
    document.getElementById("accountDisplayName").value = profile?.display_name || "";
    document.getElementById("accountAddressLine1").value = address.line1 || "";
    document.getElementById("accountAddressLine2").value = address.line2 || "";
    document.getElementById("accountCity").value = address.city || "";
    document.getElementById("accountCounty").value = address.county || "";
    document.getElementById("accountPostcode").value = address.postcode || "";
    document.getElementById("accountCountry").value = address.country || "GB";
    document.getElementById("accountMarketingConsent").checked = Boolean(profile?.marketing_consent);
    document.getElementById("accountOrdersList").innerHTML = orders.length ? orders.map((order) => `
      <article class="account-order">
        <div><strong>${escapeHtml(order.invoice_number || "Pending invoice")}</strong><small>${order.order_type === "unlimited_stl" ? "Unlimited STL exports" : "Printed design"} · ${escapeHtml(order.status)}</small></div>
        <b>${formatMoney(order.total_inc_vat, order.currency)}</b>
        <small>${new Date(order.paid_at || order.created_at).toLocaleDateString()}</small>
        <button type="button" data-order-detail="${escapeHtml(order.id)}">View details</button>
      </article>
    `).join("") : `<div class="dialog-empty">No purchases yet.</div>`;
    document.getElementById("accountOrderDetail").hidden = true;
    document.getElementById("accountDialog").showModal();
    setAccountPage(view);
  } catch (error) {
    showToast(error.message);
  }
}

function setAccountPage(view) {
  const page = ["profile", "password", "orders"].includes(view) ? view : "profile";
  document.querySelectorAll("[data-account-page]").forEach((section) => { section.hidden = section.dataset.accountPage !== page; });
  document.querySelectorAll("[data-account-page-button]").forEach((button) => button.classList.toggle("active", button.dataset.accountPageButton === page));
}

function orderEventTitle(event) {
  const type = event.event_type || "status";
  if (type === "provider_message") return "Message from printer";
  if (type === "customer_message") return "Message to printer";
  if (type === "decline") return "Declined and refunded";
  if (type === "auto_complete") return "Automatically completed";
  return String(event.to_status || "").replaceAll("_", " ");
}

function showOrderDetail(orderId) {
  const order = accountOrders.find((candidate) => candidate.id === orderId);
  if (!order) return;
  const job = Array.isArray(order.print_jobs) ? order.print_jobs[0] : order.print_jobs;
  const currentStatus = job?.status || order.status;
  const statuses = ["order_made", "producing", "posted", "complete"];
  const currentIndex = statuses.indexOf(currentStatus);
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const snapshot = Array.isArray(order.order_customer_snapshots) ? order.order_customer_snapshots[0] : order.order_customer_snapshots;
  const events = Array.isArray(job?.print_job_events) ? job.print_job_events : [];
  const statusTrack = job
    ? `<div class="order-status-track">${statuses.map((status, index) => `<span class="${index <= currentIndex ? "done" : ""}">${status.replace("_", " ")}</span>`).join("")}</div>`
    : `<p class="order-status-note">Order status: <strong>${escapeHtml(currentStatus.replaceAll("_", " "))}</strong></p>`;
  const detail = document.getElementById("accountOrderDetail");
  detail.innerHTML = `
    <h4>${escapeHtml(order.invoice_number || "Pending invoice")}</h4>
    ${statusTrack}
    <div class="order-detail-grid">
      <div><span>Status</span><strong>${escapeHtml(currentStatus)}</strong></div>
      <div><span>Total</span><strong>${formatMoney(order.total_inc_vat, order.currency)}</strong></div>
      <div><span>Ordered</span><strong>${new Date(order.paid_at || order.created_at).toLocaleString()}</strong></div>
      <div><span>Delivery postcode</span><strong>${escapeHtml(snapshot?.delivery_address?.postal_code || snapshot?.delivery_address?.postcode || "Not recorded")}</strong></div>
    </div>
    <div class="order-detail-items">
      ${items.length ? items.map((item) => `<p><strong>${escapeHtml(item.description || "Order item")}</strong><br><small>Quantity ${item.quantity || 1} · ${formatMoney(item.total_inc_vat || 0, order.currency)}</small></p>`).join("") : "<p>No line-item detail is available for this order.</p>"}
    </div>
    ${job && !["complete", "refunded", "cancelled"].includes(job.status) ? `<div class="order-message-form"><label>Message printer<textarea data-customer-job-message rows="3" placeholder="Ask a question or add order information before completion"></textarea></label><button class="button button-secondary" type="button" data-send-job-message="${escapeHtml(job.id)}">Send message</button></div>` : ""}
    ${events.length ? `<div class="order-events"><h5>Messages and status history</h5>${events.map((event) => `<p class="event-${escapeHtml(event.event_type || "status")}"><strong>${escapeHtml(orderEventTitle(event))}</strong><span>${escapeHtml(event.note || "")}</span><small>${new Date(event.created_at).toLocaleString()}</small></p>`).join("")}</div>` : ""}
    ${job?.status === "posted" ? `<div class="order-rating-form"><h5>Confirm receipt</h5><p>Rate this print before completing the order. Completion releases the printer payout.</p><label>Rating<select data-job-rating required><option value="">Choose rating</option><option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Okay</option><option value="2">2 - Poor</option><option value="1">1 - Bad</option></select></label><label>Review note<textarea data-job-review rows="3" placeholder="Optional note about the print"></textarea></label><button class="button button-primary" type="button" data-complete-print-job="${escapeHtml(job.id)}">Confirm delivery and complete order</button></div>` : ""}
  `;
  detail.hidden = false;
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function processCheckoutResult() {
  const checkoutParameters = new URLSearchParams(window.location.search);
  const checkoutResult = checkoutParameters.get("checkout");
  if (checkoutResult === "success") await verifyPrintPurchase(checkoutParameters.get("session_id"));
  if (checkoutResult === "cancelled") showToast("Stripe Checkout was cancelled.");
  if (checkoutResult === "unlock-success") await verifyUnlockPurchase(checkoutParameters.get("session_id"));
  if (checkoutResult === "unlock-cancelled") showToast("Unlimited STL unlock was cancelled.");
  if (checkoutResult && checkoutResult !== "unlock-success") history.replaceState({}, "", window.location.pathname);
}

async function configureProviderButtons() {
  const providers = await accountService.providerAvailability();
  document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
    const configured = providers[button.dataset.oauthProvider];
    button.hidden = configured === false;
    button.disabled = configured === false;
    button.title = configured === false ? `${button.textContent.trim()} sign-in is not configured in Supabase yet.` : "";
  });
  const configured = Object.entries(providers).filter(([, enabled]) => enabled === true).map(([provider]) => provider);
  const unknown = Object.values(providers).some((enabled) => enabled === null);
  document.getElementById("oauthStatus").textContent = unknown
    ? "Social sign-in status could not be checked. Email sign-in remains available."
    : configured.length
      ? `${configured.map((provider) => provider[0].toUpperCase() + provider.slice(1)).join(" and ")} sign-in ready.`
      : "Google sign-in requires provider credentials in Supabase. Email sign-in remains available.";
}

async function initializeAccount() {
  try {
    const session = await accountService.init();
    await configureProviderButtons();
    setAuthenticated(Boolean(session));
    if (!session) {
      document.getElementById("loginError").textContent = accountService.authError();
      return;
    }
    if (accountService.authType() === "recovery") {
      const password = window.prompt("Enter your new password");
      if (password) {
        await accountService.updatePassword(password);
        showToast("Password updated");
      }
    }
    await accountService.importLocalData(localPresets(), localArmyProjects());
    await Promise.all([refreshCloudData(), refreshExportState()]);
    await processCheckoutResult();
  } catch (error) {
    setAuthenticated(false);
    document.getElementById("loginError").textContent = error.message;
  }
}

Object.values(inputs).forEach((input) => input.addEventListener("input", render));
document.querySelectorAll('input[name="printOutputMode"]').forEach((input) => input.addEventListener("change", render));
filamentColourInput.addEventListener("change", () => {
  render();
  if (document.body.dataset.activeMode === "storage") renderStorageRecommendations();
});
filamentMaterialInput.addEventListener("change", () => {
  populateFilamentColours(filamentMaterialInput.value, state.filamentKey);
  render();
  if (document.body.dataset.activeMode === "storage") renderStorageRecommendations();
});
storageFilamentColourInput.addEventListener("change", () => {
  filamentColourInput.value = storageFilamentColourInput.value;
  render();
  renderStorageRecommendations();
});
storageFilamentMaterialInput.addEventListener("change", () => {
  filamentMaterialInput.value = storageFilamentMaterialInput.value;
  populateFilamentColours(storageFilamentMaterialInput.value, state.filamentKey);
  render();
  renderStorageRecommendations();
});
document.querySelectorAll("[data-preview-turn]").forEach((button) => button.addEventListener("click", () => {
  previewYaw += Number(button.dataset.previewTurn) * Math.PI / 8;
  render();
}));
document.querySelector("[data-preview-reset]").addEventListener("click", () => {
  previewYaw = -Math.PI / 4;
  previewPitch = Math.PI / 5;
  render();
});
document.getElementById("trayPreview").addEventListener("pointerdown", (event) => {
  previewDrag = { x: event.clientX, y: event.clientY, yaw: previewYaw, pitch: previewPitch };
  event.currentTarget.setPointerCapture(event.pointerId);
});
document.getElementById("trayPreview").addEventListener("pointermove", (event) => {
  if (!previewDrag) return;
  previewYaw = previewDrag.yaw + (event.clientX - previewDrag.x) * 0.012;
  previewPitch = clamp(previewDrag.pitch - (event.clientY - previewDrag.y) * 0.008, 0.12, 1.35);
  render();
});
document.getElementById("trayPreview").addEventListener("pointerup", () => { previewDrag = null; });
document.getElementById("trayPreview").addEventListener("pointercancel", () => { previewDrag = null; });
document.querySelectorAll("[data-base-shape]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-base-shape]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    state.baseShape = normalizeStorageBaseShape(button.dataset.baseShape, Number(inputs.baseSize.value), Number(inputs.baseDepth.value));
    state.baseDepth = baseDepthForShape(state.baseShape, Number(inputs.baseSize.value), Number(inputs.baseDepth.value));
    inputs.baseDepth.value = state.baseDepth;
    render();
  });
});
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => switchMode(button.dataset.mode));
});
document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("loginUsername").value;
  const password = document.getElementById("loginPassword").value;
  document.getElementById("loginError").textContent = "Signing in...";
  try {
    await accountService.signIn(email, password);
    setAuthenticated(true);
    await accountService.importLocalData(localPresets(), localArmyProjects());
    await Promise.all([refreshCloudData(), refreshExportState()]);
    await processCheckoutResult();
    showToast("Welcome to the workshop");
  } catch (error) {
    document.getElementById("loginError").textContent = error.message;
  }
});
document.getElementById("createAccountButton").addEventListener("click", async () => {
  accountAuthFlow.openCreateAccount({
    email: document.getElementById("loginUsername").value,
    password: document.getElementById("loginPassword").value,
    surfaceLabel: "Forget About Tray",
    notify: (message) => { document.getElementById("loginError").textContent = message; },
    onSuccess: async (result) => {
      if (!result.access_token) return;
      setAuthenticated(true);
      await accountService.importLocalData(localPresets(), localArmyProjects());
      await Promise.all([refreshCloudData(), refreshExportState()]);
    }
  });
});
document.getElementById("forgotPasswordButton").addEventListener("click", async () => {
  accountAuthFlow.openPasswordReset({
    email: document.getElementById("loginUsername").value,
    surfaceLabel: "Forget About Tray",
    notify: (message) => { document.getElementById("loginError").textContent = message; }
  });
});
document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      document.getElementById("loginError").textContent = `Opening ${button.textContent.trim()} sign in...`;
      await accountService.signInWithProvider(button.dataset.oauthProvider);
    } catch (error) {
      document.getElementById("loginError").textContent = error.message;
    }
  });
});
document.getElementById("logoutButton").addEventListener("click", async () => {
  await accountService.signOut();
  cloudPresets = [];
  cloudArmyProjects = [];
  accountExportState = { freeExportUsed: false, unlimitedExports: false };
  unlimitedExportsVerified = false;
  setAuthenticated(false);
});
document.getElementById("accountButton").addEventListener("click", () => {
  const menu = document.getElementById("accountMenu");
  menu.hidden = !menu.hidden;
  document.getElementById("accountButton").setAttribute("aria-expanded", String(!menu.hidden));
});
document.querySelectorAll("[data-account-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById("accountMenu").hidden = true;
    document.getElementById("accountButton").setAttribute("aria-expanded", "false");
    loadAccountDialog(button.dataset.accountView);
  });
});
document.querySelectorAll("[data-account-page-button]").forEach((button) => {
  button.addEventListener("click", () => setAccountPage(button.dataset.accountPageButton));
});
document.getElementById("accountOrdersList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-detail]");
  if (button) showOrderDetail(button.dataset.orderDetail);
});
document.getElementById("accountOrderDetail").addEventListener("click", async (event) => {
  const completeButton = event.target.closest("[data-complete-print-job]");
  const messageButton = event.target.closest("[data-send-job-message]");
  if (!completeButton && !messageButton) return;
  const button = completeButton || messageButton;
  try {
    button.disabled = true;
    let response;
    if (messageButton) {
      const note = messageButton.closest(".order-message-form").querySelector("[data-customer-job-message]").value;
      response = await authorizedFetch(`/api/account/print-jobs/${encodeURIComponent(messageButton.dataset.sendJobMessage)}/message`, { method: "POST", body: JSON.stringify({ note }) });
    } else {
      const form = completeButton.closest(".order-rating-form");
      const rating = Number(form.querySelector("[data-job-rating]").value);
      if (!rating || !window.confirm("Confirm that this printed order has arrived? This records your rating and releases the printer payout.")) {
        button.disabled = false;
        return;
      }
      response = await authorizedFetch(`/api/account/print-jobs/${encodeURIComponent(completeButton.dataset.completePrintJob)}/complete`, {
        method: "POST",
        body: JSON.stringify({ rating, reviewText: form.querySelector("[data-job-review]").value })
      });
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Order could not be updated.");
    await loadAccountDialog("orders");
    showToast(messageButton ? "Message sent" : result.transfer?.released ? "Order completed and printer payout released" : "Order completed; printer payout remains held for review");
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".account-menu-wrap")) return;
  document.getElementById("accountMenu").hidden = true;
  document.getElementById("accountButton").setAttribute("aria-expanded", "false");
});
document.getElementById("accountProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await accountService.saveProfile({
      display_name: document.getElementById("accountDisplayName").value.trim() || null,
      default_address: {
        line1: document.getElementById("accountAddressLine1").value.trim(),
        line2: document.getElementById("accountAddressLine2").value.trim(),
        city: document.getElementById("accountCity").value.trim(),
        county: document.getElementById("accountCounty").value.trim(),
        postcode: document.getElementById("accountPostcode").value.trim(),
        country: document.getElementById("accountCountry").value.trim().toUpperCase()
      },
      marketing_consent: document.getElementById("accountMarketingConsent").checked
    });
    showToast("Profile saved");
  } catch (error) {
    showToast(error.message);
  }
});
window.accountPasswordFlow?.hydrate(document.querySelector("#accountPasswordSection [data-account-password-form]"), { notify: showToast });
document.getElementById("downloadAccountData").addEventListener("click", async () => {
  try {
    const response = await authorizedFetch("/api/account/data-export");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Account data could not be exported.");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    link.download = `forget-about-tray-account-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Account data exported");
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById("requestAccountDeletion").addEventListener("click", async () => {
  if (!window.confirm("Request account deletion? Legally required order and VAT records will still be retained for their required period.")) return;
  try {
    const response = await authorizedFetch("/api/account/deletion-request", { method: "POST", body: "{}" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Deletion request could not be submitted.");
    showToast("Account deletion request submitted");
  } catch (error) {
    showToast(error.message);
  }
});
document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = inputs[button.dataset.step];
    input.value = clamp(Number(input.value) + Number(button.dataset.direction), Number(input.min), Number(input.max));
    render();
  });
});
document.querySelectorAll("[data-base]").forEach((button) => {
  button.addEventListener("click", () => {
    inputs.baseSize.value = button.dataset.base;
    state.baseDepth = baseDepthForShape(state.baseShape, Number(button.dataset.base), Number(inputs.baseDepth.value));
    inputs.baseDepth.value = state.baseDepth;
    render();
  });
});
document.getElementById("exportButton").addEventListener("click", () => requestExport());
document.getElementById("savePreset").addEventListener("click", savePreset);
document.getElementById("exportTop").addEventListener("click", exportFromHeader);
document.getElementById("savePresetTop").addEventListener("click", saveFromHeader);
document.getElementById("resetButton").addEventListener("click", () => {
  writeState(defaults);
  showToast("Tray reset to defaults");
});
document.getElementById("presets").addEventListener("click", async (event) => {
  const loadId = event.target.dataset.load;
  const deleteId = event.target.dataset.delete;
  if (loadId) {
    const preset = presets().find((item) => item.id === loadId);
    if (preset?.state?.mode === storageInsertMode) loadStorageConfig(preset.state);
    else if (preset) writeState(preset.state);
  }
  if (deleteId) {
    if (accountService.isSignedIn()) {
      await accountService.deleteDesign(deleteId);
      await refreshCloudData();
    } else {
      localStorage.setItem("movement-tray-presets", JSON.stringify(localPresets().filter((item) => item.id !== deleteId)));
    }
    renderPresets();
    showToast("Preset deleted");
  }
});
document.getElementById("sampleArmy").addEventListener("click", () => {
  document.getElementById("armyList").value = `Beastmen Brayherds - 2,000 points

Core
20x Ungor Raiders [120 pts]
20x Gor Herds [140 pts]

Special
20x Bestigor Herds [260 pts]
6x Minotaur Herds [300 pts]`;
  analyzeArmyList();
});
document.getElementById("analyzeArmy").addEventListener("click", analyzeArmyList);
document.getElementById("openCatalogue").addEventListener("click", () => prepareCatalogue("army"));
document.getElementById("openSingleCatalogue").addEventListener("click", () => prepareCatalogue("single"));
document.getElementById("openStorageCatalogue").addEventListener("click", () => prepareCatalogue("storage"));
document.getElementById("sampleStorageArmy").addEventListener("click", () => {
  document.getElementById("storageArmyList").value = `High Elf Realms - storage test
16 White Lions of Chrace
16 Chracian Woodsmen
4 War Lions
1 Lion Chariot of Chrace`;
  analyzeStorageList();
});
document.getElementById("analyzeStorageArmy").addEventListener("click", analyzeStorageList);
document.getElementById("storageBoxSelect").addEventListener("change", renderStorageRecommendations);
["storageBoxLength", "storageBoxWidth", "storageBoxDepth", "storageWallHeightPreset", "storageWallHeight", "storageIncludeBases"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderStorageRecommendations);
  document.getElementById(id).addEventListener("change", renderStorageRecommendations);
});
document.querySelectorAll('input[name="storageInsertMagnets"], input[name="storageBaseMagnets"]').forEach((input) => input.addEventListener("change", renderStorageRecommendations));
document.getElementById("catalogueSearch").addEventListener("input", renderCatalogue);
document.getElementById("catalogueSystemFilter").addEventListener("change", renderCatalogue);
document.getElementById("catalogueArmyFilter").addEventListener("change", renderCatalogue);
document.getElementById("catalogueList").addEventListener("click", (event) => {
  const card = event.target.closest("[data-catalogue-id]");
  if (!card || event.target.tagName !== "BUTTON") return;
  const entry = allCatalogueEntries().find((item) => item.id === card.dataset.catalogueId);
  if (entry) applyCatalogueEntry(entry, Number(card.querySelector("input")?.value) || 10);
});
document.getElementById("customUnitForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = {
    id: `custom-${Date.now()}`,
    army: "Custom",
    name: document.getElementById("customUnitName").value.trim(),
    width: Number(document.getElementById("customUnitWidth").value),
    depth: Number(document.getElementById("customUnitDepth").value),
    aliases: [normalizeText(document.getElementById("customUnitName").value)]
  };
  const custom = customCatalogue();
  custom.push(entry);
  localStorage.setItem("movement-tray-custom-catalogue", JSON.stringify(custom));
  applyCatalogueEntry(entry, Number(document.getElementById("customUnitCount").value));
  event.target.reset();
  document.getElementById("customUnitCount").value = "10";
  document.getElementById("customUnitWidth").value = "25";
  document.getElementById("customUnitDepth").value = "25";
  renderCatalogue();
});
document.getElementById("saveArmyProject").addEventListener("click", saveArmyProject);
document.getElementById("openArmyProjects").addEventListener("click", () => {
  renderSavedArmies();
  document.getElementById("savedArmiesDialog").showModal();
});
document.getElementById("savedArmiesList").addEventListener("click", async (event) => {
  const card = event.target.closest("[data-army-project]");
  const action = event.target.dataset.projectAction;
  if (!card || !action) return;
  const saved = armyProjects();
  const project = saved.find((item) => item.id === card.dataset.armyProject);
  if (action === "load" && project) {
    armyRecommendations = structuredClone(project.recommendations);
    activeArmyRecommendationId = armyRecommendations[0]?.id || "";
    document.getElementById("armyList").value = project.listText || "";
    document.getElementById("armyProjectName").value = project.name;
    renderArmyRecommendations();
    document.getElementById("savedArmiesDialog").close();
    showToast(`${project.name} loaded`);
  }
  if (action === "delete") {
    if (accountService.isSignedIn()) {
      await accountService.deleteProject(card.dataset.armyProject);
      await refreshCloudData();
    } else {
      localStorage.setItem("movement-tray-army-projects", JSON.stringify(localArmyProjects().filter((item) => item.id !== card.dataset.armyProject)));
    }
    renderSavedArmies();
  }
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog).close());
});
document.getElementById("chooseAdExport").addEventListener("click", startAdGate);
document.getElementById("chooseUnlockedExport").addEventListener("click", async () => {
  try {
    await exportStl(pendingExportConfig, pendingExportPrefix);
    document.getElementById("exportDialog").close();
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById("chooseEmailExport").addEventListener("click", async () => {
  try {
    await emailStl(pendingExportConfig, pendingExportPrefix);
    document.getElementById("exportDialog").close();
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById("chooseUnlimitedExport").addEventListener("click", showUnlockExports);
document.getElementById("choosePrintOrder").addEventListener("click", showPrintOrder);
document.getElementById("stripeCheckoutButton").addEventListener("click", beginStripeCheckout);
document.getElementById("providerQuotes").addEventListener("click", (event) => {
  const button = event.target.closest("[data-provider-quote]");
  if (!button) return;
  selectedMarketplaceQuoteId = button.dataset.providerQuote;
  renderProviderQuotes();
});
["providerColourFilter", "providerLeadFilter", "providerRatingFilter"].forEach((id) => {
  document.getElementById(id).addEventListener("change", renderProviderQuotes);
});
document.getElementById("unlockCheckoutButton").addEventListener("click", beginUnlockCheckout);
async function completeSponsoredExport(delivery) {
  try {
    const response = await authorizedFetch("/api/account/use-free-export", {
      method: "POST",
      body: JSON.stringify({ config: pendingExportConfig, name: pendingExportPrefix })
    });
    const result = await response.json();
    if (!response.ok || !result.allowed) throw new Error(result.error || "The sponsored download could not be unlocked.");
    accountExportState.freeExportUsed = true;
    if (delivery === "email") await emailStl(pendingExportConfig, pendingExportPrefix, result.downloadToken);
    else await exportStl(pendingExportConfig, pendingExportPrefix, result.downloadToken);
    document.getElementById("exportDialog").close();
  } catch (error) {
    showToast(error.message);
  }
}
document.getElementById("completeAdExport").addEventListener("click", () => completeSponsoredExport("download"));
document.getElementById("completeAdEmailExport").addEventListener("click", () => completeSponsoredExport("email"));
document.getElementById("armyResults").addEventListener("input", (event) => {
  const field = event.target.dataset.armyField;
  const card = event.target.closest("[data-recommendation]");
  if (!field || !card) return;
  const recommendation = armyRecommendations.find((item) => item.id === card.dataset.recommendation);
  if (!recommendation) return;
  if (field === "includeBases") recommendation[field] = event.target.checked;
  else if (field === "baseShape") recommendation.baseShape = normalizeStorageBaseShape(event.target.value, recommendation.baseSize, recommendation.baseDepth);
  else recommendation[field] = Number(event.target.value) || 0;
  if (field === "baseShape" || field === "baseSize" || field === "baseDepth") {
    recommendation.baseShape = normalizeStorageBaseShape(recommendation.baseShape, recommendation.baseSize, recommendation.baseDepth);
    if (shapeLocksDepth(recommendation.baseShape)) recommendation.baseDepth = recommendation.baseSize;
    else if (field === "baseShape" || field === "baseSize") recommendation.baseDepth = baseDepthForShape(recommendation.baseShape, recommendation.baseSize, recommendation.baseDepth);
  }
  const preview = card.querySelector(".army-unit-preview");
  if (preview) preview.innerHTML = trayThumbnailSvg(recommendationConfig(recommendation));
  const ready = recommendation.baseSize > 0 && recommendation.baseDepth > 0;
  card.querySelectorAll("[data-army-action]").forEach((button) => { button.disabled = !ready; });
});
document.getElementById("armyResults").addEventListener("change", (event) => {
  if (event.target.dataset.armyField) renderArmyRecommendations();
});
document.getElementById("armyTrayTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-army-tab]");
  if (!button) return;
  if (armyEditingId) {
    showToast("Save or go back before changing tray tabs");
    return;
  }
  activeArmyRecommendationId = button.dataset.armyTab;
  renderArmyRecommendations();
});
document.getElementById("armyResults").addEventListener("click", (event) => {
  const editAction = event.target.dataset.armyEdit;
  if (editAction === "back") return exitArmyEdit(false);
  if (editAction === "save") return exitArmyEdit(true);
  const action = event.target.dataset.armyAction;
  const card = event.target.closest("[data-recommendation]");
  if (!action || !card) return;
  const recommendation = armyRecommendations.find((item) => item.id === card.dataset.recommendation);
  if (!recommendation || recommendation.baseSize <= 0 || recommendation.baseDepth <= 0) return;
  rememberUnitBase(recommendation);
  const config = recommendationConfig(recommendation);
  if (action === "load") {
    startArmyEdit(recommendation);
    document.querySelector(".army-results-wrap").scrollIntoView({ behavior: "smooth" });
  }
  if (action === "save") saveRecommendation(recommendation);
  if (action === "export") requestExport(config, recommendation.name);
});
function handleStorageUnitChange(event) {
  const field = event.target.dataset.storageField;
  const card = event.target.closest("[data-storage-unit]");
  if (!field || !card) return false;
  const unit = storageRecommendations.find((item) => item.id === card.dataset.storageUnit);
  if (!unit) return false;
  if (field === "baseShape") {
    unit.baseShape = normalizeStorageBaseShape(event.target.value, unit.baseSize, unit.baseDepth);
  } else {
    unit[field] = Number(event.target.value) || 0;
  }
  if (field === "count") {
    const formation = recommendFormation(unit.count || 1);
    unit.columns = formation.columns;
    unit.rows = formation.rows;
  }
  unit.baseShape = normalizeStorageBaseShape(unit.baseShape, unit.baseSize, unit.baseDepth);
  if ((field === "baseShape" || field === "baseSize") && shapeLocksDepth(unit.baseShape)) unit.baseDepth = unit.baseSize;
  renderStorageRecommendations();
  return true;
}
document.getElementById("storageResults").addEventListener("input", handleStorageUnitChange);
document.getElementById("storageResults").addEventListener("change", handleStorageUnitChange);
document.getElementById("storageResults").addEventListener("click", (event) => {
  const moveDelta = Number(event.target.dataset.storageMove || 0);
  if (moveDelta) {
    const card = event.target.closest("[data-storage-unit]");
    const index = storageRecommendations.findIndex((item) => item.id === card?.dataset.storageUnit);
    const nextIndex = index + moveDelta;
    if (index >= 0 && nextIndex >= 0 && nextIndex < storageRecommendations.length) {
      const [item] = storageRecommendations.splice(index, 1);
      storageRecommendations.splice(nextIndex, 0, item);
      renderStorageRecommendations();
    }
    return;
  }
  const removeId = event.target.dataset.storageRemove;
  if (!removeId) return;
  storageRecommendations = storageRecommendations.filter((item) => item.id !== removeId);
  renderStorageRecommendations();
});

populateStorageBoxes();
render();
renderPresets();
renderStorageRecommendations();
setAuthenticated(false);
initializeAccount();
