let factoryDashboardState = { profile: null, capabilities: [], jobs: [], transfers: [], paymentAccount: null };
let toastTimer;
const standardColours = [
  ["all", "All standard colours", "#8b9499"], ["black", "Black", "#202223"], ["white", "White", "#f1f2ee"],
  ["grey", "Grey", "#777c7d"], ["red", "Red", "#b93636"], ["orange", "Orange", "#e87524"],
  ["yellow", "Yellow", "#f3c623"], ["green", "Green", "#398052"], ["blue", "Blue", "#32658c"],
  ["purple", "Purple", "#6e4b8b"], ["pink", "Pink", "#d98c9b"], ["rose-gold", "Rose Gold", "#b76e79"],
  ["brown", "Brown", "#6f4e37"]
].map(([key, name, hex]) => ({ key, name, hex }));
const postageServices = [
  { key: "evri-standard", name: "Evri Standard 0-1kg", pricePence: 329, days: 3 },
  { key: "evri-next-day", name: "Evri Next Day 0-1kg", pricePence: 412, days: 1 },
  { key: "royal-mail-2nd", name: "Royal Mail 2nd Class small parcel", pricePence: 395, days: 3 },
  { key: "royal-mail-1st", name: "Royal Mail 1st Class small parcel", pricePence: 515, days: 1 }
];

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
    headers: { ...(await accountService.authHeaders()), "X-Forget-About-Path": window.location.pathname, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Factory request failed.");
  return result;
}

