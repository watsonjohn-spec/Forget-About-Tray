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
})();
