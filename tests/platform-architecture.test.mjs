import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { marketplacePolicy, publicPlatformConfig, resolvePlatformContext } from "../platform/registry.mjs";
import { assertPrintJobTransition, customerCanCancel, filterPrinterQuotes, providerTransferEligible } from "../platform/print-factory.mjs";
import { defaultPrintTimeModel, estimatedPrintHours, generatedWeightGrams, printTimeLabel, slicerCalibration } from "../platform/print-estimates.mjs";
import trayLayout from "../platform/tray-layout.js";

test("movement trays are registered as a versioned generator under the tray brand", () => {
  const { brand, generator } = resolvePlatformContext({ brandKey: "tray" });
  assert.equal(brand.defaultGeneratorType, "movement_tray");
  assert.equal(generator.type, "movement_tray");
  assert.equal(generator.version, 1);
  assert.deepEqual(brand.generatorTypes, ["movement_tray"]);
  assert.throws(() => resolvePlatformContext({ brandKey: "makeup", generatorType: "movement_tray" }));
  assert.ok(publicPlatformConfig.brands.some((candidate) => candidate.key === "makeup"));
  assert.ok(publicPlatformConfig.brands.some((candidate) => candidate.key === "board-games"));
});

test("makeup caddies are a separate enabled generator under the makeup brand", () => {
  const { brand, generator } = resolvePlatformContext({ brandKey: "makeup" });
  assert.equal(brand.enabled, true);
  assert.equal(brand.defaultGeneratorType, "makeup_caddy");
  assert.equal(generator.catalogueType, "makeup_products");
  const parameters = {
    items: [
      { id: "lipstick", brand: "MAC", name: "Lipstick", category: "Lipstick", width: 22, depth: 22, height: 76, clearance: 1.5 },
      { id: "foundation", brand: "Maybelline", name: "Foundation", category: "Foundation", width: 38, depth: 30, height: 105, clearance: 1.5 }
    ],
    columns: 2, gap: 6, edgeMargin: 8, baseThickness: 3, wallThickness: 2, holderHeight: 18,
    handleEnabled: true, handleHeight: 95, handleWidth: 70
  };
  const geometry = generator.buildGeometry(parameters);
  assert.equal(geometry.positions.length, 2);
  assert.equal(geometry.catchalls.length, 1);
  assert.ok(geometry.boxes.some((box) => box.kind === "catchall"));
  assert.ok(geometry.boxes.length > 10);
  assert.equal(generator.normalizeParameters({ ...parameters, handleEnabled: false }).handleEnabled, true);
  assert.equal(generator.normalizeParameters(parameters).balanceCatchalls, true);
  assert.equal(generator.normalizeParameters({ ...parameters, balanceCatchalls: false }).balanceCatchalls, false);
  assert.equal(geometry.config.handleEnabled, true);
  assert.equal(geometry.spineWidth, 10);
  assert.equal(geometry.spineY, 27);
  assert.equal(geometry.outerWidth, 45);
  assert.equal(geometry.outerDepth, 72);
  assert.equal(geometry.positions[0].y + geometry.positions[0].slotDepth, geometry.spineY);
  assert.equal(geometry.positions[1].y, geometry.spineY + geometry.spineWidth);
  const shortCaddy = generator.buildGeometry({ ...parameters, items: [{ id: "compact", brand: "Generic", name: "Tiny compact", category: "Compact", width: 20, depth: 20, height: 24, clearance: 1.5 }], handleHeight: 160 });
  const spineWall = shortCaddy.boxes.find((box) => box.y === shortCaddy.spineY && box.d === shortCaddy.spineWidth && box.w === shortCaddy.outerWidth);
  assert.ok(spineWall.h >= 80);
  const unbalanced = generator.buildGeometry({ ...parameters, balanceCatchalls: false });
  assert.equal(unbalanced.catchalls.length, 0);
  assert.match(generator.renderStl(parameters), /^solid makeup_caddy/);
  assert.match(generator.safeFileName(parameters, "Dressing table"), /2-slots-handle\.stl$/);
  const staircase = generator.buildGeometry({ ...parameters, items: [...parameters.items, { ...parameters.items[1], id: "foundation-two" }], layoutMode: "staircase", maxSpineLength: 100, stepRise: 22 });
  assert.ok(staircase.positions.some((position) => position.z > 0));
  assert.ok(staircase.catchalls.length > 0);
  assert.ok(staircase.height > geometry.config.baseThickness);
  const pegboard = generator.buildGeometry({
    ...parameters,
    items: Array.from({ length: 12 }, (_, index) => ({ id: `product-${index}`, brand: "Generic", name: `Product ${index + 1}`, category: "Cosmetic", width: 70, depth: 44, height: 96, clearance: 1.5 })),
    layoutMode: "pegboard",
    pegboardColumns: 4,
    pegboardRows: 3,
    pegboardHookSpacing: 40
  });
  assert.equal(pegboard.config.layoutMode, "pegboard");
  assert.equal(pegboard.positions.length, 12);
  assert.equal(pegboard.catchalls, undefined);
  const pegboardHooks = pegboard.boxes.filter((box) => box.kind === "hook");
  const pegboardBackplates = pegboard.boxes.filter((box) => box.kind === "pegboard-backplate");
  const pegboardBases = pegboard.boxes.filter((box) => box.kind === "base");
  assert.equal(pegboard.connectorStyle, "rear-slot-drop");
  assert.ok(pegboardHooks.length > 0);
  assert.ok(pegboardBackplates.length > 0);
  assert.ok(pegboardHooks.every((box) => box.w <= 4.5));
  assert.ok(pegboardHooks.every((box) => box.y >= 0 && box.y + box.d <= pegboard.connectorDepth + 0.01));
  assert.ok(pegboard.positions.every((position) => position.y >= pegboard.connectorDepth));
  assert.ok(Math.min(...pegboardBases.map((box) => box.y)) >= pegboard.connectorDepth);
  assert.ok(pegboard.chunkCount > 1);
  assert.match(generator.safeFileName({ ...parameters, layoutMode: "pegboard" }, "Skadis makeup"), /pegboard\.stl$/);
  assert.match(generator.describe({ ...parameters, layoutMode: "pegboard" }), /pegboard makeup sheet/);
});

