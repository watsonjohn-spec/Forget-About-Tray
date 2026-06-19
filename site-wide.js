(() => {
  const sponsorSets = {
    home: {
      theme: "print",
      top: { brand: "Bambu Lab", url: "https://bambulab.com/", title: "Desktop printers for the workshop bench", detail: "Concept sponsor placement for print-ready organiser projects." },
      bottom: { brand: "DMC", url: "https://www.dmc.com/", title: "Thread, floss, and craft supplies", detail: "Concept sponsor placement for stitch and craft organisation." }
    },
    tray: {
      theme: "tray",
      top: { brand: "Warhammer", url: "https://www.warhammer.com/", title: "Tabletop armies need proper logistics", detail: "Concept sponsor placement for miniatures, paints, bases, and terrain." },
      bottom: { brand: "Bambu Lab", url: "https://bambulab.com/", title: "Print the movement plan at home", detail: "Concept sponsor placement for printers, filament, and hobby hardware." }
    },
    makeup: {
      theme: "makeup",
      top: { brand: "Sephora UK", url: "https://www.sephora.co.uk/", title: "Beauty kit, beautifully arranged", detail: "Concept sponsor placement for cosmetics, tools, and dressing-table storage." },
      bottom: { brand: "Space NK", url: "https://www.spacenk.com/uk/", title: "Premium beauty deserves a better caddy", detail: "Concept sponsor placement for beauty brands and organisers." }
    },
    print: {
      theme: "print",
      top: { brand: "Bambu Lab", url: "https://bambulab.com/", title: "Upload the file. Pick the print route.", detail: "Concept sponsor placement for printers and filament." },
      bottom: { brand: "Royal Mail", url: "https://www.royalmail.com/", title: "From print bed to front door", detail: "Concept sponsor placement for UK fulfilment and delivery." }
    },
    paint: {
      theme: "paint",
      top: { brand: "Citadel Colour", url: "https://paint.warhammer.com/", title: "Paints, brushes, and a tidier desk", detail: "Concept sponsor placement for model painting supplies." },
      bottom: { brand: "Vallejo", url: "https://acrylicosvallejo.com/en/", title: "Bottle racks for busy painting sessions", detail: "Concept sponsor placement for acrylic paints and hobby tools." }
    },
    stitch: {
      theme: "stitch",
      top: { brand: "DMC", url: "https://www.dmc.com/", title: "Keep every thread reference in reach", detail: "Concept sponsor placement for embroidery floss and stitch supplies." },
      bottom: { brand: "Hobbycraft", url: "https://www.hobbycraft.co.uk/", title: "Craft projects deserve useful storage", detail: "Concept sponsor placement for craft supplies and kits." }
    },
    factory: {
      theme: "factory",
      top: { brand: "Bambu Lab", url: "https://bambulab.com/", title: "Provider benches built for throughput", detail: "Concept sponsor placement for printers, spares, and filament." },
      bottom: { brand: "Royal Mail", url: "https://www.royalmail.com/", title: "Ship finished prints with confidence", detail: "Concept sponsor placement for UK delivery partners." }
    }
  };
  let sharedOrders = [];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function pageKey() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/makeup")) return "makeup";
    if (path.includes("/print")) return "print";
    if (path.includes("/paint")) return "paint";
    if (path.includes("/stitch")) return "stitch";
    if (path.includes("/factory")) return "factory";
    if (path.includes("/tray")) return "tray";
    return "home";
  }

  function money(pence, currency = "gbp") {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: String(currency || "gbp").toUpperCase() }).format(Number(pence || 0) / 100);
  }

  function toast(message) {
    if (window.generatorAuth?.toast) return window.generatorAuth.toast(message);
    const target = document.getElementById("toast") || document.getElementById("factoryToast");
    if (!target) return;
    target.textContent = message;
    target.classList.add("visible");
    setTimeout(() => target.classList.remove("visible"), 2600);
  }

  function sponsorMarkup(sponsor, theme) {
    return `
      <span class="sponsor-visual" aria-hidden="true"></span>
      <span class="sponsor-copy">
        <span class="sponsor-label">Concept sponsor</span>
        <strong>${escapeHtml(sponsor.brand)} · ${escapeHtml(sponsor.title)}</strong>
        <small>${escapeHtml(sponsor.detail)} No paid partnership is implied.</small>
      </span>
      <span class="sponsor-cta">Visit brand</span>
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
    const set = sponsorSets[pageKey()] || sponsorSets.home;
    let slots = [...document.querySelectorAll(".ad-slot")];
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
    slots.forEach((slot, index) => applySponsor(slot, index === 0 ? set.top : set.bottom, set.theme));
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
        </form>
        <section class="shared-account-page" data-shared-account-page="password" hidden>
          <h3>Change password</h3>
          <p>Enter your current password, then choose a new password with at least eight characters.</p>
          <label>Current password<input id="sharedAccountCurrentPassword" type="password" autocomplete="current-password"></label>
          <label>New password<input id="sharedAccountNewPassword" type="password" minlength="8" autocomplete="new-password"></label>
          <label>Confirm password<input id="sharedAccountConfirmPassword" type="password" minlength="8" autocomplete="new-password"></label>
          <button class="button button-primary primary" id="sharedChangePasswordButton" type="button">Update password</button>
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
    document.getElementById("sharedChangePasswordButton").addEventListener("click", async () => {
      const currentPassword = document.getElementById("sharedAccountCurrentPassword").value;
      const password = document.getElementById("sharedAccountNewPassword").value;
      const confirmation = document.getElementById("sharedAccountConfirmPassword").value;
      if (!currentPassword) return toast("Enter your current password.");
      if (password.length < 8) return toast("Use a password with at least 8 characters.");
      if (password !== confirmation) return toast("The new passwords do not match.");
      try {
        await accountService.updatePassword(currentPassword, password);
        document.getElementById("sharedAccountCurrentPassword").value = "";
        document.getElementById("sharedAccountNewPassword").value = "";
        document.getElementById("sharedAccountConfirmPassword").value = "";
        toast("Password updated");
      } catch (error) {
        toast(error.message);
      }
    });
    document.getElementById("sharedOrdersList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-shared-order-detail]");
      if (button) renderSharedOrderDetail(button.dataset.sharedOrderDetail);
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
      const [profile, orders] = await Promise.all([accountService.loadProfile(), accountService.loadOrders()]);
      const address = profile?.default_address || {};
      document.getElementById("sharedAccountEmail").value = accountService.currentUser()?.email || "";
      document.getElementById("sharedAccountDisplayName").value = profile?.display_name || "";
      document.getElementById("sharedAccountAddressLine1").value = address.line1 || "";
      document.getElementById("sharedAccountAddressLine2").value = address.line2 || "";
      document.getElementById("sharedAccountCity").value = address.city || "";
      document.getElementById("sharedAccountCounty").value = address.county || "";
      document.getElementById("sharedAccountPostcode").value = address.postcode || "";
      document.getElementById("sharedAccountCountry").value = address.country || "GB";
      renderSharedOrders(orders);
      setSharedAccountPage(page);
      document.getElementById("sharedAccountDialog").showModal();
    } catch (error) {
      toast(error.message);
    }
  }

  function renderSharedOrders(orders) {
    sharedOrders = Array.isArray(orders) ? orders : [];
    document.getElementById("sharedOrdersList").innerHTML = sharedOrders.length ? sharedOrders.map((order) => `
      <article class="shared-order-card">
        <div><strong>${escapeHtml(order.invoice_number || "Pending invoice")}</strong><small>${escapeHtml(String(order.status || "pending").replaceAll("_", " "))} · ${escapeHtml(order.brand_key || pageKey())}</small></div>
        <strong>${money(order.total_inc_vat, order.currency)}</strong>
        <button class="button button-secondary secondary" type="button" data-shared-order-detail="${escapeHtml(order.id)}">View details</button>
      </article>
    `).join("") : `<div class="empty-state empty">No orders yet.</div>`;
    document.getElementById("sharedOrderDetail").hidden = true;
  }

  function renderSharedOrderDetail(orderId) {
    const order = sharedOrders.find((candidate) => candidate.id === orderId);
    if (!order) return;
    const job = Array.isArray(order.print_jobs) ? order.print_jobs[0] : order.print_jobs;
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const detail = document.getElementById("sharedOrderDetail");
    detail.hidden = false;
    detail.innerHTML = `
      <h3>${escapeHtml(order.invoice_number || "Pending invoice")}</h3>
      <div class="shared-order-grid">
        <div><span>Status</span><strong>${escapeHtml(String(job?.status || order.status || "pending").replaceAll("_", " "))}</strong></div>
        <div><span>Total</span><strong>${money(order.total_inc_vat, order.currency)}</strong></div>
        <div><span>Ordered</span><strong>${order.paid_at || order.created_at ? new Date(order.paid_at || order.created_at).toLocaleString() : "Pending"}</strong></div>
        <div><span>Tracking</span><strong>${escapeHtml(job?.tracking_reference || "Not posted")}</strong></div>
      </div>
      ${items.map((item) => `<p><strong>${escapeHtml(item.description || "Printed design")}</strong> · quantity ${item.quantity || 1}</p>`).join("") || "<p>No line items were returned for this order.</p>"}
    `;
  }

  function enhancePrototypeTopbar() {
    const key = pageKey();
    if (!["paint", "stitch", "print"].includes(key)) return;
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector(".brand-intro")) return;
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
          <a class="site-contact-button" href="mailto:help@forget.im">Email help@forget.im</a>
        </section>
      </div>
      <section class="site-footer-legal" aria-label="Legal information">
        <details>
          <summary>Terms</summary>
          <p>Draft terms: Forget About provides generator tools, downloadable STL files, and access to independent print providers. Generated files are supplied for your own permitted use unless a separate commercial licence is agreed. You are responsible for checking measurements, compatibility, rights to any uploaded or referenced content, and whether a print is suitable for its intended use. We may refuse, remove, cancel, or refund requests that appear unsafe, unlawful, infringing, misleading, abusive, technically unsuitable, or outside a provider's stated capabilities. Print providers remain independent businesses responsible for their own production quality, listings, tax, safety, and customer communications.</p>
        </details>
        <details>
          <summary>Privacy</summary>
          <p>Draft privacy notice: we use account details, saved designs, uploaded file metadata, quote requests, order records, addresses, messages, payment status, support history, device logs, and basic analytics to run the service, generate designs, match print jobs, fulfil orders, prevent abuse, improve the platform, and meet legal duties. We share only what is needed with payment processors, hosting providers, support tools, and the selected print provider. Card details are handled by Stripe, not stored by Forget About. You can ask for help with access, correction, deletion, portability, or objection requests by emailing help@forget.im.</p>
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
        <span>Support: <a href="mailto:help@forget.im">help@forget.im</a></span>
      </div>
    `;
    document.body.append(footer);
  }

  decorateSponsors();
  normalizeExistingAccountButtons();
  enhancePrototypeTopbar();
  appendFooter();
})();
