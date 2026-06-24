(() => {
  let toastTimer;

  function toast(message) {
    const element = document.getElementById("toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("visible"), 2600);
  }

  function setAuthenticated(authenticated) {
    document.body.classList.toggle("authenticated", authenticated);
    document.getElementById("authGate")?.classList.toggle("hidden", authenticated);
    const email = document.getElementById("accountEmail");
    if (email) email.textContent = accountService.currentUser()?.email || "";
  }

  async function configureProviderButtons() {
    const providers = await accountService.providerAvailability();
    document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
      const configured = providers[button.dataset.oauthProvider];
      button.hidden = configured === false;
      button.disabled = configured === false;
      button.title = configured === false ? `${button.textContent.trim()} sign-in is not configured in Supabase yet.` : "";
    });
    const status = document.getElementById("oauthStatus");
    if (status) {
      const configured = Object.entries(providers).filter(([, enabled]) => enabled === true).map(([provider]) => provider);
      status.textContent = configured.length ? `${configured.map((provider) => provider[0].toUpperCase() + provider.slice(1)).join(" and ")} sign-in ready.` : "Email sign-in remains available.";
    }
  }

  async function initAuth() {
    const session = await accountService.init();
    await configureProviderButtons();
    setAuthenticated(Boolean(session));
    if (!session) document.getElementById("loginError").textContent = accountService.authError();
    return session;
  }

  window.generatorAuth = { initAuth, setAuthenticated, toast };

  document.getElementById("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await accountService.signIn(document.getElementById("loginEmail").value, document.getElementById("loginPassword").value);
      setAuthenticated(true);
    } catch (error) {
      document.getElementById("loginError").textContent = error.message;
    }
  });

  document.getElementById("createAccount")?.addEventListener("click", async () => {
    accountAuthFlow.openCreateAccount({
      email: document.getElementById("loginEmail").value,
      password: document.getElementById("loginPassword").value,
      surfaceLabel: document.querySelector("[data-brand-name]")?.textContent?.trim() || "Forget About",
      notify: (message) => { document.getElementById("loginError").textContent = message; },
      onSuccess: async (result) => {
        if (result.access_token) setAuthenticated(true);
      }
    });
  });

  document.getElementById("forgotPassword")?.addEventListener("click", async () => {
    accountAuthFlow.openPasswordReset({
      email: document.getElementById("loginEmail").value,
      surfaceLabel: document.querySelector("[data-brand-name]")?.textContent?.trim() || "Forget About",
      notify: (message) => { document.getElementById("loginError").textContent = message; }
    });
  });

  document.querySelectorAll("[data-oauth-provider]").forEach((button) => button.addEventListener("click", async () => {
    try {
      document.getElementById("loginError").textContent = `Opening ${button.textContent.trim()} sign in...`;
      await accountService.signInWithProvider(button.dataset.oauthProvider);
    } catch (error) {
      document.getElementById("loginError").textContent = error.message;
    }
  }));

  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    await accountService.signOut();
    setAuthenticated(false);
    toast("Signed out");
  });
})();
