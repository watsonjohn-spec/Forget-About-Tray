(() => {
  const adPortalThemes = { home: "print", tray: "tray", makeup: "makeup", print: "print", paint: "paint", stitch: "stitch", factory: "factory" };
  let sharedOrders = [];
  const siteConfig = window.MOVEMENT_TRAY_PUBLIC_CONFIG || {};
  const analyticsConfig = siteConfig.analytics || {};
  const adsenseConfig = siteConfig.adsense || {};
  const launchConfig = siteConfig.launch || {};
  const analyticsConsentKey = "forget-about-analytics-consent";
  const launchHoldKey = "forget-about-launch-hold-dismissed";
  let analyticsLoaded = false;
  let analyticsHistoryPatched = false;
  let adsenseLoaded = false;
  let lastTrackedUrl = "";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage?.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage?.setItem(key, value);
    } catch {
      /* Storage can be unavailable in private or embedded browsers. */
    }
  }

  function publicApiBase() {
    const meta = document.querySelector('meta[name="checkout-api-url"]')?.content?.trim();
    return (meta || siteConfig.apiBaseUrl || window.location.origin).replace(/\/$/, "");
  }

  function cookieConsentRequired() {
    return analyticsConfig.cookieConsentRequired !== false;
  }

  function analyticsConsentGranted() {
    return !cookieConsentRequired() || safeStorageGet(analyticsConsentKey) === "accepted";
  }

  function adsConsentGranted() {
    return analyticsConsentGranted();
  }

  function currentAnalyticsUrl() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function loadGoogleAnalytics() {
    const id = String(analyticsConfig.ga4MeasurementId || "").trim();
    if (!id || document.querySelector("script[data-forget-ga4]")) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.dataset.forgetGa4 = id;
    document.head.append(script);
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: false });
  }

  function loadMicrosoftClarity() {
    const id = String(analyticsConfig.clarityProjectId || "").trim();
    if (!id || document.querySelector("script[data-forget-clarity]")) return;
    window.clarity = window.clarity || function clarity() {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
    script.dataset.forgetClarity = id;
    document.head.append(script);
  }

  function trackAnalyticsPageView() {
    if (!analyticsLoaded || !analyticsConsentGranted()) return;
    const pagePath = currentAnalyticsUrl();
    if (pagePath === lastTrackedUrl) return;
    lastTrackedUrl = pagePath;
    if (typeof window.gtag === "function" && analyticsConfig.ga4MeasurementId) {
      window.gtag("event", "page_view", {
        page_title: document.title,
        page_location: window.location.href,
        page_path: pagePath
      });
    }
    if (typeof window.clarity === "function") {
      window.clarity("set", "page_path", pagePath);
      window.clarity("event", "page_view");
    }
  }

  function startAnalytics() {
    if (analyticsLoaded || !analyticsConsentGranted()) return;
    loadGoogleAnalytics();
    loadMicrosoftClarity();
    analyticsLoaded = true;
    setTimeout(trackAnalyticsPageView, 0);
  }

  function adsenseClientId() {
    return String(adsenseConfig.clientId || "").trim();
  }

  function adsenseEnabled() {
    return adsenseConfig.enabled !== false && Boolean(adsenseClientId());
  }

  function adsenseSlotId(placement) {
    const slots = adsenseConfig.slots || {};
    return String(slots[placement] || slots.default || "").trim();
  }

  function loadGoogleAdSense() {
    const clientId = adsenseClientId();
    if (!adsenseEnabled() || !adsConsentGranted()) return false;
    if (!document.querySelector("script[data-forget-adsense]")) {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      script.dataset.forgetAdsense = clientId;
      document.head.append(script);
    }
    window.adsbygoogle = window.adsbygoogle || [];
    adsenseLoaded = true;
    return true;
  }

  function startAdsense() {
    if (!adsConsentGranted() || !loadGoogleAdSense()) return;
    setTimeout(() => refreshAdSensePortals(), 0);
  }

  function renderCookieConsent() {
    if (!cookieConsentRequired() || safeStorageGet(analyticsConsentKey) || document.getElementById("cookieConsent")) return;
    const banner = document.createElement("section");
    banner.id = "cookieConsent";
    banner.className = "cookie-consent";
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML = `
      <div>
        <strong>Can we use analytics and advertising cookies?</strong>
        <p>They help us see which generators are useful and, where configured, show advertising through Google AdSense. Essential site functions still work if you decline.</p>
      </div>
      <div class="cookie-actions">
        <button type="button" data-cookie-consent="declined">Essential only</button>
        <button type="button" data-cookie-consent="accepted">Accept analytics and ads</button>
      </div>
    `;
    banner.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cookie-consent]");
      if (!button) return;
      safeStorageSet(analyticsConsentKey, button.dataset.cookieConsent);
      banner.remove();
      startAnalytics();
      startAdsense();
    });
    document.body.append(banner);
  }

  function setupAnalyticsNavigation() {
    if (analyticsHistoryPatched) return;
    analyticsHistoryPatched = true;
    const notify = () => setTimeout(trackAnalyticsPageView, 0);
    for (const method of ["pushState", "replaceState"]) {
      const original = window.history?.[method];
      if (typeof original !== "function") continue;
      window.history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
    }
    window.addEventListener("popstate", notify);
  }

  function launchHoldEnabled() {
    return analyticsConfig.launchHoldEnabled !== false;
  }

  function launchMvpModeEnabled() {
    return launchConfig.mvpModeEnabled !== false;
  }

  function launchPublicPaths() {
    return new Set(Array.isArray(launchConfig.publicPaths) ? launchConfig.publicPaths : ["trays", "print", "factory"]);
  }

  function launchDeferredPaths() {
    return new Set(Array.isArray(launchConfig.deferredPaths) ? launchConfig.deferredPaths : ["makeup", "paint", "stitch"]);
  }

  function launchHoldExcludedPaths() {
    return new Set(Array.isArray(launchConfig.launchHoldExcludedPaths) ? launchConfig.launchHoldExcludedPaths : ["hub"]);
  }

  function currentRoutePath() {
    const path = window.location.pathname.toLowerCase().split("/").filter(Boolean)[0] || "";
    return path === "tray" ? "trays" : path;
  }

  function applyLaunchScope() {
    if (!launchMvpModeEnabled()) return;
    const publicPaths = launchPublicPaths();
    const deferredPaths = launchDeferredPaths();
    document.querySelectorAll("[data-launch-path]").forEach((element) => {
      const path = element.dataset.launchPath;
      if (path && !publicPaths.has(path)) {
        element.hidden = true;
        element.setAttribute("aria-hidden", "true");
      }
    });
    const route = currentRoutePath();
    if (!deferredPaths.has(route) || document.querySelector(".launch-deferred-banner")) return;
    const banner = document.createElement("section");
    banner.className = "launch-deferred-banner";
    banner.innerHTML = `
      <strong>Private beta route</strong>
      <span>This generator is not part of the public launch MVP yet. The live launch is focused on Tray, Uploaded Print, and the Print Factory.</span>
      <a href="../">Back to launch routes</a>
    `;
    document.querySelector("main")?.prepend(banner);
  }

  function renderLaunchHold() {
    if (launchHoldExcludedPaths().has(currentRoutePath())) return;
    if (!launchHoldEnabled() || safeStorageGet(launchHoldKey) || document.getElementById("launchHold")) return;
    const hold = document.createElement("section");
    hold.id = "launchHold";
    hold.className = "launch-hold";
    hold.setAttribute("role", "dialog");
    hold.setAttribute("aria-modal", "true");
    hold.setAttribute("aria-labelledby", "launchHoldTitle");
    hold.innerHTML = `
      <div class="launch-hold-card">
        <button class="launch-hold-close" type="button" data-launch-dismiss aria-label="Continue to preview">&times;</button>
        <p class="launch-hold-eyebrow">Soft launch preview</p>
        <h2 id="launchHoldTitle">We have not launched yet.</h2>
        <p>Forget About is being wired together in public. Leave your name and email and we will tell you when it is ready for proper use.</p>
        <form id="launchSignupForm" class="launch-signup-form">
          <div class="launch-name-grid">
            <label>First name<input name="firstName" autocomplete="given-name" required></label>
            <label>Second name<input name="secondName" autocomplete="family-name" required></label>
          </div>
          <label>Email address<input name="email" type="email" autocomplete="email" required></label>
          <button class="button top-action-button" type="submit">Notify me at launch</button>
          <small id="launchSignupStatus">No spam. Just the launch note and genuinely useful updates.</small>
        </form>
        <button class="launch-preview-button" type="button" data-launch-dismiss>Continue to preview</button>
      </div>
    `;
    hold.addEventListener("click", (event) => {
      if (!event.target.matches("[data-launch-dismiss]")) return;
      safeStorageSet(launchHoldKey, "dismissed");
      hold.remove();
    });
    hold.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = hold.querySelector("#launchSignupStatus");
      const button = form.querySelector("button");
      button.disabled = true;
      status.textContent = "Adding you to the launch list...";
      try {
        const body = Object.fromEntries(new FormData(form).entries());
        const response = await fetch(`${publicApiBase()}/api/launch-signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forget-About-Path": window.location.pathname },
          body: JSON.stringify({ ...body, sourcePath: window.location.pathname, analyticsConsent: analyticsConsentGranted() })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Signup failed.");
        safeStorageSet(launchHoldKey, "submitted");
        status.textContent = result.message || "You are on the launch list.";
        setTimeout(() => hold.remove(), 900);
      } catch (error) {
        button.disabled = false;
        status.textContent = error.message;
      }
    });
    document.body.append(hold);
    hold.querySelector("input")?.focus({ preventScroll: true });
  }

  function pageKey() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/makeup")) return "makeup";
    if (path.includes("/print")) return "print";
    if (path.includes("/paint")) return "paint";
    if (path.includes("/stitch")) return "stitch";
    if (path.includes("/factory")) return "factory";
    if (path.includes("/trays") || path.includes("/tray")) return "tray";
    return "home";
  }

  function money(pence, currency = "gbp") {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: String(currency || "gbp").toUpperCase() }).format(Number(pence || 0) / 100);
  }

  function labelText(value) {
    return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function toast(message) {
    if (window.generatorAuth?.toast) return window.generatorAuth.toast(message);
    const target = document.getElementById("toast") || document.getElementById("factoryToast");
    if (!target) return;
    target.textContent = message;
    target.classList.add("visible");
    setTimeout(() => target.classList.remove("visible"), 2600);
  }

  async function accountFetch(path, options = {}) {
    const response = await fetch(`${document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "")}${path}`, {
      ...options,
      headers: { ...(await accountService.authHeaders()), ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Account request failed.");
    return result;
  }

  function sponsorMarkup(sponsor, theme) {
    return `
      <span class="sponsor-visual" aria-hidden="true"></span>
      <span class="sponsor-copy">
        <span class="sponsor-label">Advertisement</span>
        <strong>${escapeHtml(sponsor.brand)} · ${escapeHtml(sponsor.title)}</strong>
        <small>${escapeHtml(sponsor.detail)} No paid partnership is implied.</small>
      </span>
      <span class="sponsor-cta">AdSense</span>
    `;
  }

  function applySponsor(element, sponsor, theme) {
    element.classList.add("sponsor-concept", `sponsor-${theme}`);
    element.setAttribute("aria-label", `${sponsor.brand} concept sponsor banner`);
    if (element.tagName.toLowerCase() !== "a") {
      element.setAttribute("role", "link");
      element.tabIndex = 0;
      element.addEventListener("click", () => window.open(sponsor.url, "_blank", "noopener"));
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          window.open(sponsor.url, "_blank", "noopener");
        }
      });
    }
    element.innerHTML = sponsorMarkup(sponsor, theme);
  }

  function decorateSponsors() {
    decorateAdSensePortals();
  }

  function adPlacementLabel(value) {
    return String(value || "advertising").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function adPortalPlacement(element, index) {
    if (element.dataset.adPlacement) return element.dataset.adPlacement;
    if (element.classList.contains("ad-gate-creative")) return "export-prep";
    const route = pageKey();
    const placement = element.classList.contains("ad-slot-bottom") || index % 2 === 1 ? "bottom" : "top";
    return `${route}-${placement}`;
  }

  function adPortalMarkup(placement) {
    const slotId = adsenseSlotId(placement);
    const configured = adsenseEnabled() && slotId;
    return `
      <span class="adsense-copy">
        <span class="adsense-label">Advertisement</span>
        <strong>${configured ? "Google AdSense" : "AdSense portal ready"}</strong>
        <small>${configured ? `${adPlacementLabel(placement)} ad unit.` : `${adPlacementLabel(placement)} will serve after the AdSense client and slot IDs are configured.`}</small>
      </span>
      <span class="adsense-mount" aria-hidden="${configured ? "false" : "true"}"></span>
    `;
  }

  function applyAdSensePortal(element, placement) {
    const theme = adPortalThemes[pageKey()] || adPortalThemes.home;
    element.className = [...new Set(`${element.className} adsense-portal adsense-${theme}`.trim().split(/\s+/))].join(" ");
    element.dataset.adsensePlacement = placement;
    element.dataset.adsenseSlot = adsenseSlotId(placement);
    element.setAttribute("aria-label", "Advertisement");
    element.innerHTML = adPortalMarkup(placement);
  }

  function adPortalVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function ensureAdSenseUnit(element) {
    const slotId = element.dataset.adsenseSlot;
    const clientId = adsenseClientId();
    if (!slotId || !clientId) return null;
    const mount = element.querySelector(".adsense-mount") || element;
    let unit = mount.querySelector("ins.adsbygoogle");
    if (!unit) {
      unit = document.createElement("ins");
      unit.className = "adsbygoogle";
      unit.style.display = "block";
      unit.dataset.adClient = clientId;
      unit.dataset.adSlot = slotId;
      unit.dataset.adFormat = "auto";
      unit.dataset.fullWidthResponsive = "true";
      if (adsenseConfig.testMode) unit.dataset.adtest = "on";
      mount.append(unit);
    }
    return unit;
  }

  function refreshAdSensePortals(root = document) {
    if (!adsenseEnabled() || !adsConsentGranted() || !loadGoogleAdSense()) return;
    const scope = root instanceof Element ? root : document;
    const slots = scope.matches?.("[data-adsense-placement]")
      ? [scope, ...scope.querySelectorAll("[data-adsense-placement]")]
      : [...scope.querySelectorAll("[data-adsense-placement]")];
    slots.forEach((slot) => {
      if (slot.dataset.adsenseRequested === "true" || !adPortalVisible(slot)) return;
      if (!ensureAdSenseUnit(slot)) return;
      try {
        window.adsbygoogle.push({});
        slot.dataset.adsenseRequested = "true";
      } catch (error) {
        slot.dataset.adsenseError = error.message || "AdSense request failed";
      }
    });
  }

  function decorateAdSensePortals() {
    let slots = [...document.querySelectorAll(".ad-slot")];
    const exportPrep = document.querySelector(".ad-gate-creative");
    if (exportPrep && !slots.includes(exportPrep)) slots.push(exportPrep);
    if (!slots.length) {
      const main = document.querySelector("main");
      const header = document.querySelector("header");
      if (!main) return;
      const top = document.createElement("aside");
      top.className = "ad-slot ad-slot-top";
      const bottom = document.createElement("aside");
      bottom.className = "ad-slot ad-slot-bottom";
      if (header) header.insertAdjacentElement("afterend", top);
      else main.prepend(top);
      main.append(bottom);
      slots = [top, bottom];
    }
    slots.forEach((slot, index) => applyAdSensePortal(slot, adPortalPlacement(slot, index)));
    startAdsense();
  }

  function generatorName() {
    return document.querySelector("[data-brand-name]")?.textContent?.trim()
      || document.querySelector(".brand strong")?.textContent?.trim()
      || document.title
      || "Forget About";
  }

  function generatorTagline(key) {
    if (key === "paint") return ["Sort the paints.", "Keep the water clear."];
    if (key === "stitch") return ["Thread the project.", "Label every colour."];
    if (key === "print") return ["Upload the model.", "Route the print."];
    return ["Build the object.", "Send it to print."];
  }

  async function saveSharedPreset() {
    const getConfig = window.generatorCurrentConfig;
    if (typeof getConfig !== "function") return toast("This generator does not expose saved presets yet.");
    if (!window.accountService?.isSignedIn?.()) return toast("Sign in before saving a preset.");
    const suggested = typeof window.generatorCurrentName === "function" ? window.generatorCurrentName() : generatorName();
    const name = window.prompt("Name this saved preset", suggested || "Saved preset")?.trim();
    if (!name) return;
    await accountService.upsertDesign({
      client_ref: crypto.randomUUID(),
      name,
      generator_version: 1,
      parameters: getConfig(),
      metadata: { saved_from: window.location.pathname }
    });
    toast(`${name} saved`);
  }

  function exportSharedGenerator() {
    const exportButton = document.getElementById("exportButton");
    const quoteButton = document.getElementById("quoteButton");
    if (exportButton) return exportButton.click();
    if (quoteButton) return quoteButton.click();
    toast("This generator does not expose STL export yet.");
  }

  function injectSharedAccountDialog() {
    if (document.getElementById("sharedAccountDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "sharedAccountDialog";
    dialog.className = "shared-account-dialog";
    dialog.innerHTML = `
      <div class="shared-dialog-heading">
        <div><p>Workshop account</p><h2>Account and orders</h2></div>
        <button type="button" data-shared-account-close aria-label="Close account dialog">×</button>
      </div>
      <nav class="shared-account-page-nav" aria-label="Account pages">
        <button type="button" data-shared-account-page-button="profile">Profile and address</button>
        <button type="button" data-shared-account-page-button="password">Change password</button>
        <button type="button" data-shared-account-page-button="orders">Order history</button>
      </nav>
      <div class="shared-account-pages">
        <form class="shared-account-page" id="sharedAccountProfileForm" data-shared-account-page="profile">
          <h3>Profile and default address</h3>
          <p>Checkout records the delivery address used at purchase. This default address makes repeat orders quicker.</p>
          <label>Email<input id="sharedAccountEmail" type="email" disabled></label>
          <label>Display name<input id="sharedAccountDisplayName" type="text" autocomplete="name"></label>
          <label>Address line 1<input id="sharedAccountAddressLine1" type="text" autocomplete="address-line1"></label>
          <label>Address line 2<input id="sharedAccountAddressLine2" type="text" autocomplete="address-line2"></label>
          <div class="shared-field-grid">
            <label>Town or city<input id="sharedAccountCity" type="text" autocomplete="address-level2"></label>
            <label>County<input id="sharedAccountCounty" type="text" autocomplete="address-level1"></label>
            <label>Postcode<input id="sharedAccountPostcode" type="text" autocomplete="postal-code"></label>
          </div>
          <label>Country code<input id="sharedAccountCountry" type="text" maxlength="2" value="GB" autocomplete="country"></label>
          <button class="button button-primary primary" type="submit">Save profile</button>
          <section class="shared-privacy-tools" aria-label="Data and privacy tools">
            <h4>Data and privacy</h4>
            <p>Download a portable JSON copy of your account data. Deletion requests keep legally required order, VAT, refund, and fulfilment records for their retention period.</p>
            <div id="sharedSecurityStatus" class="shared-security-status">Checking account security...</div>
            <button class="button button-secondary secondary" id="sharedDownloadAccountData" type="button">Download account data</button>
            <button class="button button-secondary secondary danger" id="sharedRequestDeletion" type="button">Request account deletion</button>
          </section>
        </form>
        <section class="shared-account-page" data-shared-account-page="password" hidden>
          <h3>Change password</h3>
          <div data-account-password-form data-account-password-prefix="sharedAccount" data-account-password-button-id="sharedChangePasswordButton" data-account-password-button-class="button button-primary primary"></div>
        </section>
        <section class="shared-account-page" data-shared-account-page="orders" hidden>
          <h3>Purchase history</h3>
          <p>Select an order to see the details and fulfilment status.</p>
          <div id="sharedOrdersList" class="shared-orders-list"></div>
          <div id="sharedOrderDetail" class="shared-order-detail" hidden></div>
        </section>
      </div>
    `;
    document.body.append(dialog);

    dialog.querySelector("[data-shared-account-close]").addEventListener("click", () => dialog.close());
    dialog.querySelectorAll("[data-shared-account-page-button]").forEach((button) => {
      button.addEventListener("click", () => setSharedAccountPage(button.dataset.sharedAccountPageButton));
    });
    document.getElementById("sharedAccountProfileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await accountService.saveProfile({
          display_name: document.getElementById("sharedAccountDisplayName").value.trim() || null,
          default_address: {
            line1: document.getElementById("sharedAccountAddressLine1").value.trim(),
            line2: document.getElementById("sharedAccountAddressLine2").value.trim(),
            city: document.getElementById("sharedAccountCity").value.trim(),
            county: document.getElementById("sharedAccountCounty").value.trim(),
            postcode: document.getElementById("sharedAccountPostcode").value.trim(),
            country: document.getElementById("sharedAccountCountry").value.trim().toUpperCase()
          }
        });
        toast("Profile saved");
      } catch (error) {
        toast(error.message);
      }
    });
    document.getElementById("sharedDownloadAccountData").addEventListener("click", () => downloadSharedAccountData().catch((error) => toast(error.message)));
    document.getElementById("sharedRequestDeletion").addEventListener("click", () => requestSharedAccountDeletion().catch((error) => toast(error.message)));
    window.accountPasswordFlow?.hydrate(dialog.querySelector("[data-account-password-form]"), { notify: toast });
    document.getElementById("sharedOrdersList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-shared-order-detail]");
      if (button) renderSharedOrderDetail(button.dataset.sharedOrderDetail);
    });
    document.getElementById("sharedOrderDetail").addEventListener("click", (event) => {
      handleSharedOrderAction(event).catch((error) => toast(error.message));
    });
  }

  function setSharedAccountPage(page) {
    document.querySelectorAll("[data-shared-account-page-button]").forEach((button) => {
      button.classList.toggle("active", button.dataset.sharedAccountPageButton === page);
    });
    document.querySelectorAll("[data-shared-account-page]").forEach((panel) => {
      panel.hidden = panel.dataset.sharedAccountPage !== page;
    });
  }

  async function loadSharedAccount(page = "profile") {
    if (!window.accountService?.isSignedIn?.()) return toast("Sign in to open your account.");
    injectSharedAccountDialog();
    try {
      const [profile, orders, security] = await Promise.all([
        accountService.loadProfile(),
        accountService.loadOrders(),
        accountService.loadSecurityStatus?.().catch(() => null)
      ]);
      const address = profile?.default_address || {};
      document.getElementById("sharedAccountEmail").value = accountService.currentUser()?.email || "";
      document.getElementById("sharedAccountDisplayName").value = profile?.display_name || "";
      document.getElementById("sharedAccountAddressLine1").value = address.line1 || "";
      document.getElementById("sharedAccountAddressLine2").value = address.line2 || "";
      document.getElementById("sharedAccountCity").value = address.city || "";
      document.getElementById("sharedAccountCounty").value = address.county || "";
      document.getElementById("sharedAccountPostcode").value = address.postcode || "";
      document.getElementById("sharedAccountCountry").value = address.country || "GB";
      renderSharedSecurityStatus(security);
      renderSharedOrders(orders);
      setSharedAccountPage(page);
      document.getElementById("sharedAccountDialog").showModal();
    } catch (error) {
      toast(error.message);
    }
  }

  function renderSharedSecurityStatus(security) {
    const element = document.getElementById("sharedSecurityStatus");
    if (!element) return;
    if (!security) {
      element.innerHTML = `<strong>Account sharing controls</strong><span>Security status is unavailable right now.</span>`;
      return;
    }
    const warning = security.sharingWarning
      ? `This account is above the ${security.deviceLimit}-device warning threshold.`
      : `Within the ${security.deviceLimit}-device warning threshold.`;
    const mode = security.enforcementEnabled ? "Hard limit enabled" : "Warning mode";
    element.innerHTML = `
      <strong>Account sharing controls</strong>
      <span>${escapeHtml(security.activeDeviceCount)} active browser${Number(security.activeDeviceCount) === 1 ? "" : "s"} recorded. ${escapeHtml(mode)}. ${escapeHtml(warning)}</span>
    `;
  }

  function downloadJsonFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadSharedAccountData() {
    if (typeof accountService.exportAccountData !== "function") throw new Error("Account data export is not available yet.");
    const data = await accountService.exportAccountData();
    const date = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`forget-about-account-data-${date}.json`, data);
    toast("Account data export downloaded");
  }

  async function requestSharedAccountDeletion() {
    if (!window.confirm("Request account deletion? Legally required order and VAT records will still be retained for their required period.")) return;
    if (typeof accountService.requestAccountDeletion !== "function") throw new Error("Account deletion requests are not available yet.");
    const result = await accountService.requestAccountDeletion();
    toast(result.message || "Account deletion request submitted");
  }

  function renderSharedOrders(orders) {
    sharedOrders = Array.isArray(orders) ? orders : [];
    document.getElementById("sharedOrdersList").innerHTML = sharedOrders.length ? sharedOrders.map((order) => `
      <article class="shared-order-card">
        <div><strong>${escapeHtml(order.invoice_number || "Pending invoice")}</strong><small>${escapeHtml(labelText(order.status || "pending"))} | ${escapeHtml(order.brand_key || pageKey())}</small></div>
        <strong>${money(order.total_inc_vat, order.currency)}</strong>
        <button class="button button-secondary secondary" type="button" data-shared-order-detail="${escapeHtml(order.id)}">View details</button>
      </article>
    `).join("") : `<div class="empty-state empty">No orders yet.</div>`;
    document.getElementById("sharedOrderDetail").hidden = true;
  }

  function sharedOrderEventTitle(event) {
    const type = event.event_type || "status";
    if (type === "provider_message") return "Message from printer";
    if (type === "customer_message") return "Message to printer";
    if (type === "decline") return "Declined and refunded";
    if (type === "delivery_chaser") return "Delivery confirmation reminder";
    if (type === "customer_escalation") return "Escalated by buyer";
    if (type === "auto_complete") return "Automatically completed";
    return labelText(event.to_status || "status");
  }

  function sharedNestedRow(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function sharedPostageDays(job) {
    const quote = sharedNestedRow(job?.print_quotes);
    const days = Number(quote?.postage_days || job?.design_snapshot?.fulfillment?.postageDays || 3);
    return Number.isFinite(days) && days > 0 ? days : 3;
  }

  function sharedExpectedDeliveryDate(job) {
    if (!job?.posted_at) return null;
    return new Date(new Date(job.posted_at).getTime() + sharedPostageDays(job) * 24 * 60 * 60 * 1000);
  }

  function sharedDateLabel(date) {
    return date ? date.toLocaleDateString("en-GB", { dateStyle: "medium" }) : "Not calculated yet";
  }

  function sharedDeliveryConfirmationPanel(job, events) {
    if (!job || !["posted", "complete"].includes(job.status)) return "";
    const expected = sharedExpectedDeliveryDate(job);
    const releaseAt = expected ? new Date(expected.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
    const chasers = events.filter((event) => event.event_type === "delivery_chaser");
    const message = job.status === "complete"
      ? "This order is complete. Any held printer payout can now be released."
      : `We will send up to seven daily reminders. If there is no confirmation or escalation by ${sharedDateLabel(releaseAt)}, the order can auto-complete and release the printer payout.`;
    return `<section class="order-delivery-confirmation">
      <h5>Delivery confirmation</h5>
      <div class="shared-order-grid">
        <div><span>Expected arrival</span><strong>${escapeHtml(sharedDateLabel(expected))}</strong></div>
        <div><span>Reminder emails</span><strong>${chasers.length}/7 queued</strong></div>
        <div><span>Auto-release after</span><strong>${escapeHtml(sharedDateLabel(releaseAt))}</strong></div>
        <div><span>Tracking</span><strong>${escapeHtml(job.tracking_reference || "Not recorded")}</strong></div>
      </div>
      <p>${escapeHtml(message)}</p>
    </section>`;
  }

  function sharedOrderStatusTrack(job, currentStatus) {
    const statuses = ["order_made", "producing", "posted", "complete"];
    const currentIndex = statuses.indexOf(currentStatus);
    if (!job || currentIndex < 0) return `<p class="order-status-note">Order status: <strong>${escapeHtml(labelText(currentStatus || "pending"))}</strong></p>`;
    return `<div class="order-status-track">${statuses.map((status, index) => `<span class="${index <= currentIndex ? "done" : ""}">${escapeHtml(labelText(status))}</span>`).join("")}</div>`;
  }

  function sharedOrderActions(job) {
    if (!job || ["complete", "refunded", "cancelled"].includes(job.status)) return "";
    const messageForm = `<div class="order-message-form"><label>Message printer<textarea data-customer-job-message rows="3" placeholder="Ask a question or add order information before completion"></textarea></label><button class="button button-secondary secondary" type="button" data-send-job-message="${escapeHtml(job.id)}">Send message</button></div>`;
    const escalationForm = job.status === "posted"
      ? `<div class="order-escalation-form"><label>Delivery problem or escalation<textarea data-job-escalation rows="3" placeholder="Tell us what has not arrived or what needs reviewing"></textarea></label><button class="button button-secondary secondary danger" type="button" data-escalate-print-job="${escapeHtml(job.id)}">Escalate delivery issue</button></div>`
      : "";
    const ratingForm = job.status === "posted"
      ? `<div class="order-rating-form"><h5>Confirm receipt</h5><p>Rate this print before completing the order. Completion releases the printer payout.</p><label>Rating<select data-job-rating required><option value="">Choose rating</option><option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Okay</option><option value="2">2 - Poor</option><option value="1">1 - Bad</option></select></label><label>Review note<textarea data-job-review rows="3" placeholder="Optional note about the print"></textarea></label><button class="button button-primary primary" type="button" data-complete-print-job="${escapeHtml(job.id)}">Confirm delivery and complete order</button></div>`
      : "";
    return `${messageForm}${escalationForm}${ratingForm}`;
  }

  async function reloadSharedOrders(selectedOrderId = "") {
    const orders = await accountService.loadOrders();
    renderSharedOrders(orders);
    if (selectedOrderId) renderSharedOrderDetail(selectedOrderId);
  }

  async function handleSharedOrderAction(event) {
    const completeButton = event.target.closest("[data-complete-print-job]");
    const messageButton = event.target.closest("[data-send-job-message]");
    const escalateButton = event.target.closest("[data-escalate-print-job]");
    if (!completeButton && !messageButton && !escalateButton) return;
    const button = completeButton || messageButton || escalateButton;
    button.disabled = true;
    try {
      const activeOrderId = document.querySelector("[data-shared-order-active]")?.dataset.sharedOrderActive || "";
      if (escalateButton) {
        const reason = escalateButton.closest(".order-escalation-form").querySelector("[data-job-escalation]").value;
        await accountFetch(`/api/account/print-jobs/${encodeURIComponent(escalateButton.dataset.escalatePrintJob)}/escalate`, {
          method: "POST",
          body: JSON.stringify({ reason })
        });
        await reloadSharedOrders(activeOrderId);
        toast("Delivery issue escalated");
        return;
      }
      if (messageButton) {
        const note = messageButton.closest(".order-message-form").querySelector("[data-customer-job-message]").value;
        await accountFetch(`/api/account/print-jobs/${encodeURIComponent(messageButton.dataset.sendJobMessage)}/message`, {
          method: "POST",
          body: JSON.stringify({ note })
        });
        await reloadSharedOrders(activeOrderId);
        toast("Message sent");
        return;
      }
      const form = completeButton.closest(".order-rating-form");
      const rating = Number(form.querySelector("[data-job-rating]").value);
      if (!rating || !window.confirm("Confirm that this printed order has arrived? This records your rating and releases the printer payout.")) {
        button.disabled = false;
        return;
      }
      const result = await accountFetch(`/api/account/print-jobs/${encodeURIComponent(completeButton.dataset.completePrintJob)}/complete`, {
        method: "POST",
        body: JSON.stringify({ rating, reviewText: form.querySelector("[data-job-review]").value })
      });
      await reloadSharedOrders(activeOrderId);
      toast(result.transfer?.released ? "Order completed and printer payout released" : "Order completed; printer payout remains held for review");
    } catch (error) {
      button.disabled = false;
      throw error;
    }
  }

  function renderSharedOrderDetail(orderId) {
    const order = sharedOrders.find((candidate) => candidate.id === orderId);
    if (!order) return;
    const job = Array.isArray(order.print_jobs) ? order.print_jobs[0] : order.print_jobs;
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const snapshot = Array.isArray(order.order_customer_snapshots) ? order.order_customer_snapshots[0] : order.order_customer_snapshots;
    const events = Array.isArray(job?.print_job_events) ? job.print_job_events : [];
    const currentStatus = job?.status || order.status || "pending";
    const detail = document.getElementById("sharedOrderDetail");
    detail.hidden = false;
    detail.innerHTML = `
      <h3 data-shared-order-active="${escapeHtml(order.id)}">${escapeHtml(order.invoice_number || "Pending invoice")}</h3>
      ${sharedOrderStatusTrack(job, currentStatus)}
      <div class="shared-order-grid">
        <div><span>Status</span><strong>${escapeHtml(labelText(currentStatus))}</strong></div>
        <div><span>Total</span><strong>${money(order.total_inc_vat, order.currency)}</strong></div>
        <div><span>Ordered</span><strong>${order.paid_at || order.created_at ? new Date(order.paid_at || order.created_at).toLocaleString() : "Pending"}</strong></div>
        <div><span>Tracking</span><strong>${escapeHtml(job?.tracking_reference || "Not posted")}</strong></div>
      </div>
      <div class="order-detail-items">
        ${items.map((item) => `<p><strong>${escapeHtml(item.description || "Printed design")}</strong><br><small>Quantity ${item.quantity || 1} | ${money(item.total_inc_vat || 0, order.currency)}</small></p>`).join("") || "<p>No line items were returned for this order.</p>"}
      </div>
      <div class="shared-order-grid">
        <div><span>Delivery postcode</span><strong>${escapeHtml(snapshot?.delivery_address?.postal_code || snapshot?.delivery_address?.postcode || "Not recorded")}</strong></div>
        <div><span>Brand</span><strong>${escapeHtml(order.brand_key || pageKey())}</strong></div>
        <div><span>Generator</span><strong>${escapeHtml(labelText(order.generator_type || "generator"))}</strong></div>
        <div><span>Refund lock</span><strong>${job?.producing_at ? "Production started" : "Before production"}</strong></div>
      </div>
      ${sharedDeliveryConfirmationPanel(job, events)}
      ${sharedOrderActions(job)}
      ${events.length ? `<div class="order-events"><h5>Messages and status history</h5>${events.map((event) => `<p class="event-${escapeHtml(event.event_type || "status")}"><strong>${escapeHtml(sharedOrderEventTitle(event))}</strong><span>${escapeHtml(event.note || "")}</span><small>${new Date(event.created_at).toLocaleString()}</small></p>`).join("")}</div>` : ""}
    `;
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function enhancePrototypeTopbar() {
    const key = pageKey();
    if (!["paint", "stitch", "print"].includes(key)) return false;
    const topbar = document.querySelector(".topbar");
    if (!topbar) return false;
    if (topbar.querySelector(".brand-intro")) {
      document.body.dataset.sharedGeneratorShell = "true";
      return true;
    }
    const brand = topbar.querySelector(".brand");
    brand?.setAttribute("href", "../");
    const [strong, em] = generatorTagline(key);
    const intro = document.createElement("div");
    intro.className = "brand-intro";
    intro.append(brand);
    intro.insertAdjacentHTML("beforeend", `<p class="top-tagline"><strong>${escapeHtml(strong)}</strong><em>${escapeHtml(em)}</em></p>`);
    const actions = topbar.querySelector(".top-actions") || document.createElement("div");
    actions.className = "top-actions";
    actions.innerHTML = `
      <button class="button top-action-button" id="sharedSavePresetTop" type="button">Save preset</button>
      <button class="button top-action-button" id="sharedExportTop" type="button">Export STL</button>
      <div class="account-menu-wrap">
        <button class="button top-action-button account-menu-button" id="sharedAccountButton" type="button" aria-expanded="false">Account <span>&#9662;</span></button>
        <div class="account-menu" id="sharedAccountMenu" hidden>
          <strong>${escapeHtml(generatorName())}</strong>
          <button type="button" data-shared-account-view="profile">Profile and address</button>
          <button type="button" data-shared-account-view="password">Change password</button>
          <button type="button" data-shared-account-view="orders">Order history</button>
          <button type="button" id="sharedLogoutButton">Log out</button>
        </div>
      </div>
    `;
    topbar.innerHTML = "";
    topbar.append(intro, actions);
    document.getElementById("sharedSavePresetTop").addEventListener("click", () => saveSharedPreset().catch((error) => toast(error.message)));
    document.getElementById("sharedExportTop").addEventListener("click", exportSharedGenerator);
    document.getElementById("sharedAccountButton").addEventListener("click", () => {
      const menu = document.getElementById("sharedAccountMenu");
      menu.hidden = !menu.hidden;
      document.getElementById("sharedAccountButton").setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.querySelectorAll("[data-shared-account-view]").forEach((button) => {
      button.addEventListener("click", () => {
        document.getElementById("sharedAccountMenu").hidden = true;
        document.getElementById("sharedAccountButton").setAttribute("aria-expanded", "false");
        loadSharedAccount(button.dataset.sharedAccountView);
      });
    });
    document.getElementById("sharedLogoutButton").addEventListener("click", async () => {
      await accountService.signOut();
      window.generatorAuth?.setAuthenticated?.(false);
      toast("Signed out");
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest(".account-menu-wrap")) return;
      const menu = document.getElementById("sharedAccountMenu");
      if (!menu) return;
      menu.hidden = true;
      document.getElementById("sharedAccountButton")?.setAttribute("aria-expanded", "false");
    });
    document.body.dataset.sharedGeneratorShell = "true";
    return true;
  }

  function normalizeExistingAccountButtons() {
    document.querySelectorAll("#accountButton.account-menu-button").forEach((button) => {
      button.innerHTML = "Account <span>&#9662;</span>";
    });
  }

  function appendFooter() {
    if (document.querySelector(".site-footer")) return;
    const brandName = generatorName();
    const year = new Date().getFullYear();
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="site-footer-top">
        <div class="site-footer-brand">
          <strong>${escapeHtml(brandName)}</strong>
          <p>Practical printable storage tools for tabletop, craft, beauty, and workshop projects.</p>
        </div>
        <section class="site-footer-contact" aria-label="Contact us">
          <h2>Contact us</h2>
          <p>Need help with an order, print quote, generator, or account? Email support and we will route it to the right person.</p>
          <a class="site-contact-button" href="mailto:help@forgetabout.im">Email help@forgetabout.im</a>
        </section>
      </div>
      <section class="site-footer-legal" aria-label="Legal information">
        <details>
          <summary>Terms</summary>
          <p>Draft terms: Forget About provides generator tools, downloadable STL files, and access to independent print providers. Generated files are supplied for your own permitted use unless a separate commercial licence is agreed. You are responsible for checking measurements, compatibility, rights to any uploaded or referenced content, and whether a print is suitable for its intended use. We may refuse, remove, cancel, or refund requests that appear unsafe, unlawful, infringing, misleading, abusive, technically unsuitable, or outside a provider's stated capabilities. Print providers remain independent businesses responsible for their own production quality, listings, tax, safety, and customer communications.</p>
        </details>
        <details>
          <summary>Privacy</summary>
          <p>Draft privacy notice: we use account details, saved designs, uploaded file metadata, quote requests, order records, addresses, messages, payment status, support history, device logs, analytics, and advertising consent state to run the service, generate designs, match print jobs, fulfil orders, prevent abuse, improve the platform, serve configured ads, and meet legal duties. We share only what is needed with payment processors, hosting providers, analytics and advertising providers, support tools, and the selected print provider. Card details are handled by Stripe, not stored by Forget About. You can ask for help with access, correction, deletion, portability, or objection requests by emailing help@forgetabout.im.</p>
        </details>
        <details>
          <summary>Refunds</summary>
          <p>Draft refunds policy: if something looks wrong, contact support first so the provider has a chance to resolve it. Digital STL access is normally final once the file is generated or downloaded, except where the file is not delivered, is corrupted, or statutory rights require otherwise. Marketplace print orders can usually be cancelled before a provider accepts or starts production. After production starts, refunds or reprints are assessed for non-delivery, damage in transit, incorrect material or colour, significant mismatch against the confirmed design, print failure, or provider error. We may ask for photos, order details, and provider comments before deciding whether to refund, reprint, credit, or decline a claim.</p>
        </details>
        <details>
          <summary>Modern slavery statement</summary>
          <p>Draft statement: Forget About expects all suppliers, contractors, and print providers to operate without forced labour, child labour, human trafficking, debt bondage, unsafe coercive work, or exploitative recruitment. Providers should comply with local labour, health, safety, immigration, and wage laws, and should be able to explain who performs fulfilment work. We may review providers, request further information, suspend listings, withhold new jobs, or end relationships where modern-slavery risk is not addressed. As the business grows, we will formalise supplier due diligence, provider onboarding checks, incident records, training, and an annual review of higher-risk supply-chain areas.</p>
        </details>
      </section>
      <div class="site-footer-bottom">
        <span>Copyright ${year} Forget About. Draft policy copy for legal review before launch.</span>
        <span>Support: <a href="mailto:help@forgetabout.im">help@forgetabout.im</a></span>
      </div>
    `;
    document.body.append(footer);
  }

  window.forgetSharedShell = {
    loadAccount: loadSharedAccount,
    savePreset: saveSharedPreset,
    exportGenerator: exportSharedGenerator,
    enhanceTopbar: enhancePrototypeTopbar,
    renderOrders: renderSharedOrders,
    refreshAds: refreshAdSensePortals
  };

  applyLaunchScope();
  decorateAdSensePortals();
  normalizeExistingAccountButtons();
  enhancePrototypeTopbar();
  appendFooter();
  setupAnalyticsNavigation();
  renderCookieConsent();
  startAnalytics();
  startAdsense();
  renderLaunchHold();
})();
