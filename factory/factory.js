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
const commonPrinters = [
  { key: "bambu-a1-mini", name: "Bambu Lab A1 mini", width: 180, depth: 180, height: 180, gramsPerHour: 42 },
  { key: "bambu-a1", name: "Bambu Lab A1", width: 256, depth: 256, height: 256, gramsPerHour: 48 },
  { key: "bambu-p1s", name: "Bambu Lab P1S", width: 256, depth: 256, height: 256, gramsPerHour: 55 },
  { key: "bambu-x1-carbon", name: "Bambu Lab X1 Carbon", width: 256, depth: 256, height: 256, gramsPerHour: 58 },
  { key: "prusa-mk4s", name: "Original Prusa MK4S", width: 250, depth: 210, height: 220, gramsPerHour: 38 },
  { key: "creality-k1", name: "Creality K1", width: 220, depth: 220, height: 250, gramsPerHour: 48 },
  { key: "elegoo-neptune-4", name: "Elegoo Neptune 4", width: 225, depth: 225, height: 265, gramsPerHour: 42 },
  { key: "custom", name: "Custom printer", width: 256, depth: 256, height: 256, gramsPerHour: 48 }
];

function apiBase() {
  return document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "");
}

function money(pence, currency = "gbp") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: String(currency || "gbp").toUpperCase() }).format(Number(pence || 0) / 100);
}

