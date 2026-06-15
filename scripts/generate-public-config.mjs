import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const envText = readFileSync(new URL(".env", root), "utf8");
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

const config = {
  supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ""),
  supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY
};

writeFileSync(
  new URL("public-config.js", root),
  `// Generated from public-only .env values. Safe to serve to browsers.\nwindow.MOVEMENT_TRAY_PUBLIC_CONFIG = ${JSON.stringify(config)};\n`
);

console.log("Generated public-config.js");
