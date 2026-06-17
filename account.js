(() => {
  const legacySessionKey = "movement-tray-supabase-session";
  const sessionKey = "forget-about-supabase-session";
  const activeSessionKey = "forget-about-active-session";
  const pendingAuthReturnKey = "forget-about-pending-auth-return";
  const enabledOauthProviders = new Set(["google"]);
  let config = null;
  let session = null;
  let user = null;
  let authType = "";
  let authError = "";
  let deviceHashPromise = null;

  function apiBase() {
    return document.querySelector('meta[name="checkout-api-url"]').content.trim().replace(/\/$/, "");
  }

  function appUrl() {
    const url = new URL(window.location.pathname, window.location.origin);
    const path = url.pathname.toLowerCase();
    if (brandKey() === "makeup" || path === "/makeup" || path === "/makeup/index.html") {
      url.pathname = url.pathname.replace(/\/index\.html$/i, "/");
      if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    }
    if (path === "/factory" || path === "/factory/index.html") {
      url.pathname = "/factory/";
    }
    return url.toString();
  }

  function brandKey() {
    return window.platformService?.brandKey() || "tray";
  }

  function generatorType() {
    return window.platformService?.generatorType() || "movement_tray";
  }

  function appPath() {
    const url = new URL(appUrl());
    return `${url.pathname}${url.search}`;
  }

  function pendingAuthReturnPath() {
    const path = sessionStorage.getItem(pendingAuthReturnKey) || "";
    if (!path.startsWith("/") || path.startsWith("//")) return "";
    return path;
  }

  function reroutePendingAuthCallback(hash) {
    const pendingPath = pendingAuthReturnPath();
    if (!pendingPath || pendingPath === `${window.location.pathname}${window.location.search}`) return false;
    if (!hash.get("access_token") && !hash.get("error") && !hash.get("error_description")) return false;
    sessionStorage.removeItem(pendingAuthReturnKey);
    window.location.replace(`${window.location.origin}${pendingPath}${window.location.hash}`);
    return true;
  }

  async function deviceHash() {
    if (deviceHashPromise) return deviceHashPromise;
    deviceHashPromise = (async () => {
      const key = "forget-about-device-id";
      const deviceId = localStorage.getItem(key) || crypto.randomUUID();
      localStorage.setItem(key, deviceId);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(deviceId));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    })();
    return deviceHashPromise;
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
        google: enabledOauthProviders.has("google") && Boolean(settings.external?.google),
        apple: enabledOauthProviders.has("apple") && Boolean(settings.external?.apple)
      };
    } catch {
      return { google: null, apple: false };
    }
  }

  function storeSession(nextSession) {
    session = nextSession || null;
    user = session?.user || null;
    if (session) {
      localStorage.setItem(sessionKey, JSON.stringify(session));
      sessionStorage.setItem(activeSessionKey, "true");
    }
    else {
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(legacySessionKey);
      sessionStorage.removeItem(activeSessionKey);
    }
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
      if (reroutePendingAuthCallback(hash)) return null;
      authType = hash.get("type") || "";
      authError = hash.get("error_description") || "";
      if (hash.get("access_token") || hash.get("error") || authError) sessionStorage.removeItem(pendingAuthReturnKey);
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
      } else if (sessionStorage.getItem(activeSessionKey) === "true") {
        storeSession(JSON.parse(localStorage.getItem(sessionKey) || localStorage.getItem(legacySessionKey) || "null"));
      } else {
        storeSession(null);
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
      body: JSON.stringify({
        email,
        password,
        data: {
          signup_brand_key: brandKey(),
          signup_surface: window.location.pathname.toLowerCase().includes("/factory") ? "factory" : "customer"
        }
      })
    });
    if (result.access_token) storeSession(result);
    return result;
  }

  async function signInWithProvider(provider) {
    if (!enabledOauthProviders.has(provider)) throw new Error(`${provider[0].toUpperCase() + provider.slice(1)} sign-in is not available yet.`);
    await loadConfig();
    const url = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
    const returnUrl = appUrl();
    sessionStorage.setItem(pendingAuthReturnKey, appPath());
    url.searchParams.set("provider", provider);
    url.searchParams.set("redirect_to", returnUrl);
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

  async function loadDesigns() {
    try {
      return await restRequest(`designs?select=*&brand_key=eq.${encodeURIComponent(brandKey())}&generator_type=eq.${encodeURIComponent(generatorType())}&order=updated_at.desc`);
    } catch (error) {
      if (brandKey() !== "tray" || generatorType() !== "movement_tray") throw error;
      return (await loadTrayDesigns()).map((design) => ({ ...design, parameters: design.configuration }));
    }
  }

  async function upsertDesign(design) {
    try {
      return await restRequest("designs?on_conflict=user_id,brand_key,generator_type,client_ref", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          ...design,
          user_id: user.id,
          brand_key: design.brand_key || brandKey(),
          generator_type: design.generator_type || generatorType(),
          updated_at: new Date().toISOString()
        })
      });
    } catch (error) {
      if (brandKey() !== "tray" || generatorType() !== "movement_tray") throw error;
      return upsertTrayDesign({ client_ref: design.client_ref, name: design.name, configuration: design.parameters });
    }
  }

  async function deleteDesign(id) {
    try {
      return await restRequest(`designs?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    } catch (error) {
      if (brandKey() !== "tray" || generatorType() !== "movement_tray") throw error;
      return deleteTrayDesign(id);
    }
  }

  async function loadProjects() {
    try {
      return await restRequest(`projects?select=*&brand_key=eq.${encodeURIComponent(brandKey())}&generator_type=eq.${encodeURIComponent(generatorType())}&order=updated_at.desc`);
    } catch (error) {
      if (brandKey() !== "tray" || generatorType() !== "movement_tray") throw error;
      return (await loadArmyLists()).map((project) => ({ ...project, source_text: project.original_list_text, items: project.parsed_units }));
    }
  }

  async function upsertProject(project) {
    try {
      return await restRequest("projects?on_conflict=user_id,brand_key,generator_type,client_ref", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          ...project,
          user_id: user.id,
          brand_key: project.brand_key || brandKey(),
          generator_type: project.generator_type || generatorType(),
          updated_at: new Date().toISOString()
        })
      });
    } catch (error) {
      if (brandKey() !== "tray" || generatorType() !== "movement_tray") throw error;
      return upsertArmyList({
        client_ref: project.client_ref,
        name: project.name,
        original_list_text: project.source_text || "",
        parsed_units: project.items || []
      });
    }
  }

  async function deleteProject(id) {
    try {
      return await restRequest(`projects?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    } catch (error) {
      if (brandKey() !== "tray" || generatorType() !== "movement_tray") throw error;
      return deleteArmyList(id);
    }
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
    try {
      const response = await fetch(`${apiBase()}/api/account/orders`, { headers: await authHeaders() });
      return responseJson(response);
    } catch {
      try {
        return await restRequest(`orders?select=id,invoice_number,order_type,status,currency,total_inc_vat,paid_at,created_at,brand_key,generator_type,order_items(*),order_customer_snapshots(*),print_jobs(*,print_job_events(*))&brand_key=eq.${encodeURIComponent(brandKey())}&order=created_at.desc`);
      } catch {
        return restRequest("orders?select=id,invoice_number,order_type,status,currency,total_inc_vat,paid_at,created_at&order=created_at.desc");
      }
    }
  }

  async function importLocalData(trays, armies) {
    const marker = `forget-about-cloud-imported-${brandKey()}-${generatorType()}-${user.id}`;
    if (localStorage.getItem(marker) === "true") return;
    for (const tray of trays) {
      await upsertDesign({
        client_ref: tray.id,
        name: tray.name,
        generator_version: 1,
        parameters: tray.state,
        metadata: { imported_from: "movement-tray-presets" }
      });
    }
    for (const army of armies) {
      await upsertProject({
        client_ref: army.id,
        name: army.name,
        project_type: "army_list",
        source_text: army.listText || "",
        items: army.recommendations || [],
        metadata: { imported_from: "movement-tray-army-projects" }
      });
    }
    localStorage.setItem(marker, "true");
  }

  async function authHeaders() {
    await ensureSession();
    return {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(window.platformService?.requestHeaders() || {}),
      "X-Forget-About-Device": await deviceHash()
    };
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
    loadDesigns,
    upsertDesign,
    deleteDesign,
    loadProjects,
    upsertProject,
    deleteProject,
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
