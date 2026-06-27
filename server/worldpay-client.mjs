import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function basicAuthorization(username, password) {
  if (!username || !password) return "";
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function signatureCandidates(header = "") {
  const value = String(header || "").trim();
  if (!value) return [];
  return value
    .split(",")
    .flatMap((part) => {
      const trimmed = part.trim();
      const candidates = [trimmed];
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex >= 0) candidates.push(trimmed.slice(equalsIndex + 1).trim());
      const worldpayParts = trimmed.split("/");
      if (worldpayParts.length >= 3 && worldpayParts[1]?.toUpperCase() === "SHA256") {
        candidates.push(worldpayParts.slice(2).join("/").trim());
      }
      return candidates;
    })
    .map((part) => part.trim())
    .filter(Boolean);
}

export function createWorldpayClient({
  apiBase = "https://try.access.worldpay.com",
  environment = "try",
  allowLiveWorldpay = false,
  merchantEntity = "",
  authorization = "",
  username = "",
  password = "",
  webhookSecret = "",
  narrativeLine1 = "Forget About",
  customisationId = ""
} = {}) {
  const normalizedEnvironment = String(environment || "try").toLowerCase();
  const authorizationHeader = authorization || basicAuthorization(username, password);

  function worldpayReady() {
    const liveMode = normalizedEnvironment === "live" || /access\.worldpay\.com$/i.test(apiBase);
    if (liveMode && !allowLiveWorldpay) {
      return { ready: false, provider: "worldpay", label: "Worldpay", mode: "live", reason: "Worldpay live mode is disabled until ALLOW_LIVE_WORLDPAY=true." };
    }
    if (!merchantEntity || merchantEntity.includes("replace_me")) {
      return { ready: false, provider: "worldpay", label: "Worldpay", mode: liveMode ? "live" : "test", reason: "Worldpay merchant entity is not configured." };
    }
    if (!authorizationHeader || authorizationHeader.includes("replace_me")) {
      return { ready: false, provider: "worldpay", label: "Worldpay", mode: liveMode ? "live" : "test", reason: "Worldpay API credentials are not configured." };
    }
    return { ready: true, provider: "worldpay", label: "Worldpay", mode: liveMode ? "live" : "test" };
  }

  async function worldpayJson(path, body, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "POST",
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "application/vnd.worldpay.payment_pages-v1.hal+json",
        Accept: "application/vnd.worldpay.payment_pages-v1.hal+json",
        ...(options.headers || {})
      },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.message || result.errorName || result.error || `Worldpay returned ${response.status}.`;
      throw Object.assign(new Error(message), { status: response.status, cause: result });
    }
    return result;
  }

  async function createWorldpayPaymentPage({
    transactionReference,
    amount,
    currency,
    description,
    resultUrls,
    customer = {},
    billingAddress = {}
  }) {
    const payload = {
      transactionReference,
      merchant: { entity: merchantEntity },
      narrative: { line1: String(narrativeLine1 || "Forget About").slice(0, 24) },
      value: { currency: String(currency || "GBP").toUpperCase(), amount: Number(amount) },
      description: String(description || "Forget About order").slice(0, 120),
      resultURLs: resultUrls
    };
    if (customisationId) payload.customisation = { id: customisationId };
    if (customer.email) payload.customer = { email: customer.email };
    if (billingAddress.address1 && billingAddress.postalCode && billingAddress.countryCode) {
      payload.billingAddress = billingAddress;
    }
    const result = await worldpayJson("/payment_pages", payload);
    const paymentUrl = result.url
      || result.paymentPageUrl
      || result._links?.paymentPage?.href
      || result._links?.["payment:paymentPage"]?.href
      || result._links?.redirect?.href;
    if (!paymentUrl) throw new Error("Worldpay did not return a hosted payment page URL.");
    return { id: result.id || result.paymentPageId || transactionReference, url: paymentUrl, raw: result };
  }

  function worldpayEventVerified(rawBody, headers = {}) {
    if (!webhookSecret) return false;
    const digest = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const base64Digest = createHmac("sha256", webhookSecret).update(rawBody).digest("base64");
    const header = headers["event-signature"]
      || headers["worldpay-signature"]
      || headers["wp-signature"]
      || headers["x-worldpay-signature"]
      || headers.signature
      || "";
    return signatureCandidates(header).some((candidate) => safeEqual(candidate, digest) || safeEqual(candidate, base64Digest));
  }

  return { worldpayReady, createWorldpayPaymentPage, worldpayEventVerified };
}
