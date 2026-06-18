export const slicerCalibration = {
  referencePreviewGrams: 89.2,
  referenceSlicerGrams: 78.78,
  factor: 78.78 / 89.2
};

export const defaultPrintTimeModel = {
  printer: "Bambu Lab P1S",
  gramsPerHour: 48,
  setupMinutes: 12.7
};

export function materialDensity(material = "pla") {
  const normalized = String(material).toLowerCase();
  if (normalized === "petg") return 1.27;
  if (normalized === "abs") return 1.04;
  return 1.24;
}

export function calibratedMaterialCm3(materialCm3, options = {}) {
  const volume = Number(materialCm3);
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  return options.uploaded ? volume : volume * slicerCalibration.factor;
}

export function generatedWeightGrams(materialCm3, material = "pla", options = {}) {
  const grams = calibratedMaterialCm3(materialCm3, options) * materialDensity(material);
  return Math.max(0, Number(grams.toFixed(1)));
}

export function estimatedWeightGramsFromGeometry(geometry = {}, material = "pla") {
  const config = geometry.config || {};
  if (config.stlBase64 || Number.isFinite(Number(config.estimatedWeightGrams))) {
    return Math.max(1, Math.round(Number(config.estimatedWeightGrams || 0)));
  }
  const materialCm3 = Number(geometry.printMaterialCm3 ?? geometry.materialCm3 ?? 0);
  return Math.max(1, Math.round(generatedWeightGrams(materialCm3, material)));
}

export function estimatedPrintHours(weightGrams, gramsPerHour = defaultPrintTimeModel.gramsPerHour, setupMinutes = defaultPrintTimeModel.setupMinutes) {
  const grams = Number(weightGrams);
  const rate = Math.max(1, Number(gramsPerHour) || defaultPrintTimeModel.gramsPerHour);
  const setup = Math.max(0, Number(setupMinutes) || 0);
  if (!Number.isFinite(grams) || grams <= 0) return 0;
  return Number(((grams / rate) + (setup / 60)).toFixed(2));
}

export function printTimeLabel(hours) {
  const totalMinutes = Math.max(0, Math.round(Number(hours || 0) * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
