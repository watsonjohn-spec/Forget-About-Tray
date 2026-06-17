(() => {
  if (document.querySelector(".site-footer")) return;

  const brandName = document.querySelector("[data-brand-name]")?.textContent?.trim()
    || document.querySelector(".brand strong")?.textContent?.trim()
    || document.title
    || "Forget About";
  const year = new Date().getFullYear();
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="site-footer-top">
      <div class="site-footer-brand">
        <strong>${brandName}</strong>
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
        <p>Draft terms: designs are provided for personal use unless a commercial licence is agreed. Generated STL files and print orders should be checked before use. We may refuse unsafe, unlawful, infringing, or technically unsuitable print requests.</p>
      </details>
      <details>
        <summary>Privacy</summary>
        <p>Draft privacy notice: account, order, address, payment status, and support information is used to operate the service, fulfil orders, prevent abuse, and meet legal duties. Payment details are handled by Stripe.</p>
      </details>
      <details>
        <summary>Refunds</summary>
        <p>Draft refunds policy: marketplace print orders are refundable until a provider starts production. Once production begins, refunds depend on print failure, non-delivery, or a provider/platform decision. Digital STL access is generally non-refundable once delivered.</p>
      </details>
      <details>
        <summary>Modern slavery statement</summary>
        <p>Draft statement: Forget About expects suppliers and print providers to avoid forced labour, child labour, human trafficking, and exploitative practices. As the operation grows, provider checks and supplier review records should be formalised.</p>
      </details>
    </section>
    <div class="site-footer-bottom">
      <span>Copyright ${year} Forget About. Draft legal copy for review before launch.</span>
      <span>Support: <a href="mailto:help@forget.im">help@forget.im</a></span>
    </div>
  `;
  document.body.append(footer);
})();
