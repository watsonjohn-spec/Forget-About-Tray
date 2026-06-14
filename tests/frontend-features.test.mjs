import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

test("catalogue covers main and legacy armies with square and rectangular bases", async () => {
  const source = await readFile(new URL("catalogue.js", root), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const catalogue = context.window.baseCatalogue;
  const armies = new Set(catalogue.map((entry) => entry.army));

  assert.ok(catalogue.length >= 170);
  assert.ok(armies.size >= 17);
  assert.ok(catalogue.some((entry) => entry.width === entry.depth));
  assert.ok(catalogue.some((entry) => entry.width !== entry.depth));
  assert.ok(catalogue.some((entry) => entry.army === "High Elf Realms" && entry.name === "White Lions of Chrace"));
});

test("base shape controls and shared catalogue are present", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8")
  ]);

  assert.match(html, /data-base-shape="square"/);
  assert.match(html, /data-base-shape="rectangle"/);
  for (const length of [50, 60, 75, 100, 150]) assert.match(html, new RegExp(`<option value="${length}">${length} mm</option>`));
  assert.match(html, /id="openSingleCatalogue"/);
  assert.match(html, /id="catalogueArmyFilter"/);
  assert.match(app, /if \(state\.baseShape === "square"\) \{\s*state\.baseDepth = state\.baseSize;/);
  assert.match(app, /input\.getAttribute\("min"\)/);
  assert.match(app, /function rectangleDepth\(width, preferred\)/);
  assert.match(app, /function applyCatalogueEntry\(entry, count = 10\)/);
  assert.match(app, /catalogueContext === "single"/);
});

test("account dropdown and Supabase OAuth controls are wired", async () => {
  const [html, app, account] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("account.js", root), "utf8")
  ]);

  assert.match(html, /id="accountMenu"/);
  assert.match(html, /data-account-view="profile"/);
  assert.match(html, /data-account-view="password"/);
  assert.match(html, /data-account-view="orders"/);
  assert.match(html, /data-oauth-provider="google"/);
  assert.match(html, /data-oauth-provider="apple"/);
  assert.match(app, /accountService\.updatePassword\(password\)/);
  assert.match(app, /accountService\.signInWithProvider\(button\.dataset\.oauthProvider\)/);
  assert.match(account, /async function signInWithProvider\(provider\)/);
  assert.match(account, /\/auth\/v1\/authorize/);
});
