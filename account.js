(() => {
  const sessionKey = "movement-tray-supabase-session";
  let config = null;
  let session = null;
  let user = null;
  let authType = "";
  let authError = "";

  function apiBase() {
    return document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "");
  }

  function appUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  async function responseJson(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.msg || body.message || body.error_description || body.error || "Account request failed.");
    return body;
  }

  async function loadConfig() {
    if (config) return config;
    const publicConfig = window.MOVEMENT_TRAY_PUBLIC_CONFIG || {};
    if (publicConfig.supabaseUrl && publicConfig.supabasePublishableKey) {
      config = publicConfig;
    } else {
      const response = await fetch(`${apiBase()}/api/app-config`);
      config = await responseJson(response);
    }
    if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error("Supabase is not configured on this server.");
    return config;
  }

  async function providerAvailability() {
    await loadConfig();
    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: config.supabasePublishableKey }
      });
      const settings = await responseJson(response);
      return {
        google: Boolean(settings.external?.google),
        apple: Boolean(settings.external?.apple)
      };
    } catch {
      return { google: null, apple: null };
    }
  }

  function storeSession(nextSession) {
    session = nextSession || null;
    user = session?.user || null;
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
  }

  async function authRequest(path, options = {}) {
    await loadConfig();
    const response = await fetch(`${config.supabaseUrl}/auth/v1${path}`, {
      ...options,
      headers: {
        apikey: config.supabasePublishableKey,
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(options.headers || {})
      }
    });
    return responseJson(response);
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    const refreshed = await authRequest("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    storeSession(refreshed);
    return refreshed;
  }

  async function ensureSession() {
    if (!session) return null;
    if (Number(session.expires_at || 0) * 1000 < Date.now() + 60_000) await refreshSession();
    return session;
  }

  async function init() {
    await loadConfig();
    try {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      authType = hash.get("type") || "";
      authError = hash.get("error_description") || "";
      if (authError) {
        history.replaceState({}, "", window.location.pathname + window.location.search);
        return null;
      }
      if (hash.get("access_token")) {
        storeSession({
          access_token: hash.get("access_token"),
          refresh_token: hash.get("refresh_token"),
          expires_at: Math.floor(Date.now() / 1000) + Number(hash.get("expires_in") || 3600)
        });
        history.replaceState({}, "", window.location.pathname + window.location.search);
      } else {
        storeSession(JSON.parse(localStorage.getItem(sessionKey) || "null"));
      }
      if (!session) return null;
      await ensureSession();
      user = await authRequest("/user");
      session.user = user;
      storeSession(session);
      return session;
    } catch {
      storeSession(null);
      return null;
    }
  }

  async function signIn(email, password) {
    const nextSession = await authRequest("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    storeSession(nextSession);
    return nextSession;
  }

  async function signUp(email, password) {
    const result = await authRequest("/signup", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    if (result.access_token) storeSession(result);
    return result;
  }

  async function signInWithProvider(provider) {
    await loadConfig();
    const url = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
    url.searchParams.set("provider", provider);
    url.searchParams.set("redirect_to", appUrl());
    window.location.assign(url.toString());
  }

  async function resetPassword(email) {
    return authRequest("/recover", {
      method: "POST",
      body: JSON.stringify({ email, redirect_to: appUrl() })
    });
  }

  async function updatePassword(password) {
    return authRequest("/user", { method: "PUT", body: JSON.stringify({ password }) });
  }

  async function signOut() {
    try {
      if (session) await authRequest("/logout", { method: "POST", body: "{}" });
    } catch {
      // Local sign-out must still complete if Supabase is temporarily unavailable.
    } finally {
      storeSession(null);
    }
  }

  async function restRequest(path, options = {}) {
    await ensureSession();
    if (!session?.access_token) throw new Error("Sign in to continue.");
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (response.status === 204) return null;
    return responseJson(response);
  }

  async function loadProfile() {
    const rows = await restRequest(`profiles?select=*&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    return rows[0] || null;
  }

  async function saveProfile(profile) {
    return restRequest(`profiles?user_id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...profile, updated_at: new Date().toISOString() })
    });
  }

  async function loadTrayDesigns() {
    return restRequest("tray_designs?select=*&order=updated_at.desc");
  }

  async function upsertTrayDesign(design) {
    return restRequest("tray_designs?on_conflict=user_id,client_ref", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ ...design, user_id: user.id, updated_at: new Date().toISOString() })
    });
  }

  async function deleteTrayDesign(id) {
    return restRequest(`tray_designs?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }

  async function loadArmyLists() {
    return restRequest("army_lists?select=*&order=updated_at.desc");
  }

  async function upsertArmyList(army) {
    return restRequest("army_lists?on_conflict=user_id,client_ref", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ ...army, user_id: user.id, updated_at: new Date().toISOString() })
    });
  }

  async function deleteArmyList(id) {
    return restRequest(`army_lists?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }

  async function loadOrders() {
    return restRequest("orders?select=id,invoice_number,order_type,status,currency,total_inc_vat,paid_at,created_at&order=created_at.desc");
  }

  async function importLocalData(trays, armies) {
    const marker = `movement-tray-cloud-imported-${user.id}`;
    if (localStorage.getItem(marker) === "true") return;
    for (const tray of trays) {
      await upsertTrayDesign({ client_ref: tray.id, name: tray.name, configuration: tray.state });
    }
    for (const army of armies) {
      await upsertArmyList({
        client_ref: army.id,
        name: army.name,
        original_list_text: army.listText || "",
        parsed_units: army.recommendations || []
      });
    }
    localStorage.setItem(marker, "true");
  }

  async function authHeaders() {
    await ensureSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  window.accountService = {
    init,
    signIn,
    signInWithProvider,
    providerAvailability,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    loadProfile,
    saveProfile,
    loadTrayDesigns,
    upsertTrayDesign,
    deleteTrayDesign,
    loadArmyLists,
    upsertArmyList,
    deleteArmyList,
    loadOrders,
    importLocalData,
    authHeaders,
    authType: () => authType,
    authError: () => authError,
    isSignedIn: () => Boolean(session?.access_token),
    currentUser: () => user
  };
})();
