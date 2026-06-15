import { movementTrayGenerator } from "./generators/movement-tray.mjs";

const brands = [
  {
    key: "tray",
    path: "tray",
    aliases: ["forget-about-tray", "forget-about-tray/"],
    name: "Forget About Tray",
    studioName: "Forget About Tray",
    defaultGeneratorType: "movement_tray",
    generatorTypes: ["movement_tray"],
    enabled: true,
    entitlementScope: "brand",
    theme: {
      themeColor: "#2c4531",
      ink: "#1e2921",
      muted: "#627064",
      line: "#b9c5ae",
      paper: "#e5e8d9",
      panel: "#f4f4e8",
      white: "#fffdf4",
      accent: "#5f7d4b",
      accentDark: "#263c2b",
      highlight: "#95b35f"
    }
  },
  {
    key: "makeup",
    path: "makeup",
    name: "Forget About Makeup",
    studioName: "Makeup Studio",
    defaultGeneratorType: null,
    generatorTypes: [],
    enabled: false,
    entitlementScope: "brand",
    theme: {
      themeColor: "#7b4f58",
      ink: "#35262b",
      muted: "#806a70",
      line: "#cfb9bd",
      paper: "#eee2e2",
      panel: "#faf3f1",
      white: "#fffafa",
      accent: "#aa766f",
      accentDark: "#70464f",
      highlight: "#c89a8f"
    }
  },
  {
    key: "crosstitch",
    path: "crosstitch",
    name: "Forget About Crosstitch",
    studioName: "Crosstitch Studio",
    defaultGeneratorType: null,
    generatorTypes: [],
    enabled: false,
    entitlementScope: "brand",
    theme: {
      themeColor: "#4a6475",
      ink: "#26333b",
      muted: "#657784",
      line: "#b8c6cd",
      paper: "#e5ebed",
      panel: "#f4f7f7",
      white: "#fbfdfd",
      accent: "#6e8c9c",
      accentDark: "#3c5868",
      highlight: "#9eb8c2"
    }
  },
  {
    key: "board-games",
    path: "board-games",
    name: "Forget About Board Games",
    studioName: "Board Game Studio",
    defaultGeneratorType: null,
    generatorTypes: [],
    enabled: false,
    entitlementScope: "brand",
    theme: {
      themeColor: "#5f4431",
      ink: "#30271f",
      muted: "#766b60",
      line: "#c7b9a9",
      paper: "#e9e2d7",
      panel: "#f7f2e9",
      white: "#fffdf8",
      accent: "#8a6846",
      accentDark: "#59412e",
      highlight: "#b69263"
    }
  }
];

const generators = new Map([[movementTrayGenerator.type, movementTrayGenerator]]);

export const marketplacePolicy = {
  countryCode: "GB",
  currency: "gbp",
  customerSelectsPrinter: true,
  refundableBeforeStatus: "producing",
  providerTransferStatus: "complete",
  jobStatuses: ["pending_payment", "order_made", "producing", "posted", "complete", "cancelled", "refunded"],
  stripeChargeType: "separate_charges_and_transfers"
};

export function getBrand(key = "tray") {
  const brand = brands.find((candidate) => candidate.key === key);
  if (!brand) throw new Error("Unknown brand");
  return brand;
}

export function getGenerator(type = "movement_tray") {
  const generator = generators.get(type);
  if (!generator) throw new Error("Unknown generator type");
  return generator;
}

export function resolvePlatformContext({ brandKey = "tray", generatorType } = {}) {
  const brand = getBrand(brandKey);
  const type = generatorType || brand.defaultGeneratorType;
  if (!type) throw new Error("This brand does not have a generator configured yet.");
  if (!brand.generatorTypes.includes(type)) throw new Error("This generator is not available for the selected brand.");
  const generator = getGenerator(type);
  return { brand, generator };
}

export const publicPlatformConfig = {
  brands: brands.map(({ aliases, ...brand }) => brand),
  generators: [...generators.values()].map(({ normalizeParameters, buildGeometry, renderStl, safeFileName, describe, ...generator }) => generator),
  marketplace: marketplacePolicy
};
