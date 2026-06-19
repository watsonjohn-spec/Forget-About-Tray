(() => {
  const defaults = {
    prefix: "account",
    buttonId: "changePasswordButton",
    buttonClass: "button button-primary",
    buttonText: "Update password",
    intro: "Enter your current password, then choose a new password with at least eight characters."
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  }

  function fieldIds(prefix) {
    return {
      current: `${prefix}CurrentPassword`,
      next: `${prefix}NewPassword`,
      confirm: `${prefix}ConfirmPassword`
    };
  }

  function passwordFieldsHtml(options = {}) {
    const config = { ...defaults, ...options };
    const ids = fieldIds(config.prefix);
    return `
      <p>${escapeHtml(config.intro)}</p>
      <label>Current password<input id="${ids.current}" type="password" autocomplete="current-password"></label>
      <label>New password<input id="${ids.next}" type="password" minlength="8" autocomplete="new-password"></label>
      <label>Confirm password<input id="${ids.confirm}" type="password" minlength="8" autocomplete="new-password"></label>
      <button class="${escapeHtml(config.buttonClass)}" id="${escapeHtml(config.buttonId)}" type="button">${escapeHtml(config.buttonText)}</button>
    `;
  }

  function optionsFromContainer(container, options = {}) {
    return {
      ...defaults,
      prefix: container?.dataset.accountPasswordPrefix || defaults.prefix,
      buttonId: container?.dataset.accountPasswordButtonId || defaults.buttonId,
      buttonClass: container?.dataset.accountPasswordButtonClass || defaults.buttonClass,
      buttonText: container?.dataset.accountPasswordButtonText || defaults.buttonText,
      intro: container?.dataset.accountPasswordIntro || defaults.intro,
      ...options
    };
  }

  function notify(options, message) {
    if (typeof options.notify === "function") options.notify(message);
  }

  async function submit(options = {}) {
    const config = { ...defaults, ...options };
    const ids = fieldIds(config.prefix);
    const currentInput = document.getElementById(ids.current);
    const nextInput = document.getElementById(ids.next);
    const confirmInput = document.getElementById(ids.confirm);
    const button = document.getElementById(config.buttonId);
    const currentPassword = currentInput?.value || "";
    const newPassword = nextInput?.value || "";
    const confirmation = confirmInput?.value || "";

    if (!currentPassword) return notify(config, "Enter your current password.");
    if (newPassword.length < 8) return notify(config, "Use a password with at least 8 characters.");
    if (newPassword !== confirmation) return notify(config, "The new passwords do not match.");

    try {
      if (button) button.disabled = true;
      await accountService.updatePassword(currentPassword, newPassword);
      currentInput.value = "";
      nextInput.value = "";
      confirmInput.value = "";
      notify(config, "Password updated.");
    } catch (error) {
      notify(config, error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function mount(options = {}) {
    const config = { ...defaults, ...options };
    const button = document.getElementById(config.buttonId);
    if (!button || button.dataset.accountPasswordMounted === "true") return;
    button.dataset.accountPasswordMounted = "true";
    button.addEventListener("click", () => submit(config));
  }

  function hydrate(container, options = {}) {
    if (!container) return;
    const config = optionsFromContainer(container, options);
    container.innerHTML = passwordFieldsHtml(config);
    mount(config);
  }

  window.accountPasswordFlow = {
    fieldIds,
    passwordFieldsHtml,
    hydrate,
    mount,
    submit
  };
})();
