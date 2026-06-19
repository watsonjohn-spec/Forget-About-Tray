import { createHmac, timingSafeEqual } from "node:crypto";

export function createStripeClient({
  stripeKey = "",
  allowLiveStripe = false,
  stripeApiBase = "https://api.stripe.com",
  stripeApiVersion = "2026-05-27.dahlia",
  stripeWebhookSecret = ""
} = {}) {
  function stripeReady() {
    const testKey = stripeKey.startsWith("sk_test_") || stripeKey.startsWith("rk_test_");
    const liveKey = stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_");
    if ((!testKey && !liveKey) || stripeKey.includes("replace_me")) return { ready: false, reason: "Stripe server key is not configured." };
    if (liveKey && !allowLiveStripe) return { ready: false, reason: "Live Stripe payments are disabled until ALLOW_LIVE_STRIPE=true." };
    return { ready: true, mode: liveKey ? "live" : "test" };
  }

  async function stripeJson(path, options = {}) {
    const response = await fetch(`${stripeApiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Version": stripeApiVersion,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || body.message || "Stripe request failed.");
    return body;
  }

  async function stripeForm(path, parameters, options = {}) {
    const response = await fetch(`${stripeApiBase}${path}`, {
      method: options.method || "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Version": stripeApiVersion,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(options.headers || {})
      },
      body: parameters
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || body.message || "Stripe request failed.");
    return body;
  }

  function stripeEventVerified(rawBody, signatureHeader) {
    if (!stripeWebhookSecret || !signatureHeader) return false;
    const parts = signatureHeader.split(",").map((part) => part.trim().split("="));
    const timestamp = parts.find(([key]) => key === "t")?.[1];
    const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
    if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
    return stripeWebhookSecret.split(",").map((secret) => secret.trim()).filter(Boolean).some((secret) => {
      const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
      return signatures.some((signature) => {
        const received = Buffer.from(signature, "hex");
        return expected.length === received.length && timingSafeEqual(expected, received);
      });
    });
  }

  return { stripeReady, stripeJson, stripeForm, stripeEventVerified };
}
