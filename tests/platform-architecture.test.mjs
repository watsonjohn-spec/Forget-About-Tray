import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { marketplacePolicy, publicPlatformConfig, resolvePlatformContext } from "../platform/registry.mjs";
import { assertPrintJobTransition, customerCanCancel, filterPrinterQuotes, providerTransferEligible } from "../platform/print-factory.mjs";

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
  assert.ok(geometry.boxes.length > 10);
  assert.equal(generator.normalizeParameters({ ...parameters, handleEnabled: false }).handleEnabled, true);
  assert.equal(geometry.config.handleEnabled, true);
  assert.equal(geometry.spineWidth, 10);
  assert.equal(geometry.spineY, 27);
  assert.equal(geometry.outerWidth, 45);
  assert.equal(geometry.outerDepth, 72);
  assert.equal(geometry.positions[0].y + geometry.positions[0].slotDepth, geometry.spineY);
  assert.equal(geometry.positions[1].y, geometry.spineY + geometry.spineWidth);
  assert.match(generator.renderStl(parameters), /^solid makeup_caddy/);
  assert.match(generator.safeFileName(parameters, "Dressing table"), /2-slots-handle\.stl$/);
  const staircase = generator.buildGeometry({ ...parameters, items: [...parameters.items, { ...parameters.items[1], id: "foundation-two" }], layoutMode: "staircase", maxSpineLength: 100, stepRise: 22 });
  assert.ok(staircase.positions.some((position) => position.z > 0));
  assert.ok(staircase.height > geometry.config.baseThickness);
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
  assert.ok(geometryWithBases.materialCm3 > geometry.materialCm3);
  assert.match(generator.renderStl(parameters), /^solid movement_tray/);
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

test("factory portal keeps completion and payout release outside printer controls", async () => {
  const [html, factorySource, serverSource, renderBlueprint] = await Promise.all([
    readFile(new URL("../factory/index.html", import.meta.url), "utf8"),
    readFile(new URL("../factory/factory.js", import.meta.url), "utf8"),
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
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
  assert.match(renderBlueprint, /healthCheckPath: \/api\/health/);
  assert.match(renderBlueprint, /SUPABASE_SECRET_KEY/);
  assert.match(renderBlueprint, /STRIPE_SECRET_KEY/);
  assert.match(renderBlueprint, /CHECKOUT_ALLOWED_ORIGIN/);
});