function labelText(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function brandLabel(key) {
  const brand = window.FORGET_ABOUT_PLATFORM_CONFIG?.brands?.find((candidate) => candidate.key === key);
  return (brand?.factoryLabel || brand?.shortName || brand?.name || String(key || "job")).toUpperCase();
}

function jobNextAction(job) {
  if (job.status === "order_made") return "Accept or decline";
  if (job.status === "producing") return "Add tracking and post";
  if (job.status === "posted") return "Await buyer confirmation";
  if (job.status === "complete") return "Complete";
  if (job.status === "refunded") return "Refunded";
  if (job.status === "cancelled") return "Cancelled";
  return labelText(job.status || "pending");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function printEstimateTools() {
  return window.forgetPrintEstimates;
}

function printTimeLabel(hours) {
  return printEstimateTools().printTimeLabel(Number(hours || 0));
}

function providerLocalSettings() {
  return JSON.parse(localStorage.getItem("forget-about-factory-profile-settings") || "{}");
}

function saveProviderLocalSettings(settings) {
  localStorage.setItem("forget-about-factory-profile-settings", JSON.stringify({ ...providerLocalSettings(), ...settings }));
}

function jobWeightGrams(job) {
  const quote = jobQuote(job);
  return Number(job.design_snapshot?.estimatedWeightGrams || quote?.estimated_weight_grams || 0);
}

function jobPrintHours(job) {
  const quote = jobQuote(job);
  return Number(job.design_snapshot?.estimatedPrintHours || quote?.estimated_print_hours || 0);
}

function renderTimeCalculator() {
  const tools = printEstimateTools();
  const weight = Number(document.getElementById("factoryCalcWeight").value || 0);
  const rate = Number(document.getElementById("factoryCalcRate").value || tools.defaultPrintTimeModel.gramsPerHour);
  const setup = Number(document.getElementById("factoryCalcSetup").value || tools.defaultPrintTimeModel.setupMinutes);
  document.getElementById("factoryCalcTime").textContent = tools.printTimeLabel(tools.estimatedPrintHours(weight, rate, setup));
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

async function configureProviderButtons() {
  const providers = await accountService.providerAvailability();
  document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
    const configured = providers[button.dataset.oauthProvider];
    button.hidden = configured === false;
    button.disabled = configured === false;
    button.title = configured === false ? `${button.textContent.trim()} sign-in is not configured in Supabase yet.` : "";
  });
  const configured = Object.entries(providers).filter(([, enabled]) => enabled === true).map(([provider]) => provider);
  const unknown = Object.values(providers).some((enabled) => enabled === null);
  document.getElementById("oauthStatus").textContent = unknown
    ? "Social sign-in status could not be checked. Email sign-in remains available."
    : configured.length
      ? `${configured.map((provider) => provider[0].toUpperCase() + provider.slice(1)).join(" and ")} sign-in ready.`
      : "Google sign-in requires provider credentials in Supabase. Email sign-in remains available.";
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
  const localSettings = providerLocalSettings();
  document.getElementById("factoryProfileStatus").textContent = profile ? labelText(profile.status) : "Setup required";
  document.getElementById("factoryAcceptingStatus").textContent = profile?.accepting_jobs ? "Accepting jobs" : profile ? "Not accepting jobs" : "Profile setup required";
  document.getElementById("printerDisplayName").value = profile?.display_name || "";
  document.getElementById("printerBasedIn").value = profile?.based_in || "";
  document.getElementById("printerPostcodeArea").value = profile?.postcode_area || "";
  document.getElementById("printerModel").value = localSettings.printerModel || "bambu-a1";
  document.getElementById("printerLeadTime").value = profile?.lead_time_days || 7;
  document.getElementById("printerDescription").value = profile?.description || "";
  document.getElementById("printerAcceptingJobs").checked = Boolean(profile?.accepting_jobs);
  document.getElementById("factoryRating").textContent = profile?.rating_count ? `${Number(profile.rating_average).toFixed(1)} / 5` : "New";
}

function renderCapabilities() {
  const capabilities = factoryDashboardState.capabilities;
  document.getElementById("factoryCapabilities").innerHTML = capabilities.length ? capabilities.map((capability) => `
    <article class="capability-card">
      <div><h3><span class="colour-chip" style="background:${escapeHtml(capability.colour_hex || "#cccccc")}"></span> ${escapeHtml(capability.colour_name)} | ${escapeHtml(capability.material.toUpperCase())}</h3>
      <p>${capability.max_width_mm} x ${capability.max_depth_mm} x ${capability.max_height_mm} mm | Printer fee ${money(capability.base_price_pence)} per print | ${capability.grams_per_hour || printEstimateTools().defaultPrintTimeModel.gramsPerHour} g/hour | ${escapeHtml(postageServices.find((service) => service.key === capability.postage_service)?.name || capability.postage_service || "Postage")} ${money(capability.postage_pence)}</p></div>
      <button class="button button-secondary" data-remove-capability="${escapeHtml(capability.id)}" type="button">Remove</button>
    </article>
  `).join("") : '<div class="empty-state">Add at least one material and colour before the profile can receive marketplace jobs.</div>';
}

function jobOrder(job) {
  return Array.isArray(job.orders) ? job.orders[0] : job.orders;
}

function jobQuote(job) {
  return Array.isArray(job.print_quotes) ? job.print_quotes[0] : job.print_quotes;
}

function jobVatPence(job) {
  const order = jobOrder(job);
  const quote = jobQuote(job);
  return Number(order?.vat_amount ?? quote?.vat_amount_pence ?? 0);
}

function jobCustomerTotalPence(job) {
  const order = jobOrder(job);
  const quote = jobQuote(job);
  return Number(order?.total_inc_vat ?? quote?.total_inc_vat_pence ?? 0);
}

function jobStatusFinancials(jobs) {
  return ["order_made", "producing", "posted", "complete", "cancelled", "refunded"].map((status) => {
    const statusJobs = jobs.filter((job) => job.status === status);
    return {
      status,
      count: statusJobs.length,
      providerShare: statusJobs.reduce((total, job) => total + Number(job.provider_share_pence || 0), 0),
      customerTotal: statusJobs.reduce((total, job) => total + jobCustomerTotalPence(job), 0)
    };
  });
}

function filteredJobs(jobs) {
  const status = document.getElementById("jobStatusFilter")?.value || "";
  const brand = document.getElementById("jobBrandFilter")?.value || "";
  const payout = document.getElementById("jobPayoutFilter")?.value || "";
  const search = (document.getElementById("jobSearchFilter")?.value || "").trim().toLowerCase();
  return jobs.filter((job) => {
    const haystack = [
      job.id,
      job.status,
      job.brand_key,
      job.generator_type,
      job.colour_key,
      job.design_snapshot?.name,
      job.tracking_reference,
      jobOrder(job)?.invoice_number
    ].filter(Boolean).join(" ").toLowerCase();
    return (!status || job.status === status)
      && (!brand || job.brand_key === brand)
      && (!payout || job.payout_status === payout)
      && (!search || haystack.includes(search));
  });
}

function drillableBillingStatusMarkup(jobs) {
  return `<section class="billing-status-grid">${jobStatusFinancials(jobs).map((item) => `
    <article data-status-drill="${escapeHtml(item.status)}"><span>${escapeHtml(labelText(item.status))}</span><strong>${money(item.providerShare)}</strong><small>${item.count} job${item.count === 1 ? "" : "s"} | customer total ${money(item.customerTotal)}</small></article>
  `).join("")}</section>`;
}

function jobEscalation(job) {
  const events = Array.isArray(job?.print_job_events) ? job.print_job_events : [];
  return events.filter((event) => event.event_type === "customer_escalation")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
}

function renderJobs() {
  const allJobs = factoryDashboardState.jobs.filter((job) => job.status !== "pending_payment");
  const jobs = filteredJobs(allJobs);
  const active = allJobs.filter((job) => ["order_made", "producing", "posted"].includes(job.status));
  document.getElementById("activeJobCount").textContent = active.length;
  document.getElementById("factoryJobs").innerHTML = jobs.length ? jobs.map((job) => `
    <article class="job-card brand-${escapeHtml(job.brand_key)}${jobEscalation(job) ? " job-escalated" : ""}" data-job-id="${escapeHtml(job.id)}">
      <span class="job-brand-marker">${escapeHtml(brandLabel(job.brand_key))}</span>
      <div><h3>${escapeHtml(job.design_snapshot?.name || job.generator_type.replaceAll("_", " "))}</h3>
      <p>Status: <strong>${escapeHtml(labelText(job.status))}</strong> | Next: ${escapeHtml(jobNextAction(job))} | ${escapeHtml(job.colour_key)} | ${jobWeightGrams(job) || "?"}g | ${jobPrintHours(job) ? printTimeLabel(jobPrintHours(job)) : "time pending"}</p>
      <p>Provider payout ${money(job.provider_share_pence)} | Created ${new Date(job.created_at).toLocaleString()}${job.tracking_reference ? ` | Tracking ${escapeHtml(job.tracking_reference)}` : ""}</p></div>
      ${jobEscalation(job) ? `<span class="job-escalation-pill">Escalated</span>` : ""}
      <button class="button button-primary" data-open-job="${escapeHtml(job.id)}" type="button">Open order</button>
    </article>
  `).join("") : '<div class="empty-state">No jobs match these filters.</div>';
  document.getElementById("factoryJobs").insertAdjacentHTML("afterbegin", drillableBillingStatusMarkup(jobs));
}

function eventTitle(event) {
  const type = event.event_type || "status";
  if (type === "provider_message") return "Message to buyer";
  if (type === "customer_message") return "Message from buyer";
  if (type === "decline") return "Declined and refunded";
  if (type === "customer_escalation") return "Escalated by buyer";
  if (type === "auto_complete") return "Automatically completed";
  return labelText(event.to_status || "status");
}

function renderJobEvents(events) {
  return events.length ? `<section class="job-events"><h3>Messages and history</h3>${events.map((event) => `<p class="event-${escapeHtml(event.event_type || "status")}"><strong>${eventTitle(event)}</strong><span>${escapeHtml(event.note || "")}</span><small>${new Date(event.created_at).toLocaleString()}</small></p>`).join("")}</section>` : "";
}

function showJobDetail(jobId) {
  const job = factoryDashboardState.jobs.find((candidate) => candidate.id === jobId);
  if (!job) return;
  const order = jobOrder(job);
  const snapshot = Array.isArray(order?.order_customer_snapshots) ? order.order_customer_snapshots[0] : order?.order_customer_snapshots;
  const address = snapshot?.delivery_address || {};
  const events = Array.isArray(job.print_job_events) ? job.print_job_events : [];
  const escalation = jobEscalation(job);
  const actionPanel = job.status === "order_made" ? `
    <section class="job-action-panel">
      <h3>Accept or decline this job</h3>
      <p>Accepting starts production and locks the buyer refund route. Declining now refunds the buyer and removes the held payout.</p>
      <div class="job-action-row"><button class="button button-primary" data-start-job="${escapeHtml(job.id)}" type="button">Accept job and start production</button></div>
      <label>Decline reason<textarea data-decline-reason rows="3" placeholder="Tell the buyer why the job cannot be fulfilled"></textarea></label>
      <button class="button button-danger" data-decline-job="${escapeHtml(job.id)}" type="button">Decline job and refund buyer</button>
    </section>` : "";
  const productionPanel = job.status === "producing" ? `
    <section class="job-action-panel">
      <h3>Mark as posted</h3>
      <p>Add the tracking number before moving this job to posted. The buyer can then confirm receipt and rate the transaction.</p>
      <div class="job-status-form"><label>Tracking number<input data-job-tracking value="${escapeHtml(job.tracking_reference || "")}" placeholder="e.g. EVRI123456"></label><label>Update note<textarea data-job-status-note rows="2" placeholder="Optional note for the buyer"></textarea></label><button class="button button-primary" data-mark-posted="${escapeHtml(job.id)}" type="button">Mark posted</button></div>
    </section>` : "";
  const postedPanel = job.status === "posted" ? `<section class="job-action-panel"><h3>Awaiting buyer confirmation</h3><p>The buyer must rate the transaction before confirming receipt. If they do not respond, the platform auto-completes the order after the configured confirmation window.</p></section>` : "";
  document.getElementById("jobDialogTitle").textContent = job.design_snapshot?.name || `${job.brand_key} order`;
  document.getElementById("jobDialogContent").innerHTML = `
    <div class="job-detail-hero brand-${escapeHtml(job.brand_key)}"><strong>${escapeHtml(brandLabel(job.brand_key))}</strong><span>${escapeHtml(labelText(job.status))}</span></div>
    <div class="job-detail-grid">
      <div><span>Colour</span><strong>${escapeHtml(job.colour_key)}</strong></div>
      <div><span>Material estimate</span><strong>${jobWeightGrams(job) || "?"} g</strong></div>
      <div><span>Print time</span><strong>${jobPrintHours(job) ? printTimeLabel(jobPrintHours(job)) : "Pending"}</strong></div>
      <div><span>Tracking</span><strong>${escapeHtml(job.tracking_reference || "Not posted")}</strong></div>
    </div>
    <section class="job-breakdown"><h3>Order breakdown</h3>
      <p><span>Material</span><strong>${money(job.material_cost_pence)}</strong></p>
      <p><span>Printer fee</span><strong>${money(job.printer_fee_pence)}</strong></p>
      <p><span>Postage</span><strong>${money(job.postage_pence)}</strong></p>
      <p><span>Your payout</span><strong>${money(job.provider_share_pence)}</strong></p>
      <p><span>Forget About commission (10%)</span><strong>${money(job.commission_pence)}</strong></p>
      <p><span>Platform fee</span><strong>${money(job.platform_fee_pence)}</strong></p>
      <p><span>VAT charged to customer</span><strong>${money(jobVatPence(job))}</strong></p>
      <p><span>Customer total inc VAT</span><strong>${money(jobCustomerTotalPence(job))}</strong></p>
    </section>
    <section class="job-address"><h3>Delivery address</h3><p>${[snapshot?.customer_name, address.line1, address.line2, address.city || address.town, address.county, address.postal_code || address.postcode, address.country].filter(Boolean).map(escapeHtml).join("<br>") || "Address pending payment confirmation."}</p></section>
    <div class="job-downloads"><button class="button button-secondary" data-job-label="${escapeHtml(job.id)}">Open postage label</button><button class="button button-secondary" data-job-stl="${escapeHtml(job.id)}">Download STL</button></div>
    ${escalation ? `<section class="job-escalation-alert"><h3>Buyer escalation</h3><p>${escapeHtml(escalation.note || "The buyer has escalated this delivery.")}</p><small>${new Date(escalation.created_at).toLocaleString()}</small></section>` : ""}
    ${actionPanel}${productionPanel}${postedPanel}
    ${["complete", "refunded", "cancelled"].includes(job.status) ? "" : `<div class="job-note-form"><label>Message buyer<textarea data-job-message rows="3" placeholder="Send a message to the buyer before the order completes"></textarea></label><button class="button button-secondary" data-save-job-note="${escapeHtml(job.id)}">Send message</button></div>`}
    ${renderJobEvents(events)}
  `;
  const dialog = document.getElementById("factoryJobDialog");
  if (!dialog.open) dialog.showModal();
}

function filteredPayoutJobs(jobs) {
  const status = document.getElementById("payoutStatusFilter")?.value || "";
  const brand = document.getElementById("payoutBrandFilter")?.value || "";
  const search = (document.getElementById("payoutSearchFilter")?.value || "").trim().toLowerCase();
  return jobs.filter((job) => {
    const statusMatch = !status || job.payout_status === status || job.status === status;
    const brandMatch = !brand || job.brand_key === brand;
    const haystack = [job.id, job.brand_key, job.status, job.payout_status, jobOrder(job)?.invoice_number, job.design_snapshot?.name].filter(Boolean).join(" ").toLowerCase();
    return statusMatch && brandMatch && (!search || haystack.includes(search));
  });
}

function transferJob(transfer) {
  return factoryDashboardState.jobs.find((job) => job.id === transfer.print_job_id);
}

function filteredTransfers(transfers) {
  const status = document.getElementById("payoutStatusFilter")?.value || "";
  const brand = document.getElementById("payoutBrandFilter")?.value || "";
  const search = (document.getElementById("payoutSearchFilter")?.value || "").trim().toLowerCase();
  return transfers.filter((transfer) => {
    const job = transferJob(transfer);
    const statusMatch = !status || transfer.status === status;
    const brandMatch = !brand || job?.brand_key === brand;
    const haystack = [
      transfer.id,
      transfer.status,
      transfer.currency,
      transfer.created_at,
      transfer.stripe_transfer_id,
      job?.id,
      job?.brand_key,
      job?.status,
      job?.design_snapshot?.name,
      jobOrder(job || {})?.invoice_number
    ].filter(Boolean).join(" ").toLowerCase();
    return statusMatch && brandMatch && (!search || haystack.includes(search));
  });
}

function renderPayouts() {
  const allJobs = factoryDashboardState.jobs;
  const jobs = filteredPayoutJobs(allJobs);
  const transfers = filteredTransfers(factoryDashboardState.transfers);
  const held = allJobs.filter((job) => job.payout_status === "held").reduce((total, job) => total + Number(job.provider_share_pence || 0), 0);
  document.getElementById("heldPayoutTotal").textContent = money(held);
  document.getElementById("connectStatus").textContent = "Manual payout queue";
  document.getElementById("factoryPayouts").innerHTML = transfers.length ? transfers.map((transfer) => `
    <article class="payout-card"><div><strong>${money(transfer.amount_pence, transfer.currency)}</strong><p>${escapeHtml(labelText(transfer.status))} | Created ${new Date(transfer.created_at).toLocaleDateString()}${transferJob(transfer)?.design_snapshot?.name ? ` | ${escapeHtml(transferJob(transfer).design_snapshot.name)}` : ""}</p></div><span class="status-pill">${escapeHtml(labelText(transfer.status))}</span></article>
  `).join("") : '<div class="empty-state">No provider transfers match these filters yet.</div>';
  document.getElementById("factoryPayouts").insertAdjacentHTML("afterbegin", drillableBillingStatusMarkup(jobs));
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
  document.getElementById("capabilityPostage").innerHTML = postageServices.map((service) => `<option value="${service.key}">${service.name} | ${money(service.pricePence)} | ${service.days} day${service.days === 1 ? "" : "s"}</option>`).join("");
  document.getElementById("printerModel").innerHTML = commonPrinters.map((printer) => `<option value="${printer.key}">${printer.name} - ${printer.width} x ${printer.depth} x ${printer.height} mm</option>`).join("");
  document.getElementById("printerModel").value = providerLocalSettings().printerModel || "bambu-a1";
  applyPrinterPreset();
  updateColourSample();
  renderTimeCalculator();
  try {
    const session = await accountService.init();
    await configureProviderButtons();
    setAuthenticated(Boolean(session));
    if (session) {
      if (accountService.authType() === "recovery") {
        const password = window.prompt("Enter your new password");
        if (password) {
          await accountService.updatePassword(password);
          toast("Password updated");
        }
      }
      await loadDashboard();
    } else {
      document.getElementById("factoryLoginMessage").textContent = accountService.authError();
    }
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

function applyPrinterPreset() {
  const printer = commonPrinters.find((candidate) => candidate.key === document.getElementById("printerModel").value) || commonPrinters[1];
  saveProviderLocalSettings({ printerModel: printer.key });
  if (printer.key !== "custom") {
    document.getElementById("capabilityMaxWidth").value = printer.width;
    document.getElementById("capabilityMaxDepth").value = printer.depth;
    document.getElementById("capabilityMaxHeight").value = printer.height;
    document.getElementById("capabilityGramsPerHour").value = printer.gramsPerHour;
    document.getElementById("factoryCalcRate").value = printer.gramsPerHour;
    renderTimeCalculator();
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
  const message = document.getElementById("factoryLoginMessage");
  accountAuthFlow.openCreateAccount({
    email: document.getElementById("factoryEmail").value,
    password: document.getElementById("factoryPassword").value,
    surfaceLabel: "the Print Factory",
    notify: (text) => { message.textContent = text; },
    onSuccess: async (result) => {
      if (!result.access_token) {
        message.textContent = "Printer account created. Check your email to confirm it, then sign in.";
        return;
      }
      message.textContent = "Printer account created.";
      setAuthenticated(true);
      await loadDashboard();
      setTab("profile");
    }
  });
});

document.getElementById("forgotFactoryPassword").addEventListener("click", async () => {
  const message = document.getElementById("factoryLoginMessage");
  accountAuthFlow.openPasswordReset({
    email: document.getElementById("factoryEmail").value,
    surfaceLabel: "the Print Factory",
    notify: (text) => { message.textContent = text; }
  });
});

document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      document.getElementById("factoryLoginMessage").textContent = `Opening ${button.textContent.trim()} sign in...`;
      await accountService.signInWithProvider(button.dataset.oauthProvider);
    } catch (error) {
      document.getElementById("factoryLoginMessage").textContent = error.message;
    }
  });
});

