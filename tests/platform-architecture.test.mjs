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
  const [html, factorySource, serverSource] = await Promise.all([
    readFile(new URL("../factory/index.html", import.meta.url), "utf8"),
    readFile(new URL("../factory/factory.js", import.meta.url), "utf8"),
    readFile(new URL("../server.mjs", import.meta.url), "utf8")
  ]);
  assert.match(html, /id="factoryLoginForm"/);
  assert.match(html, /id="createFactoryAccount"/);
  assert.match(factorySource, /data-job-status="producing"/);
  assert.match(factorySource, /data-job-status="posted"/);
  assert.doesNotMatch(factorySource, /data-job-status="complete"/);
  assert.match(serverSource, /Printers can only mark jobs as producing or posted/);
  assert.match(serverSource, /status: "pending_review", accepting_jobs: false/);
});
