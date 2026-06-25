import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { publicPlatformConfig } from "../platform/registry.mjs";

const root = new URL("../", import.meta.url);
const envPath = new URL(".env", root);
const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const env = Object.fromEntries(envText
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));

if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in .env before publishing.");
}

function cleanOrigin(value) {
  return String(value || "https://forgetabout.im").trim().replace(/\/$/, "");
}

function envBoolean(name, fallback) {
  if (!(name in env)) return fallback;
  return !["0", "false", "no", "off"].includes(String(env[name]).trim().toLowerCase());
}

function envList(name, fallback) {
  const source = env[name] || fallback;
  return String(source || "")
    .split(",")
    .map((value) => value.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

const productionOrigin = cleanOrigin(env.PRODUCTION_ORIGIN);
const launch = {
  mvpModeEnabled: envBoolean("MVP_LAUNCH_MODE", true),
  publicPaths: envList("LAUNCH_PUBLIC_PATHS", "trays,print,factory"),
  deferredPaths: envList("LAUNCH_DEFERRED_PATHS", "makeup,paint,stitch"),
  launchHoldExcludedPaths: envList("LAUNCH_HOLD_EXCLUDED_PATHS", "hub"),
  factoryLaunchHoldEnabled: envBoolean("FACTORY_LAUNCH_HOLD_ENABLED", true)
};
const config = {
  supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ""),
  supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
  apiBaseUrl: (env.PUBLIC_API_BASE_URL || env.CHECKOUT_API_URL || "https://forget-about-tray.onrender.com").replace(/\/$/, ""),
  analytics: {
    ga4MeasurementId: env.GA4_MEASUREMENT_ID || "G-NDKFRQ10CJ",
    clarityProjectId: env.CLARITY_PROJECT_ID || "xc7u4g2p1w",
    cookieConsentRequired: envBoolean("COOKIE_CONSENT_REQUIRED", true),
    launchHoldEnabled: envBoolean("LAUNCH_HOLD_ENABLED", true),
    productionOrigin
  },
  launch
};

writeFileSync(
  new URL("public-config.js", root),
  `// Generated from public-only configuration. Safe to serve to browsers.\nwindow.MOVEMENT_TRAY_PUBLIC_CONFIG = ${JSON.stringify(config)};\nwindow.FORGET_ABOUT_PLATFORM_CONFIG = ${JSON.stringify(publicPlatformConfig)};\n`
);

const excludedRouteDirectories = new Set([
  ".agents",
  ".codex",
  ".deploy-git",
  ".git",
  ".github",
  ".tools",
  "platform",
  "scripts",
  "server",
  "supabase",
  "tests"
]);
const routeAliases = new Map([["tray", "trays"]]);

function publicRoutes() {
  const routes = new Set(["/"]);
  const allowed = new Set(launch.publicPaths);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || excludedRouteDirectories.has(entry.name)) continue;
    const indexPath = new URL(`${entry.name}/index.html`, root);
    if (!existsSync(indexPath)) continue;
    const route = routeAliases.get(entry.name) || entry.name;
    if (!launch.mvpModeEnabled || allowed.has(route)) routes.add(`/${route}/`);
  }
  return [...routes].sort((a, b) => a.localeCompare(b));
}

const generatedAt = new Date().toISOString().slice(0, 10);
const urls = publicRoutes();
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((route) => `  <url>\n    <loc>${productionOrigin}${route}</loc>\n    <lastmod>${generatedAt}</lastmod>\n  </url>`).join("\n")}\n</urlset>\n`;
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${productionOrigin}/sitemap.xml\n`;

writeFileSync(new URL("sitemap.xml", root), sitemap);
writeFileSync(new URL("robots.txt", root), robots);

console.log("Generated public-config.js, sitemap.xml, and robots.txt");
