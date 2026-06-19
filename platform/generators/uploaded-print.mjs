const generatorType = "uploaded_print";
const version = 1;

function numberInRange(value, minimum, maximum, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error("Invalid uploaded print parameters");
  return number;
}

function density(material = "pla") {
  if (material === "petg") return 1.27;
  if (material === "abs") return 1.04;
  return 1.24;
}

function normalizeParameters(input = {}) {
  const material = ["pla", "petg", "abs"].includes(input.filamentMaterial) ? input.filamentMaterial : "pla";
  const estimatedWeightGrams = numberInRange(input.estimatedWeightGrams, 1, 5000, 25);
  return {
    name: String(input.name || "Uploaded STL").slice(0, 80),
    uploadedFileName: String(input.uploadedFileName || "uploaded-model.stl").slice(0, 120),
    stlBase64: String(input.stlBase64 || ""),
    estimatedWeightGrams,
    outerWidth: numberInRange(input.outerWidth, 1, 1000, 100),
    outerDepth: numberInRange(input.outerDepth, 1, 1000, 100),
    height: numberInRange(input.height, 1, 1000, 30),
    filamentMaterial: material,
    filamentKey: String(input.filamentKey || `custom-${material}`).slice(0, 80),
    filamentName: String(input.filamentName || material.toUpperCase()).slice(0, 80),
    filamentHex: /^#[0-9a-f]{6}$/i.test(input.filamentHex || "") ? input.filamentHex : "#8b9499",
    desiredColourKey: String(input.desiredColourKey || "all").slice(0, 80),
    preferredPrinterProfileId: String(input.preferredPrinterProfileId || "").slice(0, 80)
  };
}

function buildGeometry(parameters) {
  const config = normalizeParameters(parameters);
  const materialCm3 = config.estimatedWeightGrams / density(config.filamentMaterial);
  return {
    config,
    boxes: [{ x: 0, y: 0, z: 0, w: config.outerWidth, d: config.outerDepth, h: config.height }],
    innerWidth: config.outerWidth,
    innerDepth: config.outerDepth,
    outerWidth: config.outerWidth,
    outerDepth: config.outerDepth,
    height: config.height,
    materialCm3
  };
}

function renderStl(parameters) {
  const config = normalizeParameters(parameters);
  if (!config.stlBase64) throw new Error("Upload an STL before requesting a print.");
  const bytes = Buffer.from(config.stlBase64, "base64");
  if (!bytes.length) throw new Error("The uploaded STL file was empty.");
  return bytes;
}

function safeFileName(parameters, name) {
  const config = normalizeParameters(parameters);
  const prefix = String(name || config.uploadedFileName || "uploaded-print").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uploaded-print";
  return `${prefix}.stl`;
}

function describe(parameters) {
  const config = normalizeParameters(parameters);
  return `${config.uploadedFileName}, estimated ${config.estimatedWeightGrams}g, ${config.outerWidth} x ${config.outerDepth} x ${config.height}mm`;
}

export const uploadedPrintGenerator = {
  type: generatorType,
  version,
  name: "Uploaded STL print",
  catalogueType: "uploaded_stl",
  productFamily: "uploaded-print",
  factoryLabel: "Uploaded STL",
  defaultFilament: { material: "pla", key: "all", name: "Any standard colour", hex: "#8b9499" },
  capabilities: {
    savedDesigns: true,
    stlDownload: false,
    printFactory: true,
    catalogue: false,
    uploadStl: true,
    variants: ["uploaded_stl"],
    splitPlates: false
  },
  normalizeParameters,
  buildGeometry,
  renderStl,
  safeFileName,
  describe
};