test("uploaded print, paint, and stitch generators are registered brands", () => {
  const printContext = resolvePlatformContext({ brandKey: "print" });
  assert.equal(printContext.brand.defaultGeneratorType, "uploaded_print");
  assert.equal(printContext.generator.type, "uploaded_print");
  const uploadedStl = "solid uploaded\nendsolid uploaded\n";
  const uploadedConfig = {
    uploadedFileName: "sample-token.stl",
    stlBase64: Buffer.from(uploadedStl).toString("base64"),
    outerWidth: 40,
    outerDepth: 35,
    height: 12,
    estimatedWeightGrams: 18,
    desiredColourKey: "blue",
    preferredPrinterProfileId: "printer-123"
  };
  const normalizedPrint = printContext.generator.normalizeParameters(uploadedConfig);
  assert.equal(normalizedPrint.desiredColourKey, "blue");
  assert.equal(normalizedPrint.preferredPrinterProfileId, "printer-123");
  assert.equal(printContext.generator.renderStl(uploadedConfig).toString(), uploadedStl);

  const paintContext = resolvePlatformContext({ brandKey: "paint" });
  assert.equal(paintContext.brand.defaultGeneratorType, "paint_station");
  assert.match(paintContext.generator.renderStl({ paintType: "citadel", paintCount: 12, columns: 4, brushSlots: 4 }), /^solid paint_station/);

  const stitchContext = resolvePlatformContext({ brandKey: "stitch" });
  assert.equal(stitchContext.brand.defaultGeneratorType, "stitch_organizer");
  assert.match(stitchContext.generator.renderStl({ threadRefs: ["310", "B5200", "666"], columns: 3 }), /^solid stitch_organizer/);
  const stitchThreads = [
    { number: "310", name: "Black" },
    { number: "321", name: "Red" },
    { number: "Blanc", name: "White" },
    { number: "742", name: "Tangerine" }
  ];
  const flossCard = stitchContext.generator.buildGeometry({ style: "floss-card", threads: stitchThreads, slotWidth: 6, slotDepth: 12 });
  const threadSlotTray = stitchContext.generator.buildGeometry({ style: "thread-slot-tray", threads: stitchThreads, columns: 2, slotWidth: 18, slotDepth: 42, labelTextSize: 10, engravingDepth: 1 });
  assert.equal(flossCard.config.style, "floss-card");
  assert.equal(threadSlotTray.config.style, "thread-slot-tray");
  assert.ok(flossCard.boxes.length > 20);
  assert.ok(threadSlotTray.outerWidth > flossCard.outerWidth);
  assert.equal(threadSlotTray.slots.length, stitchThreads.length);
  assert.equal(threadSlotTray.engravedLabels.length, stitchThreads.length);
  assert.ok(threadSlotTray.engravedLabels.every((label) => label.depth === 1 && label.voids > 0));
  threadSlotTray.engravedLabels.forEach((label, index) => {
    const slot = threadSlotTray.slots[index];
    assert.ok(label.y > slot.y + slot.d);
  });
  assert.equal(threadSlotTray.embeddedTray, undefined);
  const legacyWorkstation = stitchContext.generator.buildGeometry({ style: "workstation-tray", threads: stitchThreads });
  assert.equal(legacyWorkstation.config.style, "thread-slot-tray");
  assert.match(stitchContext.generator.safeFileName({ style: "floss-card", threads: stitchThreads }, "Threads"), /threads-floss-card-4-threads\.stl/);
  assert.match(stitchContext.generator.safeFileName({ style: "thread-slot-tray", threads: stitchThreads }, "Threads"), /threads-thread-slot-tray-4-threads\.stl/);
  assert.match(stitchContext.generator.describe({ style: "thread-slot-tray", threads: stitchThreads }), /engraved labels underneath each slot/);

  assert.ok(publicPlatformConfig.brands.some((candidate) => candidate.key === "print"));
  assert.ok(publicPlatformConfig.brands.some((candidate) => candidate.key === "paint"));
  assert.ok(publicPlatformConfig.brands.some((candidate) => candidate.key === "stitch"));
});

