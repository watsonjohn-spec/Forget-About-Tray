import { movementTrayGenerator } from "./generators/movement-tray.mjs";
import { makeupCaddyGenerator } from "./generators/makeup-caddy.mjs";
import { uploadedPrintGenerator } from "./generators/uploaded-print.mjs";
import { paintStationGenerator } from "./generators/paint-station.mjs";
import { stitchOrganizerGenerator } from "./generators/stitch-organizer.mjs";

const brands = [
  {
    key: "tray",
    path: "tray",
    aliases: ["trays", "trays/", "forget-about-tray", "forget-about-tray/"],
    name: "Forget About Tray",
    shortName: "Tray",
    studioName: "Forget About Tray",
    tagline: { primary: "Build the formation.", secondary: "Print the advantage." },
    factoryLabel: "Tray",
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
    shortName: "Makeup",
    studioName: "Forget About Makeup",
    tagline: { primary: "Arrange the ritual.", secondary: "Carry it beautifully." },
    factoryLabel: "Makeup",
    defaultGeneratorType: "makeup_caddy",
    generatorTypes: ["makeup_caddy"],
    enabled: true,
    entitlementScope: "brand",
    theme: {
      themeColor: "#6f4148",
      ink: "#38272b",
      muted: "#80686c",
      line: "#d3b4b5",
      paper: "#ead8d5",
      panel: "#f8eeeb",
      white: "#fffaf8",
      accent: "#b76e79",
      accentDark: "#75474e",
      highlight: "#d7a69f"
    }
  },
  {
    key: "print",
    path: "print",
    name: "Forget About Print",
    shortName: "Print",
    studioName: "Forget About Print",
    tagline: { primary: "Upload the model.", secondary: "Let the factory quote it." },
    factoryLabel: "Print",
    defaultGeneratorType: "uploaded_print",
    generatorTypes: ["uploaded_print"],
    enabled: true,
    entitlementScope: "brand",
    theme: {
      themeColor: "#253642",
      ink: "#1e2b33",
      muted: "#677781",
      line: "#bdc9ce",
      paper: "#d8dddc",
      panel: "#eef0ed",
      white: "#fafaf5",
      accent: "#45555b",
      accentDark: "#222d31",
      highlight: "#d08a32"
    }
  },
  {
    key: "paint",
    path: "paint",
    name: "Forget About Paint",
    shortName: "Paint",
    studioName: "Forget About Paint",
    tagline: { primary: "Rack the colour.", secondary: "Clear the desk." },
    factoryLabel: "Paint",
    defaultGeneratorType: "paint_station",
    generatorTypes: ["paint_station"],
    enabled: true,
    entitlementScope: "brand",
    theme: {
      themeColor: "#315a4e",
      ink: "#1f302d",
      muted: "#647771",
      line: "#b8cbc3",
      paper: "#e4ece7",
      panel: "#f2f7f3",
      white: "#fbfdf9",
      accent: "#4f7b6f",
      accentDark: "#294f45",
      highlight: "#8fb9a3"
    }
  },
  {
    key: "stitch",
    path: "stitch",
    name: "Forget About Stitch",
    shortName: "Stitch",
    studioName: "Forget About Stitch",
    tagline: { primary: "Sort the thread.", secondary: "Keep the project moving." },
    factoryLabel: "Stitch",
    defaultGeneratorType: "stitch_organizer",
    generatorTypes: ["stitch_organizer"],
    enabled: true,
    entitlementScope: "brand",
    theme: {
      themeColor: "#5a4368",
      ink: "#30273a",
      muted: "#756981",
      line: "#c9bdd3",
      paper: "#ece7ef",
      panel: "#f7f2f8",
      white: "#fffaff",
      accent: "#8d6aa9",
      accentDark: "#563868",
      highlight: "#b99cd0"
    }
  },
  {
    key: "crosstitch",
    path: "crosstitch",
    name: "Forget About Crosstitch",
    shortName: "Crosstitch",
    studioName: "Crosstitch Studio",
    tagline: { primary: "Sort the pattern.", secondary: "Thread the plan." },
    factoryLabel: "Crosstitch",
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
    shortName: "Board Games",
    studioName: "Board Game Studio",
    tagline: { primary: "Sort the table.", secondary: "Pack the play." },
    factoryLabel: "Board Games",
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

const generators = new Map([
  [movementTrayGenerator.type, movementTrayGenerator],
  [makeupCaddyGenerator.type, makeupCaddyGenerator],
  [uploadedPrintGenerator.type, uploadedPrintGenerator],
  [paintStationGenerator.type, paintStationGenerator],
  [stitchOrganizerGenerator.type, stitchOrganizerGenerator]
]);

export const marketplacePolicy = {
  countryCode: "GB",
  currency: "gbp",
  customerSelectsPrinter: true,
  refundableBeforeStatus: "producing",
  providerTransferStatus: "complete",
  jobStatuses: ["pending_payment", "order_made", "producing", "posted", "complete", "cancelled", "refunded"],
  paymentProvider: "worldpay",
  customerPaymentFlow: "hosted_payment_page",
  providerPayoutFlow: "manual_after_completion"
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

export function validatePlatformRegistry() {
  return brands
    .filter((brand) => brand.enabled)
    .map((brand) => {
      const generator = getGenerator(brand.defaultGeneratorType);
      if (!brand.generatorTypes.includes(generator.type)) throw new Error(`${brand.key} default generator is not registered on the brand.`);
      if (!generator.capabilities?.printFactory) throw new Error(`${generator.type} must declare print factory capability.`);
      if (!generator.defaultFilament?.material) throw new Error(`${generator.type} must declare a default filament.`);
      return { brand, generator };
    });
}

export const publicPlatformConfig = {
  brands: brands.map(({ aliases, ...brand }) => brand),
  generators: [...generators.values()].map(({ normalizeParameters, buildGeometry, renderStl, safeFileName, describe, ...generator }) => generator),
  marketplace: marketplacePolicy
};
