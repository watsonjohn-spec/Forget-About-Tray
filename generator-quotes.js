(() => {
  let selectedQuoteId = "";
  let quotes = [];
  let printerFilterId = "";

  function apiBase() {
    return document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "");
  }

  function money(pence, currency = "gbp") {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: String(currency || "gbp").toUpperCase() }).format(Number(pence || 0) / 100);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  }

  function visibleQuotes() {
    return printerFilterId ? quotes.filter((quote) => quote.printerProfileId === printerFilterId) : quotes;
  }

  function render() {
    const container = document.getElementById("quotes");
    const checkout = document.getElementById("checkoutButton");
    if (!container) return;
    const shownQuotes = visibleQuotes();
    if (selectedQuoteId && !shownQuotes.some((quote) => quote.id === selectedQuoteId)) selectedQuoteId = "";
    container.innerHTML = shownQuotes.length ? shownQuotes.map((quote) => `
      <article class="${quote.id === selectedQuoteId ? "selected" : ""}">
        <div><strong>${escapeHtml(quote.providerName)}</strong><br><small>${escapeHtml(quote.basedIn)} | ${quote.leadTimeDays} day lead | ${escapeHtml(quote.colourName || quote.colourKey)} | ${quote.estimatedWeightGrams}g</small>
        <details><summary>Breakdown</summary><small>Material ${money(quote.materialCostPence, quote.currency)} | Printer fee ${money(quote.printerFeePence, quote.currency)} | Postage ${money(quote.postagePence, quote.currency)} | Commission ${money(quote.commissionPence, quote.currency)} | Platform ${money(quote.platformFeePence, quote.currency)} | VAT ${money(quote.vatAmountPence, quote.currency)}</small></details></div>
        <strong>${money(quote.totalIncVatPence, quote.currency)}</strong>
        <button class="button button-secondary" data-quote="${escapeHtml(quote.id)}" type="button">${quote.id === selectedQuoteId ? "Selected" : "Select"}</button>
      </article>
    `).join("") : `<p>${printerFilterId ? "That printer has no matching quotes for this design yet." : "No providers match this design yet."}</p>`;
    if (checkout) checkout.disabled = !selectedQuoteId;
  }

  async function request(config, name) {
    selectedQuoteId = "";
    quotes = [];
    render();
    const response = await fetch(`${apiBase()}/api/marketplace/quotes`, {
      method: "POST",
      headers: { ...(await accountService.authHeaders()), "Content-Type": "application/json", ...(window.platformService?.requestHeaders() || {}) },
      body: JSON.stringify({ config, name })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Quotes could not be loaded.");
    quotes = result.quotes || [];
    if (Object.prototype.hasOwnProperty.call(config, "preferredPrinterProfileId")) {
      printerFilterId = config.preferredPrinterProfileId || "";
    }
    render();
    return quotes;
  }

  function setPrinterFilter(profileId = "") {
    printerFilterId = profileId;
    render();
  }

  async function checkout() {
    if (!selectedQuoteId) throw new Error("Select a printer first.");
    const response = await fetch(`${apiBase()}/api/marketplace/checkout/session`, {
      method: "POST",
      headers: { ...(await accountService.authHeaders()), "Content-Type": "application/json", ...(window.platformService?.requestHeaders() || {}) },
      body: JSON.stringify({ quoteId: selectedQuoteId })
    });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || "Checkout could not be opened.");
    window.location.assign(result.url);
  }

  document.getElementById("quotes")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quote]");
    if (!button) return;
    selectedQuoteId = button.dataset.quote;
    render();
  });

  document.getElementById("checkoutButton")?.addEventListener("click", () => checkout().catch((error) => window.generatorAuth?.toast(error.message)));

  window.generatorQuotes = { request, render, setPrinterFilter, quotes: () => quotes.slice() };
})();