async function factoryDownload(path, filename, open = false) {
  const targetWindow = open ? window.open("", "_blank") : null;
  if (targetWindow) targetWindow.opener = null;
  const response = await fetch(`${apiBase()}${path}`, { headers: { ...(await accountService.authHeaders()), "X-Forget-About-Path": window.location.pathname } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Download failed.");
  const url = URL.createObjectURL(await response.blob());
  if (open && targetWindow) targetWindow.location.href = url;
  else if (open) window.open(url, "_blank", "noopener");
  else {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
      <p>${capability.max_width_mm} × ${capability.max_depth_mm} × ${capability.max_height_mm} mm · Printer fee ${money(capability.base_price_pence)} per print · ${capability.grams_per_hour || 12} g/hour · ${escapeHtml(postageServices.find((service) => service.key === capability.postage_service)?.name || capability.postage_service || "Postage")} ${money(capability.postage_pence)}</p></div>
      <button class="button button-secondary" data-remove-capability="${escapeHtml(capability.id)}" type="button">Remove</button>
    </article>
  `).join("") : '<div class="empty-state">Add at least one material and colour before the profile can receive marketplace jobs.</div>';
}

function renderJobs() {
  const jobs = factoryDashboardState.jobs.filter((job) => job.status !== "pending_payment");
  const active = jobs.filter((job) => ["order_made", "producing", "posted"].includes(job.status));
  document.getElementById("activeJobCount").textContent = active.length;
  document.getElementById("factoryJobs").innerHTML = jobs.length ? jobs.map((job) => `
    <article class="job-card brand-${escapeHtml(job.brand_key)}" data-job-id="${escapeHtml(job.id)}">
      <span class="job-brand-marker">${job.brand_key === "makeup" ? "MAKEUP" : "TRAY"}</span>
      <div><h3>${escapeHtml(job.design_snapshot?.name || job.generator_type.replaceAll("_", " "))}</h3>
      <p>Status: <strong>${escapeHtml(job.status.replaceAll("_", " "))}</strong> · ${escapeHtml(job.colour_key)} · Estimated ${job.design_snapshot?.estimatedWeightGrams || "?"}g</p>
      <p>Provider payout ${money(job.provider_share_pence)} · Created ${new Date(job.created_at).toLocaleString()}${job.tracking_reference ? ` · Tracking ${escapeHtml(job.tracking_reference)}` : ""}</p></div>
      <button class="button button-primary" data-open-job="${escapeHtml(job.id)}" type="button">Open order</button>
    </article>
  `).join("") : '<div class="empty-state">No assigned jobs yet. Approved profiles with active capabilities become selectable by customers.</div>';
}

function showJobDetail(jobId) {
  const job = factoryDashboardState.jobs.find((candidate) => candidate.id === jobId);
  if (!job) return;
  const order = Array.isArray(job.orders) ? job.orders[0] : job.orders;
  const snapshot = Array.isArray(order?.order_customer_snapshots) ? order.order_customer_snapshots[0] : order?.order_customer_snapshots;
  const address = snapshot?.delivery_address || {};
  const events = Array.isArray(job.print_job_events) ? job.print_job_events : [];
  const quote = Array.isArray(job.print_quotes) ? job.print_quotes[0] : job.print_quotes;
  const nextStatuses = job.status === "order_made" ? ["producing"] : job.status === "producing" ? ["posted"] : [];
  document.getElementById("jobDialogTitle").textContent = job.design_snapshot?.name || `${job.brand_key} order`;
  document.getElementById("jobDialogContent").innerHTML = `
    <div class="job-detail-hero brand-${escapeHtml(job.brand_key)}"><strong>${job.brand_key === "makeup" ? "MAKEUP" : "TRAY"}</strong><span>${escapeHtml(job.status.replaceAll("_", " "))}</span></div>
    <div class="job-detail-grid">
      <div><span>Colour</span><strong>${escapeHtml(job.colour_key)}</strong></div>
      <div><span>Material estimate</span><strong>${job.design_snapshot?.estimatedWeightGrams || quote?.estimated_weight_grams || "?"} g</strong></div>
      <div><span>Print time</span><strong>${job.design_snapshot?.estimatedPrintHours || quote?.estimated_print_hours || "?"} hours</strong></div>
      <div><span>Tracking</span><strong>${escapeHtml(job.tracking_reference || "Not posted")}</strong></div>
    </div>
    <section class="job-breakdown"><h3>Order breakdown</h3>
      <p><span>Material</span><strong>${money(job.material_cost_pence)}</strong></p>
      <p><span>Printer fee</span><strong>${money(job.printer_fee_pence)}</strong></p>
      <p><span>Postage</span><strong>${money(job.postage_pence)}</strong></p>
      <p><span>Your payout</span><strong>${money(job.provider_share_pence)}</strong></p>
      <p><span>Forget About commission (10%)</span><strong>${money(job.commission_pence)}</strong></p>
      <p><span>Platform fee</span><strong>${money(job.platform_fee_pence)}</strong></p>
    </section>
    <section class="job-address"><h3>Delivery address</h3><p>${[snapshot?.customer_name, address.line1, address.line2, address.city || address.town, address.county, address.postal_code || address.postcode, address.country].filter(Boolean).map(escapeHtml).join("<br>") || "Address pending payment confirmation."}</p></section>
    <div class="job-downloads"><button class="button button-secondary" data-job-label="${escapeHtml(job.id)}">Open postage label</button><button class="button button-secondary" data-job-stl="${escapeHtml(job.id)}">Download STL</button></div>
    ${nextStatuses.length ? `<div class="job-status-form"><label>Change status<select data-job-next-status>${nextStatuses.map((status) => `<option value="${status}">${status.replaceAll("_", " ")}</option>`).join("")}</select></label><label>Tracking number<input data-job-tracking value="${escapeHtml(job.tracking_reference || "")}"></label><button class="button button-primary" data-save-job-status="${escapeHtml(job.id)}">Update order</button></div>` : ""}
    <div class="job-note-form"><label>Order note<textarea data-job-note rows="3" placeholder="Add a note visible in the order history"></textarea></label><button class="button button-secondary" data-save-job-note="${escapeHtml(job.id)}">Add note</button></div>
    ${events.length ? `<section class="job-events"><h3>Order history</h3>${events.map((event) => `<p><strong>${escapeHtml(event.to_status.replaceAll("_", " "))}</strong><span>${escapeHtml(event.note || "")}</span><small>${new Date(event.created_at).toLocaleString()}</small></p>`).join("")}</section>` : ""}
  `;
  const dialog = document.getElementById("factoryJobDialog");
  if (!dialog.open) dialog.showModal();
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
  document.getElementById("capabilityColourName").innerHTML = standardColours.map((colour) => `<option value="${colour.key}">${colour.name}</option>`).join("");
  document.getElementById("capabilityPostage").innerHTML = postageServices.map((service) => `<option value="${service.key}">${service.name} · ${money(service.pricePence)} · ${service.days} day${service.days === 1 ? "" : "s"}</option>`).join("");
  updateColourSample();
  try {
    const session = await accountService.init();
    setAuthenticated(Boolean(session));
    if (session) await loadDashboard();
  } catch (error) {
    setAuthenticated(false);
    document.getElementById("factoryLoginMessage").textContent = error.message;
  }
}

function updateColourSample() {
  const colour = standardColours.find((candidate) => candidate.key === document.getElementById("capabilityColourName").value) || standardColours[0];
  document.getElementById("capabilityColourSample").style.background = colour.hex;
  document.getElementById("capabilityColourSample").title = colour.name;
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
        colourKey: document.getElementById("capabilityColourName").value,
        maxWidthMm: Number(document.getElementById("capabilityMaxWidth").value),
        maxDepthMm: Number(document.getElementById("capabilityMaxDepth").value),
        maxHeightMm: Number(document.getElementById("capabilityMaxHeight").value),
        basePricePence: poundsToPence("capabilityBasePrice"),
        gramsPerHour: Number(document.getElementById("capabilityGramsPerHour").value),
        postageService: document.getElementById("capabilityPostage").value
      })
    });
    await loadDashboard();
    toast("Print capability added");
  } catch (error) {
    toast(error.message);
  }
});
document.getElementById("capabilityColourName").addEventListener("change", updateColourSample);

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

document.getElementById("factoryJobs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-job]");
  if (button) showJobDetail(button.dataset.openJob);
});
document.getElementById("closeJobDialog").addEventListener("click", () => document.getElementById("factoryJobDialog").close());
document.getElementById("jobDialogContent").addEventListener("click", async (event) => {
  try {
    const statusButton = event.target.closest("[data-save-job-status]");
    const noteButton = event.target.closest("[data-save-job-note]");
    const stlButton = event.target.closest("[data-job-stl]");
    const labelButton = event.target.closest("[data-job-label]");
    if (stlButton) return factoryDownload(`/api/factory/jobs/${encodeURIComponent(stlButton.dataset.jobStl)}/stl`, `print-job-${stlButton.dataset.jobStl}.stl`);
    if (labelButton) return factoryDownload(`/api/factory/jobs/${encodeURIComponent(labelButton.dataset.jobLabel)}/label`, "", true);
    if (statusButton) {
      await factoryFetch(`/api/factory/jobs/${encodeURIComponent(statusButton.dataset.saveJobStatus)}/status`, {
        method: "POST",
        body: JSON.stringify({
          status: document.querySelector("[data-job-next-status]").value,
          trackingReference: document.querySelector("[data-job-tracking]").value,
          note: document.querySelector("[data-job-note]").value
        })
      });
    }
    if (noteButton) {
      await factoryFetch(`/api/factory/jobs/${encodeURIComponent(noteButton.dataset.saveJobNote)}/note`, {
        method: "POST",
        body: JSON.stringify({ note: document.querySelector("[data-job-note]").value })
      });
    }
    if (statusButton || noteButton) {
      await loadDashboard();
      showJobDetail(statusButton?.dataset.saveJobStatus || noteButton.dataset.saveJobNote);
      toast("Order updated");
    }
  } catch (error) {
    toast(error.message);
  }
});

initializeFactory();
