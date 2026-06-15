let factoryDashboardState = { profile: null, capabilities: [], jobs: [], transfers: [], paymentAccount: null };
let toastTimer;

function apiBase() {
  return document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "");
}

function money(pence, currency = "gbp") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: String(currency || "gbp").toUpperCase() }).format(Number(pence || 0) / 100);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function toast(message) {
  const element = document.getElementById("factoryToast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 2600);
}

async function factoryFetch(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { ...(await accountService.authHeaders()), ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Factory request failed.");
  return result;
}

function setAuthenticated(authenticated) {
  document.body.classList.toggle("authenticated", authenticated);
  document.getElementById("factoryAccountEmail").textContent = accountService.currentUser()?.email || "";
}

function setTab(tab) {
  document.querySelectorAll("[data-factory-tab]").forEach((button) => button.classList.toggle("active", button.dataset.factoryTab === tab));
  document.querySelectorAll("[data-factory-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.factoryPanel !== tab;
    panel.classList.toggle("active", panel.dataset.factoryPanel === tab);
  });
}

function renderProfile() {
  const profile = factoryDashboardState.profile;
  document.getElementById("factoryProfileStatus").textContent = profile ? profile.status.replace("_", " ") : "Setup required";
  document.getElementById("factoryAcceptingStatus").textContent = profile?.accepting_jobs ? "Accepting jobs" : profile ? "Not accepting jobs" : "Profile setup required";
  document.getElementById("printerDisplayName").value = profile?.display_name || "";
  document.getElementById("printerBasedIn").value = profile?.based_in || "";
  document.getElementById("printerPostcodeArea").value = profile?.postcode_area || "";
  document.getElementById("printerLeadTime").value = profile?.lead_time_days || 7;
  document.getElementById("printerDescription").value = profile?.description || "";
  document.getElementById("printerAcceptingJobs").checked = Boolean(profile?.accepting_jobs);
  document.getElementById("factoryRating").textContent = profile?.rating_count ? `${Number(profile.rating_average).toFixed(1)} / 5` : "New";
}

function renderCapabilities() {
  const capabilities = factoryDashboardState.capabilities;
  document.getElementById("factoryCapabilities").innerHTML = capabilities.length ? capabilities.map((capability) => `
    <article class="capability-card">
      <div><h3><span class="colour-chip" style="background:${escapeHtml(capability.colour_hex || "#cccccc")}"></span> ${escapeHtml(capability.colour_name)} · ${escapeHtml(capability.material.toUpperCase())}</h3>
      <p>${capability.max_width_mm} × ${capability.max_depth_mm} × ${capability.max_height_mm} mm · Base ${money(capability.base_price_pence)} · ${money(capability.price_per_cm3_pence)}/cm³ · Postage ${money(capability.postage_pence)}</p></div>
      <button class="button button-secondary" data-remove-capability="${escapeHtml(capability.id)}" type="button">Remove</button>
    </article>
  `).join("") : '<div class="empty-state">Add at least one material and colour before the profile can receive marketplace jobs.</div>';
}

function nextJobAction(job) {
  if (job.status === "order_made") return '<button class="button button-primary" data-job-status="producing" type="button">Start producing</button>';
  if (job.status === "producing") return `<input data-job-tracking placeholder="Tracking reference"><button class="button button-primary" data-job-status="posted" type="button">Mark posted</button>`;
  return "";
}

function renderJobs() {
  const jobs = factoryDashboardState.jobs;
  const active = jobs.filter((job) => ["order_made", "producing", "posted"].includes(job.status));
  document.getElementById("activeJobCount").textContent = active.length;
  document.getElementById("factoryJobs").innerHTML = jobs.length ? jobs.map((job) => `
    <article class="job-card" data-job-id="${escapeHtml(job.id)}">
      <div><h3>${escapeHtml(job.brand_key)} · ${escapeHtml(job.generator_type.replaceAll("_", " "))}</h3>
      <p>Status: <strong>${escapeHtml(job.status.replaceAll("_", " "))}</strong> · ${escapeHtml(job.material.toUpperCase())} / ${escapeHtml(job.colour_key)} · Provider share ${money(job.provider_share_pence)}</p>
      <p>Created ${new Date(job.created_at).toLocaleString()}${job.tracking_reference ? ` · Tracking ${escapeHtml(job.tracking_reference)}` : ""}</p></div>
      <div class="job-card-actions">${nextJobAction(job)}</div>
    </article>
  `).join("") : '<div class="empty-state">No assigned jobs yet. Approved profiles with active capabilities become selectable by customers.</div>';
}

function renderPayouts() {
  const transfers = factoryDashboardState.transfers;
  const jobs = factoryDashboardState.jobs;
  const held = jobs.filter((job) => job.payout_status === "held").reduce((total, job) => total + Number(job.provider_share_pence || 0), 0);
  document.getElementById("heldPayoutTotal").textContent = money(held);
  const payment = factoryDashboardState.paymentAccount;
  document.getElementById("connectStatus").textContent = payment?.onboarding_complete ? "Stripe Connect ready" : "Stripe Connect not onboarded";
  document.getElementById("factoryPayouts").innerHTML = transfers.length ? transfers.map((transfer) => `
    <article class="payout-card"><div><strong>${money(transfer.amount_pence, transfer.currency)}</strong><p>${escapeHtml(transfer.status)} · Created ${new Date(transfer.created_at).toLocaleDateString()}</p></div><span class="status-pill">${escapeHtml(transfer.status)}</span></article>
  `).join("") : '<div class="empty-state">No provider transfers yet. A held transfer is released only after its print job reaches complete.</div>';
}

function renderDashboard() {
  renderProfile();
  renderCapabilities();
  renderJobs();
  renderPayouts();
}

async function loadDashboard() {
  factoryDashboardState = await factoryFetch("/api/factory/dashboard");
  renderDashboard();
}

async function initializeFactory() {
  try {
    const session = await accountService.init();
    setAuthenticated(Boolean(session));
    if (session) await loadDashboard();
  } catch (error) {
    setAuthenticated(false);
    document.getElementById("factoryLoginMessage").textContent = error.message;
  }
}

document.getElementById("factoryLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.getElementById("factoryLoginMessage");
  message.textContent = "Signing in...";
  try {
    await accountService.signIn(document.getElementById("factoryEmail").value, document.getElementById("factoryPassword").value);
    setAuthenticated(true);
    await loadDashboard();
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
  }
});