test("generator contract validates parameters and renders an STL", () => {
  const { generator } = resolvePlatformContext({ brandKey: "tray" });
  const source = {
    columns: 4, rows: 3, baseSize: 25, baseDepth: 25, gap: 1, clearance: 1,
    plateThickness: 2, lipEnabled: true, wallHeight: 3, wallThickness: 1.6,
    notchesEnabled: true, notchWidth: 2
  };
  const parameters = generator.normalizeParameters(source);
  const geometry = generator.buildGeometry(parameters);
  const geometryWithBases = generator.buildGeometry({ ...source, includeBases: true });
  assert.ok(geometry.materialCm3 > 0);
  assert.equal(geometryWithBases.boxes.length, geometry.boxes.length + 12);
  assert.equal(geometryWithBases.config.outputMode, "tray-and-bases");
  assert.equal(geometryWithBases.baseLayout.placements.length, 12);
  assert.ok(Math.max(geometryWithBases.outerWidth, geometryWithBases.outerDepth) / Math.min(geometryWithBases.outerWidth, geometryWithBases.outerDepth) < 1.25);
  assert.ok(geometryWithBases.materialCm3 > geometry.materialCm3);
  assert.match(generator.renderStl(parameters), /^solid movement_tray/);
  const basesOnlyGeometry = generator.buildGeometry({ ...source, outputMode: "bases-only" });
  assert.equal(basesOnlyGeometry.config.outputMode, "bases-only");
  assert.equal(basesOnlyGeometry.boxes.length, 12);
  assert.equal(basesOnlyGeometry.baseLayout.placements.length, 12);
  assert.match(generator.safeFileName(basesOnlyGeometry.config, "Bases"), /bases-4x3-25mm-bases-only\.stl/);
  const roundGeometry = generator.buildGeometry({ ...source, baseShape: "circle", baseSize: 32, baseDepth: 99, includeBases: true });
  assert.equal(roundGeometry.config.baseShape, "circle");
  assert.equal(roundGeometry.config.baseDepth, 32);
  assert.ok(roundGeometry.boxes.length > geometryWithBases.boxes.length);
  assert.match(generator.safeFileName(roundGeometry.config, "Round tray"), /round-tray-4x3-32mm-circle\.stl/);
  const largeOval = generator.normalizeParameters({ ...source, baseShape: "oval", baseSize: 170, baseDepth: 105 });
  assert.equal(largeOval.baseShape, "oval");
  assert.equal(largeOval.baseDepth, 105);
});

