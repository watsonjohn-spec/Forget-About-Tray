(function () {
  const state = {
    dashboard: null,
    activeTab: "providers",
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
