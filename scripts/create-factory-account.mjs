import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const env = Object.fromEntries(readFileSync(new URL(".env", root), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));

const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
const secretKey = env.SUPABASE_SECRET_KEY || "";
const email = env.FACTORY_PROTOTYPE_EMAIL || "factory.prototype@forgetabout.im";
const password = `Print-${randomBytes(9).toString("base64url")}!`;

if (!supabaseUrl || !secretKey || secretKey.includes("replace_me")) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.");
}

const headers = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  "Content-Type": "application/json"
};

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.msg || body.error || `Supabase returned ${response.status}.`);
  return body;
}

const users = await responseJson(await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers }));
const existing = users.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  await responseJson(await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(existing.id)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password, email_confirm: true, user_metadata: { ...existing.user_metadata, signup_surface: "factory", prototype_account: true } })
  }));
} else {
  await responseJson(await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { signup_surface: "factory", prototype_account: true } })
  }));
}

console.log("");
console.log("Factory prototype login ready");
console.log(`Email: ${email}`);
console.log(`Password: ${password}`);
console.log("");
console.log("Open /factory/ and sign in with these credentials.");