test("tray base layouts are shared between browser preview and server STL generation", async () => {
  const [html, appSource, generatorSource] = await Promise.all([
    readFile(new URL("../tray/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../platform/generators/movement-tray.mjs", import.meta.url), "utf8")
  ]);
  assert.match(html, /platform\/tray-layout\.js/);
  assert.match(appSource, /window\.trayLayout/);
  assert.match(generatorSource, /import trayLayout from "\.\.\/tray-layout\.js"/);
  assert.equal(trayLayout.normalizeTrayOutputMode({ includeBases: true }), "tray-and-bases");
  assert.equal(trayLayout.trayHasTray({ outputMode: "bases-only" }), false);
  assert.equal(trayLayout.packedLooseBaseLayout({ columns: 4, rows: 3, baseSize: 25, baseDepth: 25, gap: 1, outputMode: "tray-and-bases" }, 105, 80).placements.length, 12);
});

test("movement tray generator renders Really Useful Box storage inserts", () => {
  const { generator } = resolvePlatformContext({ brandKey: "tray" });
  const source = {
    mode: "storage_insert",
    boxKey: "rub-64l",
    boxName: "64 litre Really Useful Box",
    boxInternalLength: 605,
    boxInternalWidth: 370,
    boxInternalDepth: 280,
    insertUnits: [
      { id: "ungor", name: "Ungor Raiders", count: 20, copies: 1, baseSize: 25, baseDepth: 25 },
      { id: "bestigor", name: "Bestigor Herds", count: 20, copies: 1, baseSize: 30, baseDepth: 30 }
    ],
    insertMagnetHoles: true,
    includeBases: true,
    baseMagnetHoles: true,
    magnetHoleDiameter: 2
  };
  const geometry = generator.buildGeometry(source);
  assert.equal(geometry.config.mode, "storage_insert");
  assert.equal(geometry.slots.length, 40);
  assert.equal(geometry.split, true);
  assert.equal(geometry.regions.length, 4);
  assert.ok(geometry.boxes.length > geometry.slots.length);
  assert.match(generator.safeFileName(source, "Beasts box"), /beasts-box-rub-64l-insert-4-plates\.stl/);
  assert.match(generator.describe(source), /64 litre Really Useful Box insert for 40 models/);
  assert.match(generator.renderStl(source), /^solid movement_tray/);
  const shaped = generator.buildGeometry({
    ...source,
    boxKey: "custom",
    boxName: "Round base case",
    boxInternalLength: 180,
    boxInternalWidth: 140,
    insertUnits: [
      { id: "marine", name: "Intercessors", count: 1, copies: 1, baseShape: "circle", baseSize: 32, baseDepth: 99 },
      { id: "cavalry", name: "Cavalry", count: 1, copies: 1, baseShape: "oval", baseSize: 60, baseDepth: 35 }
    ],
    includeBases: true,
    insertMagnetHoles: false,
    baseMagnetHoles: true
  });
  assert.deepEqual(shaped.config.insertUnits.map((unit) => unit.baseShape), ["circle", "oval"]);
  assert.equal(shaped.config.insertUnits[0].baseDepth, 32);
  assert.deepEqual([...new Set(shaped.slots.map((slot) => slot.baseShape))].sort(), ["circle", "oval"]);
  assert.ok(shaped.boxes.length > 80);
});

test("marketplace payouts remain held until completion", async () => {
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.equal(marketplacePolicy.stripeChargeType, "separate_charges_and_transfers");
  assert.equal(marketplacePolicy.providerTransferStatus, "complete");
  assert.match(schema, /payout_status text not null default 'held'/);
  assert.match(schema, /provider_transfers/);
  assert.match(schema, /refund_locked_at/);
  assert.match(schema, /enforce_provider_transfer_completion/);
  assert.match(schema, /unique nulls not distinct \(user_id, entitlement_type, brand_key, generator_type\)/);
  assert.equal(customerCanCancel("order_made"), true);
  assert.equal(customerCanCancel("producing"), false);
  assert.equal(providerTransferEligible({ status: "posted", payoutStatus: "held" }), false);
  assert.equal(providerTransferEligible({ status: "complete", payoutStatus: "held" }), true);
  assert.throws(() => assertPrintJobTransition("producing", "refunded"));
});

