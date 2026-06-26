(function () {
  const state = {
    dashboard: null,
    activeTab: "founder",
    loading: false
  };

  const statusLabels = {
    pending_review: "Pending review",
    active: "Active",
    paused: "Paused",
    suspended: "Suspended"
  };

  function apiBase() {
    const configured = window.MOVEMENT_TRAY_PUBLIC_CONFIG?.apiBaseUrl || document.querySelector('meta[name="checkout-api-url"]')?.content || "";
    return configured.trim().replace(/\/$/, "");
  }

  function money(pence = 0) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(pence || 0) / 100);
  }

  function plainDate(value) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function clean(value, fallback = "Not recorded") {
    return String(value || "").trim() || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function setAuthenticated(authenticated) {
    document.body.classList.toggle("authenticated", authenticated);
    document.getElementById("accountEmail").textContent = window.accountService?.currentUser()?.email || "";
  }

  function setStatus(message) {
    document.getElementById("hubStatus").textContent = message;
  }

  function toast(message) {
    const node = document.getElementById("toast");
    node.textContent = message;
    node.classList.add("visible");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => node.classList.remove("visible"), 2400);
  }

  async function hubFetch(path, options = {}) {
    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers: {
        ...(await accountService.authHeaders()),
        "X-Forget-About-Path": window.location.pathname,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Hub request failed.");
    return result;
  }

  function metricCard(label, value, note = "") {
    return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
  }

  function renderMetrics(metrics = {}) {
    document.getElementById("hubMetrics").innerHTML = [
      metricCard("Orders", metrics.totalOrders || 0, `${metrics.paidOrders || 0} paid`),
      metricCard("Gross value", money(metrics.grossPence), "Captured order total"),
      metricCard("Held payouts", money(metrics.heldPayoutPence), "Awaiting completion"),
      metricCard("Pending profiles", metrics.pendingProviderProfiles || 0, "Need review"),
      metricCard("Active jobs", metrics.activeJobs || 0, "Not complete/refunded"),
      metricCard("Launch signups", metrics.launchSignups || 0, "Holding-list records")
    ].join("");
  }

  function founderMetric(label, value, note = "") {
    return `<article class="founder-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
  }

  function founderModule(title, subtitle, body, className = "") {
    return `
      <article class="founder-module ${className}">
        <div class="founder-module-heading"><div><p class="eyebrow">${escapeHtml(subtitle)}</p><h3>${escapeHtml(title)}</h3></div></div>
        ${body}
      </article>
    `;
  }

  function founderRows(rows = []) {
    return `<div class="founder-rows">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
  }

  function founderBreakdown(rows = {}) {
    const entries = Object.entries(rows || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    return entries.length
      ? `<div class="founder-breakdown">${entries.map(([label, count]) => `<span><b>${escapeHtml(count)}</b>${escapeHtml(label)}</span>`).join("")}</div>`
      : `<p class="empty-state compact">No event data yet.</p>`;
  }

  function renderFounderConsole(founder = {}) {
    const executive = founder.executive || {};
    const factory = founder.factory || {};
    const growth = founder.growth || {};
    const finance = founder.finance || {};
    const enterprise = founder.enterprise || {};
    const experiments = founder.experiments || {};
    const decisions = founder.decisions || [];
    const cash = executive.cash || {};
    const fci = executive.fci || {};
    const fva = executive.fva || {};
    const runway = executive.runway || {};
    const pnl = finance.pnl || {};
    const cashFlow = finance.cashFlow || {};
    const contribution = finance.contribution || {};
    const printers = factory.printers || [];
    const printerMap = printers.length
      ? `<div class="printer-map">${printers.slice(0, 8).map((printer) => `
          <article>
            <b>${escapeHtml(printer.displayName || "Printer")}</b>
            <span>${escapeHtml(printer.basedIn || "Unknown")} · ${escapeHtml(printer.postcodeArea || "")}</span>
            <small>${escapeHtml(printer.status || "unknown")} · ${printer.queueLength || 0} active jobs · ${printer.activeCapabilities || 0} capabilities</small>
          </article>
        `).join("")}</div>`
      : `<p class="empty-state compact">No printer profiles yet.</p>`;
    document.getElementById("founderConsole").innerHTML = [
      founderModule("Executive Dashboard", "North Star", `
        <div class="founder-metric-grid">
          ${founderMetric(executive.northStar?.label || "Completed factory jobs", executive.northStar?.value ?? 0, executive.northStar?.note || "")}
          ${founderMetric("Cash signal", money(cash.netCashSignalPence), `${money(cash.grossPence)} gross, ${money(cash.heldProviderLiabilityPence)} held payouts`)}
          ${founderMetric(fci.label || "FCI", `${fci.value ?? 0}%`, fci.note || "")}
          ${founderMetric(fva.label || "FVA", money(fva.valuePence), fva.note || "")}
          ${founderMetric(runway.label || "Runway", runway.value || "Needs cost input", runway.note || "")}
        </div>
        ${(executive.alerts || []).length ? `<div class="founder-alerts">${executive.alerts.map((alert) => `<span>${escapeHtml(alert)}</span>`).join("")}</div>` : `<p class="empty-state compact">No current founder alerts.</p>`}
      `, "wide"),
      founderModule("Factory Control Centre", "Manufacturing", `
        ${founderRows([
          ["Utilisation", `${factory.utilisation || 0}%`],
          ["Order made", factory.queueLengths?.orderMade || 0],
          ["Producing", factory.queueLengths?.producing || 0],
          ["Posted", factory.queueLengths?.posted || 0],
          ["SLA risks", (factory.slaRisks || []).length]
        ])}
        ${printerMap}
      `),
      founderModule("Growth Dashboard", "Demand", `
        ${founderRows([
          ["SEO", growth.seo?.status || "Needs import"],
          ["Indexed route signal", growth.seo?.indexedRoutes || 0],
          ["STL exports", growth.unlockConversions?.stlExports || 0],
          ["Unlocks granted", growth.unlockConversions?.unlocksGranted || 0],
          ["Unlock rate", `${growth.unlockConversions?.unlockRatePercent || 0}%`]
        ])}
        <h4>Generator performance</h4>
        ${founderBreakdown(growth.generatorPerformance)}
      `),
      founderModule("Finance Dashboard", "Money", `
        ${founderRows([
          ["Gross", money(pnl.grossPence)],
          ["Platform revenue", money(pnl.platformRevenuePence)],
          ["Provider share", money(pnl.providerSharePence)],
          ["VAT", money(pnl.vatPence)],
          ["Held payouts", money(cashFlow.heldProviderPayoutsPence)],
          ["Contribution margin", `${contribution.contributionMarginPercent || 0}%`]
        ])}
      `),
      founderModule("Enterprise Dashboard", "B2B", `
        ${founderRows([
          ["ARR", money(enterprise.arrPence)],
          ["Pipeline", enterprise.pipeline?.length || 0],
          ["Onboarding", enterprise.onboarding?.length || 0],
          ["Implementation", enterprise.implementationProgress || "No data yet"]
        ])}
      `),
      founderModule("Experiment Centre", "Learning", `
        ${founderRows([
          ["Active tests", experiments.active?.length || 0],
          ["Pricing signals", Object.values(experiments.pricingSignals || {}).reduce((sum, value) => sum + Number(value || 0), 0)]
        ])}
        <h4>Measured outcomes</h4>
        ${founderBreakdown(experiments.measuredOutcomes)}
      `),
      founderModule("Decision Centre", "AI recommendations", `
        <div class="decision-list">
          ${decisions.map((decision) => `
            <article>
              <span>${escapeHtml(decision.priority || "Watch")}</span>
              <strong>${escapeHtml(decision.title || "Recommendation")}</strong>
              <p>${escapeHtml(decision.rationale || "")}</p>
              <small>${escapeHtml(decision.nextAction || "")}</small>
            </article>
          `).join("")}
        </div>
      `, "wide")
    ].join("");
  }

  function providerCard(profile) {
    const payment = profile.payment_account;
    const paymentText = payment
      ? `Stripe: ${payment.onboarding_complete ? "onboarded" : "incomplete"}, transfers ${payment.transfers_enabled ? "enabled" : "blocked"}`
      : "Stripe: no account connected";
    const statusClass = profile.status === "active" ? "active" : profile.status === "paused" ? "paused" : profile.status === "suspended" ? "suspended" : "pending";
    return `
      <article class="hub-card ${statusClass}" data-provider-profile="${escapeHtml(profile.id)}">
        <div>
          <small>${escapeHtml(statusLabels[profile.status] || profile.status || "Unknown")}</small>
          <h3>${escapeHtml(clean(profile.display_name, "Unnamed provider"))}</h3>
          <p>${escapeHtml(clean(profile.description, "No profile description supplied."))}</p>
          <p><strong>${escapeHtml(clean(profile.based_in, "Unknown location"))}</strong> · ${escapeHtml(clean(profile.postcode_area, "No postcode area"))} · ${profile.active_capability_count || 0}/${profile.capability_count || 0} active capabilities</p>
          <p>${escapeHtml(paymentText)}</p>
        </div>
        <div class="hub-card-actions">
          <button class="button button-primary" data-hub-status="active" data-hub-profile="${escapeHtml(profile.id)}" type="button">Approve</button>
          <button class="button button-secondary" data-hub-status="pending_review" data-hub-profile="${escapeHtml(profile.id)}" type="button">Review</button>
          <button class="button button-secondary" data-hub-status="paused" data-hub-profile="${escapeHtml(profile.id)}" type="button">Pause</button>
          <button class="button button-danger" data-hub-status="suspended" data-hub-profile="${escapeHtml(profile.id)}" type="button">Suspend</button>
        </div>
      </article>
    `;
  }

  function renderProviders(profiles = [], pendingProfiles = []) {
    document.getElementById("providerQueueCount").textContent = `${pendingProfiles.length} waiting`;
    document.getElementById("providerProfiles").innerHTML = profiles.length
      ? profiles.map(providerCard).join("")
      : `<p class="empty-state">No provider profiles have been created yet.</p>`;
  }

  function orderLocation(order) {
    const snapshot = Array.isArray(order.order_customer_snapshots) ? order.order_customer_snapshots[0] : order.order_customer_snapshots;
    const address = snapshot?.shipping_address || snapshot?.billing_address || {};
    return clean(address.city || address.postcode || address.country, "Unknown location");
  }

  function orderCard(order) {
    const jobs = Array.isArray(order.print_jobs) ? order.print_jobs : [];
    return `
      <article class="hub-card">
        <div>
          <small>${escapeHtml(clean(order.brand_key, "unknown"))} · ${escapeHtml(clean(order.status, "unknown"))}</small>
          <h3>${escapeHtml(clean(order.customer_email || order.stripe_customer_email, "Customer order"))}</h3>
          <p>${escapeHtml(orderLocation(order))} · ${plainDate(order.created_at || order.paid_at)} · ${jobs.length} print job${jobs.length === 1 ? "" : "s"}</p>
          <p>Total ${money(order.total_inc_vat || order.amount_total_pence || 0)} · VAT ${money(order.vat_pence || 0)}</p>
        </div>
        <span class="status-pill">${escapeHtml(order.id || "No id")}</span>
      </article>
    `;
  }

  function renderOrders(orders = [], jobs = []) {
    const orderCards = orders.length
      ? orders.map(orderCard).join("")
      : `<p class="empty-state">No orders have been created yet.</p>`;
    const jobCards = jobs.slice(0, 8).map((job) => `
      <article class="hub-card ${job.status === "complete" ? "active" : "pending"}">
        <div>
          <small>${escapeHtml(clean(job.brand_key, "unknown"))} · ${escapeHtml(clean(job.status, "unknown"))}</small>
          <h3>${escapeHtml(clean(job.design_name || job.name, "Print job"))}</h3>
          <p>Provider share ${money(job.provider_share_pence || 0)} · Payout ${escapeHtml(clean(job.payout_status, "held"))}</p>
        </div>
        <span class="status-pill">${escapeHtml(job.id || "No id")}</span>
      </article>
    `).join("");
    document.getElementById("recentOrders").innerHTML = `${orderCards}${jobCards}`;
  }

  function breakdownCard(title, rows = {}) {
    const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
    return `
      <article class="breakdown-card">
        <h3>${escapeHtml(title)}</h3>
        ${entries.length ? entries.map(([label, count]) => `<div class="breakdown-row"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>`).join("") : `<p class="empty-state">No data yet.</p>`}
      </article>
    `;
  }

  function renderBreakdowns(breakdowns = {}) {
    document.getElementById("hubBreakdowns").innerHTML = [
      breakdownCard("Orders by status", breakdowns.ordersByStatus),
      breakdownCard("Orders by brand", breakdowns.ordersByBrand),
      breakdownCard("Orders by location", breakdowns.ordersByLocation),
      breakdownCard("Jobs by status", breakdowns.jobsByStatus)
    ].join("");
  }

  function renderDashboard() {
    const dashboard = state.dashboard || {};
    renderMetrics(dashboard.metrics);
    renderFounderConsole(dashboard.founder);
    renderProviders(dashboard.providerProfiles || [], dashboard.pendingProfiles || []);
    renderOrders(dashboard.recentOrders || [], dashboard.recentJobs || []);
    renderBreakdowns(dashboard.breakdowns);
    setStatus(`Signed in as ${dashboard.admin?.email || accountService.currentUser()?.email || "administrator"}.`);
  }

  async function loadDashboard() {
    if (state.loading) return;
    state.loading = true;
    setStatus("Loading Hub...");
    try {
      state.dashboard = await hubFetch("/api/hub/dashboard");
      renderDashboard();
    } catch (error) {
      if (/restricted|administrator|403/i.test(error.message)) {
        setStatus("Hub access is restricted to watson.john@live.co.uk.");
      } else {
        setStatus(error.message);
      }
      throw error;
    } finally {
      state.loading = false;
    }
  }

  async function configureProviderButtons() {
    const providers = await accountService.providerAvailability();
    document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
      const configured = providers[button.dataset.oauthProvider];
      button.hidden = configured === false;
      button.disabled = configured === false;
    });
    const available = Object.entries(providers).filter(([, enabled]) => enabled).map(([provider]) => provider);
    document.getElementById("oauthStatus").textContent = available.length ? `${available.join(" and ")} sign-in available.` : "Password sign-in is available.";
  }

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll("[data-hub-tab]").forEach((button) => button.classList.toggle("active", button.dataset.hubTab === tab));
    document.querySelectorAll("[data-hub-panel]").forEach((panel) => {
      const active = panel.dataset.hubPanel === tab;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  async function updateProfileStatus(profileId, status) {
    await hubFetch(`/api/hub/printer-profiles/${encodeURIComponent(profileId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status, acceptingJobs: status === "active" })
    });
    await loadDashboard();
    toast(`Provider marked ${statusLabels[status] || status}.`);
  }

  async function init() {
    try {
      const session = await accountService.init();
      await configureProviderButtons();
      setAuthenticated(Boolean(session));
      if (session) await loadDashboard();
      else setStatus(accountService.authError() || "Sign in to open Hub.");
    } catch (error) {
      setAuthenticated(false);
      setStatus(error.message || "Hub could not be opened.");
    }
  }

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("loginError");
    message.textContent = "Signing in...";
    try {
      await accountService.signIn(document.getElementById("loginEmail").value, document.getElementById("loginPassword").value);
      setAuthenticated(true);
      await loadDashboard();
      message.textContent = "";
    } catch (error) {
      setAuthenticated(false);
      message.textContent = error.message;
    }
  });

  document.getElementById("createAccount").addEventListener("click", () => {
    accountAuthFlow.openCreateAccount({
      email: document.getElementById("loginEmail").value,
      password: document.getElementById("loginPassword").value,
      surfaceLabel: "Forget About Hub",
      notify: (text) => { document.getElementById("loginError").textContent = text; }
    });
  });

  document.getElementById("forgotPassword").addEventListener("click", () => {
    accountAuthFlow.openPasswordReset({
      email: document.getElementById("loginEmail").value,
      surfaceLabel: "Forget About Hub",
      notify: (text) => { document.getElementById("loginError").textContent = text; }
    });
  });

  document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        document.getElementById("loginError").textContent = `Opening ${button.textContent.trim()} sign in...`;
        await accountService.signInWithProvider(button.dataset.oauthProvider);
      } catch (error) {
        document.getElementById("loginError").textContent = error.message;
      }
    });
  });

  document.querySelectorAll("[data-hub-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.hubTab));
  });

  document.getElementById("providerProfiles").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-hub-status]");
    if (!button) return;
    try {
      await updateProfileStatus(button.dataset.hubProfile, button.dataset.hubStatus);
    } catch (error) {
      toast(error.message);
    }
  });

  document.getElementById("logoutButton").addEventListener("click", async () => {
    await accountService.signOut();
    state.dashboard = null;
    setAuthenticated(false);
    setStatus("Signed out.");
  });

  document.getElementById("hubRefresh").addEventListener("click", async () => {
    try {
      await loadDashboard();
      toast("Hub refreshed.");
    } catch (error) {
      toast(error.message);
    }
  });

  init();
})();