document.getElementById("createFactoryAccount").addEventListener("click", async () => {
  const email = document.getElementById("factoryEmail").value;
  const password = document.getElementById("factoryPassword").value;
  const message = document.getElementById("factoryLoginMessage");
  if (!email || password.length < 8) return message.textContent = "Enter an email and a password of at least eight characters.";
  try {
    const result = await accountService.signUp(email, password);
    message.textContent = result.access_token ? "Printer account created." : "Printer account created. Check your email to confirm it, then sign in.";
    if (result.access_token) {
      setAuthenticated(true);
      await loadDashboard();
      setTab("profile");
    }
  } catch (error) {
    message.textContent = error.message;
  }
});

document.getElementById("factoryLogout").addEventListener("click", async () => { await accountService.signOut(); setAuthenticated(false); });
document.getElementById("factoryRefresh").addEventListener("click", async () => { await loadDashboard(); toast("Factory data refreshed"); });
document.getElementById("startConnectOnboarding").addEventListener("click", async () => {
  try {
    const result = await factoryFetch("/api/factory/connect/start", { method: "POST", body: "{}" });
    window.location.assign(result.url);
  } catch (error) {
    toast(error.message);
  }
});
document.getElementById("refreshConnectStatus").addEventListener("click", async () => {
  try {
    const result = await factoryFetch("/api/factory/connect/status", { method: "POST", body: "{}" });
    await loadDashboard();
    toast(result.paymentAccount?.onboarding_complete ? "Stripe Connect is ready" : "Stripe still needs more onboarding information");
  } catch (error) {
    toast(error.message);
  }
});
document.querySelectorAll("[data-factory-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.factoryTab)));

document.getElementById("factoryProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await factoryFetch("/api/factory/profile", {
      method: "POST",
      body: JSON.stringify({
        displayName: document.getElementById("printerDisplayName").value,
        basedIn: document.getElementById("printerBasedIn").value,
        postcodeArea: document.getElementById("printerPostcodeArea").value,
        leadTimeDays: Number(document.getElementById("printerLeadTime").value),
        description: document.getElementById("printerDescription").value,
        acceptingJobs: document.getElementById("printerAcceptingJobs").checked
      })
    });
    await loadDashboard();
    toast("Provider profile saved");
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById("factoryCapabilityForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const poundsToPence = (id) => Math.round(Number(document.getElementById(id).value || 0) * 100);
  try {
    await factoryFetch("/api/factory/capabilities", {
      method: "POST",
      body: JSON.stringify({
        material: document.getElementById("capabilityMaterial").value,
        colourName: document.getElementById("capabilityColourName").value,
        colourHex: document.getElementById("capabilityColourHex").value,
        maxWidthMm: Number(document.getElementById("capabilityMaxWidth").value),
        maxDepthMm: Number(document.getElementById("capabilityMaxDepth").value),
        maxHeightMm: Number(document.getElementById("capabilityMaxHeight").value),
        basePricePence: poundsToPence("capabilityBasePrice"),
        pricePerCm3Pence: poundsToPence("capabilityVolumePrice"),
        postagePence: poundsToPence("capabilityPostage")
      })
    });
    document.getElementById("capabilityColourName").value = "";
    await loadDashboard();
    toast("Print capability added");
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById("factoryCapabilities").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-capability]");
  if (!button) return;
  try {
    await factoryFetch(`/api/factory/capabilities/${encodeURIComponent(button.dataset.removeCapability)}`, { method: "DELETE" });
    await loadDashboard();
    toast("Print capability removed");
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById("factoryJobs").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-job-status]");
  const card = event.target.closest("[data-job-id]");
  if (!button || !card) return;
  try {
    await factoryFetch(`/api/factory/jobs/${encodeURIComponent(card.dataset.jobId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status: button.dataset.jobStatus, trackingReference: card.querySelector("[data-job-tracking]")?.value || "" })
    });
    await loadDashboard();
    toast(`Job marked ${button.dataset.jobStatus}`);
  } catch (error) {
    toast(error.message);
  }
});

initializeFactory();