test("printer quote filters cover customer selection fields", () => {
  const quotes = [
    { colourKey: "green", material: "pla", totalIncVatPence: 1200, leadTimeDays: 3, ratingAverage: 4.8, basedIn: "Leeds" },
    { colourKey: "black", material: "pla", totalIncVatPence: 900, leadTimeDays: 8, ratingAverage: 4.2, basedIn: "London" }
  ];
  assert.deepEqual(filterPrinterQuotes(quotes, { colourKey: "green", maximumLeadTimeDays: 5, minimumRating: 4.5 }), [quotes[0]]);
});

test("print estimates are calibrated against the Bambu P1S reference", () => {
  const oldPreviewCm3 = slicerCalibration.referencePreviewGrams / 1.24;
  assert.equal(generatedWeightGrams(oldPreviewCm3, "pla"), 78.8);
  const hours = estimatedPrintHours(slicerCalibration.referenceSlicerGrams, defaultPrintTimeModel.gramsPerHour, defaultPrintTimeModel.setupMinutes);
  assert.equal(printTimeLabel(hours), "1h 51m");
});

test("factory portal keeps completion and payout release outside printer controls", async () => {
  const [html, factorySource, serverSource, stripeClientSource, renderBlueprint] = await Promise.all([
    readFile(new URL("../factory/index.html", import.meta.url), "utf8"),
    readFile(new URL("../factory/factory.js", import.meta.url), "utf8"),
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../server/stripe-client.mjs", import.meta.url), "utf8"),
    readFile(new URL("../render.yaml", import.meta.url), "utf8")
  ]);
  assert.match(html, /id="factoryLoginForm"/);
  assert.match(html, /id="createFactoryAccount"/);
  assert.match(factorySource, /data-start-job/);
  assert.match(factorySource, /data-mark-posted/);
  assert.match(factorySource, /data-decline-job/);
  assert.doesNotMatch(factorySource, /data-complete-print-job/);
  assert.match(factorySource, /data-job-label/);
  assert.match(factorySource, /data-job-stl/);
  assert.match(factorySource, /data-save-job-note/);
  assert.match(factorySource, /status !== "pending_payment"/);
  assert.match(serverSource, /Printers can only mark jobs as producing or posted/);
  assert.match(serverSource, /\/v1\/refunds/);
  assert.match(serverSource, /payment_intent: order\.stripe_payment_intent_id/);
  assert.match(serverSource, /Choose a rating from 1 to 5 before confirming delivery/);
  assert.match(serverSource, /autoCompleteStalePostedJobs/);
  assert.match(serverSource, /PRINT_AUTO_COMPLETE_DAYS/);
  assert.match(serverSource, /TASK_RUNNER_SECRET/);
  assert.match(serverSource, /\/api\/tasks\/auto-complete-posted/);
  assert.match(serverSource, /status: "pending_review", accepting_jobs: false/);
  assert.match(serverSource, /\/v2\/core\/accounts/);
  assert.match(serverSource, /include\[0\]=configuration\.recipient&include\[1\]=requirements/);
  assert.doesNotMatch(serverSource, /include\[\]=/);
  assert.match(serverSource, /\/v1\/transfers/);
  assert.doesNotMatch(serverSource, /requirements_collector: "stripe"/);
  assert.match(serverSource, /print-job-transfer-\$\{job\.id\}/);
  assert.match(serverSource, /assertPrintJobTransition\(job\.status, "complete"\)/);
  assert.match(serverSource, /\/api\/marketplace\/quotes/);
  assert.match(serverSource, /payment_intent_data\[transfer_group\]/);
  assert.match(serverSource, /createStripeClient/);
  assert.match(stripeClientSource, /"Stripe-Version": stripeApiVersion/);
  assert.match(stripeClientSource, /stripeEventVerified/);
  assert.doesNotMatch(serverSource, /MARKETPLACE_INCLUDE_PENDING !== "false"/);
  assert.doesNotMatch(serverSource, /DOWNLOAD_TOKEN_SECRET \|\| stripeKey/);
  assert.doesNotMatch(serverSource, /fetch\(`\$\{stripeApiBase\}\/v1\/checkout\/sessions/);
  assert.doesNotMatch(serverSource, /const brandEntries =/);
  assert.match(renderBlueprint, /healthCheckPath: \/api\/health/);
  assert.match(renderBlueprint, /SUPABASE_SECRET_KEY/);
  assert.match(renderBlueprint, /STRIPE_SECRET_KEY/);
  assert.match(renderBlueprint, /CHECKOUT_ALLOWED_ORIGIN/);
});
