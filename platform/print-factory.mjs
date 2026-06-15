export const printJobTransitions = {
  pending_payment: ["order_made", "cancelled"],
  order_made: ["producing", "cancelled", "refunded"],
  producing: ["posted"],
  posted: ["complete"],
  complete: [],
  cancelled: [],
  refunded: []
};

export function assertPrintJobTransition(fromStatus, toStatus) {
  if (!printJobTransitions[fromStatus]?.includes(toStatus)) {
    throw new Error(`Print job cannot move from ${fromStatus} to ${toStatus}.`);
  }
  return true;
}

export function customerCanCancel(status) {
  return status === "pending_payment" || status === "order_made";
}

export function providerTransferEligible(job) {
  return job.status === "complete" && job.payoutStatus === "held";
}

export function filterPrinterQuotes(quotes, filters = {}) {
  return quotes.filter((quote) => (
    (!filters.colourKey || quote.colourKey === filters.colourKey)
    && (!filters.material || quote.material === filters.material)
    && (!filters.maximumTotalPence || quote.totalIncVatPence <= filters.maximumTotalPence)
    && (!filters.maximumLeadTimeDays || quote.leadTimeDays <= filters.maximumLeadTimeDays)
    && (!filters.minimumRating || quote.ratingAverage >= filters.minimumRating)
    && (!filters.location || quote.basedIn.toLowerCase().includes(filters.location.toLowerCase()))
  ));
}
