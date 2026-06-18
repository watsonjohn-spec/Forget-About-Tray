(() => {
  const slicerCalibration = {
    referencePreviewGrams: 89.2,
    referenceSlicerGrams: 78.78,
    factor: 78.78 / 89.2
  };
  const defaultPrintTimeModel = {
    printer: "Bambu Lab P1S",
    gramsPerHour: 48,
    setupMinutes: 12.7
  };

  function materialDensity(material = "pla") {
    const normalized = String(material).toLowerCase();
    if (normalized === "petg") return 1.27;
    if (normalized === "abs") return 1.04;
    return 1.24;
  }

  function calibratedMaterialCm3(materialCm3, options = {}) {
    const volume = Number(materialCm3);
    if (!Number.isFinite(volume) || volume <= 0) return 0;
    return options.uploaded ? volume : volume * slicerCalibration.factor;
  }

  function generatedWeightGrams(materialCm3, material = "pla", options = {}) {
    const grams = calibratedMaterialCm3(materialCm3, options) * materialDensity(material);
    return Math.max(0, Number(grams.toFixed(1)));
  }

  function estimatedPrintHours(weightGrams, gramsPerHour = defaultPrintTimeModel.gramsPerHour, setupMinutes = defaultPrintTimeModel.setupMinutes) {
    const grams = Number(weightGrams);
    const rate = Math.max(1, Number(gramsPerHour) || defaultPrintTimeModel.gramsPerHour);
    const setup = Math.max(0, Number(setupMinutes) || 0);
    if (!Number.isFinite(grams) || grams <= 0) return 0;
    return Number(((grams / rate) + (setup / 60)).toFixed(2));
  }

  function printTimeLabel(hours) {
    const totalMinutes = Math.max(0, Math.round(Number(hours || 0) * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  window.forgetPrintEstimates = {
    slicerCalibration,
    defaultPrintTimeModel,
    materialDensity,
    calibratedMaterialCm3,
    generatedWeightGrams,
    estimatedPrintHours,
    printTimeLabel
  };
})();
