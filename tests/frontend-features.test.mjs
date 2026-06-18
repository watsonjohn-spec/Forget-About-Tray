import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

function storageMock(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

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
    readFile(new URL("tray/index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8")
  ]);

  assert.match(html, /data-base-shape="square"/);
  assert.match(html, /data-base-shape="rectangle"/);
  assert.match(html, /data-base-shape="circle"/);
  assert.match(html, /data-base-shape="oval"/);
  for (const width of [32, 75, 90, 105, 160, 170]) assert.match(html, new RegExp(`data-base="${width}"`));
  for (const length of [50, 60, 75, 100, 150]) assert.match(html, new RegExp(`<option value="${length}">${length} mm</option>`));
  for (const length of [35, 42, 52, 70, 92, 105]) assert.match(html, new RegExp(`<option value="${length}">${length} mm</option>`));
  assert.match(html, /id="openSingleCatalogue"/);
  assert.match(html, /id="catalogueArmyFilter"/);
  assert.match(app, /function baseDepthForShape\(shape, width, preferred\)/);
  assert.match(app, /shapeLocksDepth\(state\.baseShape\)/);
  assert.match(app, /input\.getAttribute\("min"\)/);
  assert.match(app, /function rectangleDepth\(width, preferred\)/);
  assert.match(app, /function applyCatalogueEntry\(entry, count = 10\)/);
  assert.match(app, /catalogueContext === "single"/);
});

