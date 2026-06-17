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
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    if (!email || !password) return document.getElementById("loginError").textContent = "Enter an email and password first.";
    try {
      const result = await accountService.signUp(email, password);
      document.getElementById("loginError").textContent = result.access_token ? "Account created." : "Check your email to confirm your account.";
      if (result.access_token) setAuthenticated(true);
    } catch (error) {
      document.getElementById("loginError").textContent = error.message;
    }
  });

  document.getElementById("forgotPassword")?.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value;
    if (!email) return document.getElementById("loginError").textContent = "Enter your email first.";
    try {
      await accountService.resetPassword(email);
      document.getElementById("loginError").textContent = "Password reset email sent.";
    } catch (error) {
      document.getElementById("loginError").textContent = error.message;
    }
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