document.getElementById("factoryLogout").addEventListener("click", async () => { await accountService.signOut(); setAuthenticated(false); });
document.getElementById("factoryRefresh").addEventListener("click", async () => { await loadDashboard(); toast("Factory data refreshed"); });
document.getElementById("startConnectOnboarding").addEventListener("click", async (event) => {
  try {
    if (event.currentTarget.disabled) return;
    const result = await factoryFetch("/api/factory/connect/start", { method: "POST", body: "{}" });
    window.location.assign(result.url);
  } catch (error) {
    toast(error.message);
  }
});
document.getElementById("refreshConnectStatus").addEventListener("click", async (event) => {
  try {
    if (event.currentTarget.disabled) return;
    const result = await factoryFetch("/api/factory/connect/status", { method: "POST", body: "{}" });
    await loadDashboard();
    toast(result.paymentAccount?.onboarding_complete ? "Payment account is ready" : "Payment account still needs setup");
  } catch (error) {
    toast(error.message);
  }
});
document.querySelectorAll("[data-factory-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.factoryTab)));

document.getElementById("factoryProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    saveProviderLocalSettings({ printerModel: document.getElementById("printerModel").value });
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
document.getElementById("printerModel").addEventListener("change", applyPrinterPreset);

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
  const drill = event.target.closest("[data-status-drill]");
  if (drill) {
    document.getElementById("jobStatusFilter").value = drill.dataset.statusDrill;
    renderJobs();
    return;
  }
  const button = event.target.closest("[data-open-job]");
  if (button) showJobDetail(button.dataset.openJob);
});
["jobStatusFilter", "jobBrandFilter", "jobPayoutFilter", "jobSearchFilter"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderJobs);
  document.getElementById(id).addEventListener("change", renderJobs);
});
["payoutStatusFilter", "payoutBrandFilter", "payoutSearchFilter"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderPayouts);
  document.getElementById(id).addEventListener("change", renderPayouts);
});
document.getElementById("factoryPayouts").addEventListener("click", (event) => {
  const drill = event.target.closest("[data-status-drill]");
  if (!drill) return;
  document.getElementById("payoutStatusFilter").value = drill.dataset.statusDrill;
  renderPayouts();
});
["factoryCalcWeight", "factoryCalcRate", "factoryCalcSetup"].forEach((id) => document.getElementById(id).addEventListener("input", renderTimeCalculator));
document.getElementById("closeJobDialog").addEventListener("click", () => document.getElementById("factoryJobDialog").close());
document.getElementById("jobDialogContent").addEventListener("click", async (event) => {
  try {
    const startButton = event.target.closest("[data-start-job]");
    const postedButton = event.target.closest("[data-mark-posted]");
    const declineButton = event.target.closest("[data-decline-job]");
    const noteButton = event.target.closest("[data-save-job-note]");
    const stlButton = event.target.closest("[data-job-stl]");
    const labelButton = event.target.closest("[data-job-label]");
    if (stlButton) return factoryDownload(`/api/factory/jobs/${encodeURIComponent(stlButton.dataset.jobStl)}/stl`, `print-job-${stlButton.dataset.jobStl}.stl`);
    if (labelButton) return factoryDownload(`/api/factory/jobs/${encodeURIComponent(labelButton.dataset.jobLabel)}/label`, "", true);
    if (startButton) {
      await factoryFetch(`/api/factory/jobs/${encodeURIComponent(startButton.dataset.startJob)}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "producing", note: "Provider accepted the job and started production." })
      });
    }
    if (postedButton) {
      const panel = postedButton.closest(".job-action-panel");
      await factoryFetch(`/api/factory/jobs/${encodeURIComponent(postedButton.dataset.markPosted)}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "posted", trackingReference: panel.querySelector("[data-job-tracking]").value, note: panel.querySelector("[data-job-status-note]").value })
      });
    }
    if (declineButton) {
      const reason = declineButton.closest(".job-action-panel").querySelector("[data-decline-reason]").value;
      if (!window.confirm("Decline this job and refund the buyer? This cannot be undone.")) return;
      await factoryFetch(`/api/factory/jobs/${encodeURIComponent(declineButton.dataset.declineJob)}/decline`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
    }
    if (noteButton) {
      await factoryFetch(`/api/factory/jobs/${encodeURIComponent(noteButton.dataset.saveJobNote)}/note`, {
        method: "POST",
        body: JSON.stringify({ note: noteButton.closest(".job-note-form").querySelector("[data-job-message]").value })
      });
    }
    if (startButton || postedButton || declineButton || noteButton) {
      await loadDashboard();
      showJobDetail(startButton?.dataset.startJob || postedButton?.dataset.markPosted || declineButton?.dataset.declineJob || noteButton.dataset.saveJobNote);
      toast(declineButton ? "Job declined and buyer refund started" : noteButton ? "Message sent" : "Job status updated");
    }
  } catch (error) {
    toast(error.message);
  }
});

initializeFactory();