test("account dropdown and Supabase OAuth controls are wired", async () => {
  const [html, app, account, publicConfigSource] = await Promise.all([
    readFile(new URL("tray/index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("account.js", root), "utf8"),
    readFile(new URL("public-config.js", root), "utf8")
  ]);

  assert.match(html, /id="accountMenu"/);
  assert.match(html, /data-account-view="profile"/);
  assert.match(html, /data-account-view="password"/);
  assert.match(html, /data-account-view="orders"/);
  assert.match(html, /data-oauth-provider="google"/);
  assert.match(html, /data-oauth-provider="apple"[^>]*hidden/);
  assert.match(html, /id="oauthStatus"/);
  assert.match(app, /accountService\.updatePassword\(password\)/);
  assert.match(app, /accountService\.signInWithProvider\(button\.dataset\.oauthProvider\)/);
  assert.match(app, /accountService\.providerAvailability\(\)/);
  assert.match(account, /async function signInWithProvider\(provider\)/);
  assert.match(account, /enabledOauthProviders = new Set\(\["google"\]\)/);
  assert.match(account, /window\.MOVEMENT_TRAY_PUBLIC_CONFIG/);
  assert.match(account, /\/auth\/v1\/authorize/);

  const context = { window: {} };
  vm.runInNewContext(publicConfigSource, context);
  assert.deepEqual(Object.keys(context.window.MOVEMENT_TRAY_PUBLIC_CONFIG).sort(), ["supabasePublishableKey", "supabaseUrl"]);
  assert.doesNotMatch(publicConfigSource, /sb_secret_|sk_(?:test|live)_|rk_(?:test|live)_|whsec_/);
});

test("login surfaces keep shared account actions across brands and factory", async () => {
  const [trayHtml, trayApp, makeupHtml, makeupApp, factoryHtml, factoryApp, architecture] = await Promise.all([
    readFile(new URL("tray/index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("makeup/index.html", root), "utf8"),
    readFile(new URL("makeup/makeup.js", root), "utf8"),
    readFile(new URL("factory/index.html", root), "utf8"),
    readFile(new URL("factory/factory.js", root), "utf8"),
    readFile(new URL("platform/ARCHITECTURE.md", root), "utf8")
  ]);
  const surfaces = [trayHtml, makeupHtml, factoryHtml];
  for (const html of surfaces) {
    assert.match(html, /class="login-divider"/);
    assert.match(html, /data-oauth-provider="google"/);
    assert.match(html, /data-oauth-provider="apple"[^>]*hidden/);
    assert.match(html, /id="oauthStatus"/);
    assert.match(html, />Create account</);
    assert.match(html, />Forgot password</);
    assert.match(html, /Email confirmation is required/);
  }
  for (const source of [trayApp, makeupApp, factoryApp]) {
    assert.match(source, /accountService\.providerAvailability\(\)/);
    assert.match(source, /button\.hidden = configured === false/);
    assert.match(source, /accountService\.signInWithProvider\(button\.dataset\.oauthProvider\)/);
    assert.match(source, /accountService\.resetPassword\(email\)/);
    assert.match(source, /accountService\.authType\(\) === "recovery"/);
  }
  assert.match(architecture, /Login surfaces must stay functionally and structurally identical/);
  assert.match(architecture, /enabled OAuth providers/);
});

test("makeup and factory OAuth keep users on the originating app after provider sign-in", async () => {
  const account = await readFile(new URL("account.js", root), "utf8");
  const sessionStorage = storageMock();
  const assigned = [];
  const context = {
    URL,
    URLSearchParams,
    window: {
      MOVEMENT_TRAY_PUBLIC_CONFIG: { supabaseUrl: "https://supabase.test", supabasePublishableKey: "anon-key" },
      platformService: { brandKey: () => "makeup", generatorType: () => "makeup_caddy" },
      location: {
        origin: "https://app.test",
        pathname: "/makeup",
        search: "",
        hash: "",
        assign: (url) => assigned.push(url)
      }
    },
    sessionStorage,
    localStorage: storageMock(),
    history: { replaceState: () => {} }
  };

  vm.runInNewContext(account, context);
  await context.window.accountService.signInWithProvider("google");

  const authUrl = new URL(assigned[0]);
  assert.equal(authUrl.searchParams.get("redirect_to"), "https://app.test/makeup/");
  assert.equal(sessionStorage.getItem("forget-about-pending-auth-return"), "/makeup/");

  let replaced = "";
  context.window.location.pathname = "/tray";
  context.window.location.hash = "#access_token=abc&refresh_token=def&expires_in=3600";
  context.window.location.replace = (url) => { replaced = url; };

  await context.window.accountService.init();

  assert.equal(replaced, "https://app.test/makeup/#access_token=abc&refresh_token=def&expires_in=3600");
  assert.equal(sessionStorage.getItem("forget-about-pending-auth-return"), null);

  const factorySessionStorage = storageMock();
  const factoryAssigned = [];
  const factoryContext = {
    URL,
    URLSearchParams,
    window: {
      MOVEMENT_TRAY_PUBLIC_CONFIG: { supabaseUrl: "https://supabase.test", supabasePublishableKey: "anon-key" },
      location: {
        origin: "https://app.test",
        pathname: "/factory",
        search: "",
        hash: "",
        assign: (url) => factoryAssigned.push(url)
      }
    },
    sessionStorage: factorySessionStorage,
    localStorage: storageMock(),
    history: { replaceState: () => {} }
  };

  vm.runInNewContext(account, factoryContext);
  await assert.rejects(
    factoryContext.window.accountService.signInWithProvider("apple"),
    /Apple sign-in is not available yet/
  );
  await factoryContext.window.accountService.signInWithProvider("google");

  const factoryAuthUrl = new URL(factoryAssigned[0]);
  assert.equal(factoryAuthUrl.searchParams.get("redirect_to"), "https://app.test/factory/");
  assert.equal(factorySessionStorage.getItem("forget-about-pending-auth-return"), "/factory/");

  let factoryReplaced = "";
  factoryContext.window.location.pathname = "/";
  factoryContext.window.location.hash = "#access_token=abc&refresh_token=def&expires_in=3600";
  factoryContext.window.location.replace = (url) => { factoryReplaced = url; };

  await factoryContext.window.accountService.init();

  assert.equal(factoryReplaced, "https://app.test/factory/#access_token=abc&refresh_token=def&expires_in=3600");
  assert.equal(factorySessionStorage.getItem("forget-about-pending-auth-return"), null);
});

test("UAT shell keeps primary actions visible and separates account pages", async () => {
  const [html, css, app] = await Promise.all([
    readFile(new URL("tray/index.html", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
    readFile(new URL("app.js", root), "utf8")
  ]);

  assert.match(html, /id="brandHome"/);
  assert.match(html, /class="button top-action-button" id="savePresetTop"/);
  assert.match(html, /class="button top-action-button" id="exportTop"/);
  assert.match(html, /class="button top-action-button account-menu-button" id="accountButton"/);
  assert.match(html, /id="filamentColour"/);
  assert.match(html, /print-estimates\.js/);
  assert.match(html, /name="printOutputMode"/);
  assert.match(html, /value="bases-only"/);
  assert.match(html, /data-mode="storage"/);
  assert.match(html, /id="storageBoxSelect"/);
  assert.match(html, /id="storageWallHeightPreset"/);
  assert.match(html, /name="storageInsertMagnets"/);
  assert.match(html, /id="storageIncludeBases"/);
  assert.match(html, /id="catalogueSystemFilter"/);
  assert.match(html, /id="chooseEmailExport"/);
  assert.match(html, /meta name="checkout-api-url" content="https:\/\/forget-about-tray\.onrender\.com"/);
  assert.match(html, /data-account-page="profile"/);
  assert.match(html, /data-account-page="password"/);
  assert.match(html, /data-account-page="orders"/);
  assert.doesNotMatch(html, />Isometric preview</);
  assert.doesNotMatch(html, /Your configurations are saved to your workshop account/);
  assert.match(css, /100dvh/);
  assert.match(css, /\.top-action-button/);
  assert.match(app, /packedLooseBaseLayout/);
  assert.match(app, /input\[name="printOutputMode"\]/);
  assert.match(app, /forgetPrintEstimates\.generatedWeightGrams\(metrics\.volume \/ 1000, state\.filamentMaterial\)/);
  assert.match(app, /window\.location\.href = `mailto:/);
  assert.match(app, /window\.confirm\("Request account deletion\?/);
  assert.match(app, /Confirm delivery and complete order/);
  assert.match(app, /releases the printer payout/);
});

test("UAT2 previews, explicit login, factory workflow, and makeup account tools are wired", async () => {
  const [trayHtml, trayApp, account, factoryHtml, factoryApp, makeupHtml, makeupApp, preview3d] = await Promise.all([
    readFile(new URL("tray/index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("account.js", root), "utf8"),
    readFile(new URL("factory/index.html", root), "utf8"),
    readFile(new URL("factory/factory.js", root), "utf8"),
    readFile(new URL("makeup/index.html", root), "utf8"),
    readFile(new URL("makeup/makeup.js", root), "utf8"),
    readFile(new URL("preview-3d.js", root), "utf8")
  ]);
  assert.match(account, /forget-about-active-session/);
  assert.match(account, /sessionStorage\.getItem\(activeSessionKey\)/);
  assert.match(trayHtml, /data-preview-turn="-1"/);
  assert.match(trayHtml, /id="filamentMaterial"/);
  assert.match(trayApp, /filamentColours\.filter\(\(colour\) => colour\.material === material\)/);
  assert.match(trayApp, /data-army-field="includeBases"/);
  assert.match(trayApp, /const storageInsertMode = "storage_insert"/);
  assert.match(trayApp, /const storageBaseShapes = \["square", "rectangle", "circle", "oval"\]/);
  assert.match(trayApp, /64 litre Really Useful Box/);
  assert.match(trayApp, /openStorageCatalogue/);
  assert.match(trayApp, /baseMagnetHoles/);
  assert.match(trayApp, /data-storage-field="baseShape"/);
  assert.match(trayApp, /warhammer40000Catalogue/);
  assert.match(trayApp, /Warhammer 40,000/);
  assert.match(trayApp, /ageOfSigmarCatalogue/);
  assert.match(trayApp, /Warhammer Age of Sigmar/);
  assert.match(trayApp, /ovalBaseSizes/);
  assert.match(trayApp, /storageDepthPresets/);
  assert.match(trayApp, /data-storage-move/);
  assert.match(trayApp, /storageValidationMessages/);
  assert.match(trayApp, /effectiveStoragePrintVolumeMm3/);
  assert.match(trayApp, /<ellipse cx="\$\{cx\}" cy="\$\{cy\}"/);
  assert.match(trayApp, /checkout\/print\/verify/);
  assert.match(factoryHtml, /id="capabilityGramsPerHour"/);
  assert.match(factoryHtml, /id="factoryCalcTime"/);
  assert.match(factoryHtml, /value="78\.78"/);
  assert.match(factoryHtml, /id="capabilityPostage"/);
  assert.match(factoryApp, /status !== "pending_payment"/);
  assert.match(factoryApp, /data-job-label/);
  assert.match(factoryApp, /renderTimeCalculator/);
  assert.match(factoryApp, /printTimeLabel/);
  assert.match(makeupHtml, /data-layout-mode="staircase"/);
  assert.match(makeupHtml, /data-layout-mode="pegboard"/);
  assert.match(makeupHtml, /id="handleEnabled" type="checkbox" checked disabled/);
  assert.match(makeupHtml, /id="balanceCatchalls" type="checkbox" checked/);
  assert.match(makeupHtml, /id="stepRiseField"/);
  assert.match(makeupHtml, /id="pegboardFields"/);
  assert.match(makeupHtml, /data-account-tab="orders"/);
  assert.match(makeupApp, /state\.handleEnabled = true/);
  assert.match(makeupApp, /balanceCatchalls: true/);
  assert.match(makeupApp, /function caddyCatchalls/);
  assert.match(makeupApp, /function staircaseCatchalls/);
  assert.match(makeupApp, /kind: "catchall"/);
  assert.match(makeupApp, /outerWidth = Math\.max\(\.\.\.sideLengths\) \+ state\.wallThickness \* 2/);
  assert.match(makeupApp, /state\.layoutMode === "pegboard"/);
  assert.match(makeupApp, /splitPegboardBoxes/);
  assert.match(makeupApp, /function previewTransform\(metric\)/);
  assert.match(makeupApp, /function visibleBoxFaces\(box, transform, colour, opacity, boxIndex\)/);
  assert.match(makeupApp, /\.sort\(\(a, b\) => a\.depth - b\.depth\)/);
  assert.match(makeupApp, /Math\.max\(\.\.\.holderHeights, state\.handleHeight \* 0\.55\)/);
  assert.match(makeupApp, /data-complete-print-job/);
  assert.match(makeupApp, /data-send-job-message/);
  assert.match(makeupApp, /checkout\/print\/verify/);
  assert.match(trayApp, /data-job-rating/);
  assert.match(trayApp, /data-send-job-message/);
  assert.match(factoryApp, /Decline job and refund buyer/);
  assert.match(preview3d, /window\.forgetPreview3d/);
  assert.match(preview3d, /function createTurntable\(svg, render, options = \{\}\)/);
  assert.match(preview3d, /function renderBoxes\(svg, options\)/);
  assert.match(preview3d, /function cylinderFaces\(cylinder, transform, fallbackColour, opacity, index\)/);
});

test("site shell, footer, and prototype generators are present", async () => {
  const [homeHtml, rootIndexHtml, footerCss, footerJs, printHtml, paintHtml, stitchHtml, printJs, paintJs, stitchJs, generatorQuotes, serverSource, uploadedPrint] = await Promise.all([
    readFile(new URL("home.html", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("site-wide.css", root), "utf8"),
    readFile(new URL("site-wide.js", root), "utf8"),
    readFile(new URL("print/index.html", root), "utf8"),
    readFile(new URL("paint/index.html", root), "utf8"),
    readFile(new URL("stitch/index.html", root), "utf8"),
    readFile(new URL("print/print.js", root), "utf8"),
    readFile(new URL("paint/paint.js", root), "utf8"),
    readFile(new URL("stitch/stitch.js", root), "utf8"),
    readFile(new URL("generator-quotes.js", root), "utf8"),
    readFile(new URL("server.mjs", root), "utf8"),
    readFile(new URL("platform/generators/uploaded-print.mjs", root), "utf8")
  ]);
  assert.match(rootIndexHtml, /Generator directory/);
  assert.match(homeHtml, /href="tray\/"/);
  assert.match(homeHtml, /href="print\/"/);
  assert.match(homeHtml, /href="paint\/"/);
  assert.match(homeHtml, /href="stitch\/"/);
  assert.match(footerJs, /help@forget\.im/);
  assert.match(footerJs, /Modern slavery statement/);
  assert.match(footerCss, /\.site-footer/);
  assert.match(printHtml, /Forget About Print/);
  assert.match(printHtml, /preview-3d\.js/);
  assert.match(printHtml, /print-estimates\.js/);
  assert.match(printHtml, /data-preview-turn="-1"/);
  assert.match(printHtml, /id="filamentColour"/);
  assert.match(printHtml, /id="printerPreference"/);
  assert.match(printJs, /stlBase64/);
  assert.match(printJs, /function parseStlMesh\(buffer\)/);
  assert.match(printJs, /function parseAsciiStlMesh\(text\)/);
  assert.match(printJs, /function renderStlMeshPreview\(svg, mesh, colour, view = \{\}\)/);
  assert.match(printJs, /parseBinaryBounds/);
  assert.match(printJs, /forgetPreview3d\.renderBoxes/);
  assert.match(printJs, /forgetPreview3d\.createTurntable/);
  assert.match(printJs, /preferredPrinterProfileId: document\.getElementById\("printerPreference"\)\.value/);
  assert.match(generatorQuotes, /function setPrinterFilter\(profileId = ""\)/);
  assert.match(generatorQuotes, /quoteTimeLabel/);
  assert.match(serverSource, /preferredPrinterProfileId/);
  assert.match(serverSource, /desiredColourKey/);
  assert.match(uploadedPrint, /desiredColourKey/);
  assert.match(uploadedPrint, /preferredPrinterProfileId/);
  assert.match(paintHtml, /Forget About Paint/);
  assert.match(paintHtml, /preview-3d\.js/);
  assert.match(paintHtml, /print-estimates\.js/);
  assert.match(paintHtml, /data-preview-turn="-1"/);
  assert.match(paintJs, /paintConfig/);
  assert.match(paintJs, /brushSlots/);
  assert.match(paintJs, /paintPreviewGeometry/);
  assert.match(paintJs, /forgetPreview3d\.renderBoxes/);
  assert.match(paintJs, /forgetPreview3d\.createTurntable/);
  assert.match(paintJs, /forgetPrintEstimates\.generatedWeightGrams/);
  assert.match(stitchHtml, /Forget About Stitch/);
  assert.match(stitchHtml, /preview-3d\.js/);
  assert.match(stitchHtml, /print-estimates\.js/);
  assert.match(stitchHtml, /id="layoutStyle"/);
  assert.match(stitchHtml, /value="floss-card"/);
  assert.match(stitchHtml, /value="workstation-tray"/);
  assert.match(stitchHtml, /data-preview-turn="-1"/);
  assert.match(stitchJs, /stitchConfig/);
  assert.match(stitchJs, /threads: parseThreads/);
  assert.match(stitchJs, /function flossCardPreviewGeometry\(config\)/);
  assert.match(stitchJs, /function workstationPreviewGeometry\(config\)/);
  assert.match(stitchJs, /stitchPreviewGeometry/);
  assert.match(stitchJs, /forgetPreview3d\.textLabel/);
  assert.match(stitchJs, /forgetPreview3d\.createTurntable/);
  assert.match(stitchJs, /forgetPrintEstimates\.generatedWeightGrams/);
});
