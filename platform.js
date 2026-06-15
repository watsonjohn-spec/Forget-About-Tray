(() => {
  const config = window.FORGET_ABOUT_PLATFORM_CONFIG || { brands: [], generators: [], marketplace: {} };
  const pathSegments = window.location.pathname.toLowerCase().split("/").filter(Boolean);
  const matchedBrand = config.brands.find((brand) => pathSegments.includes(brand.path));
  const activeBrand = matchedBrand || config.brands.find((brand) => brand.key === "tray") || config.brands[0];
  const activeGenerator = config.generators.find((generator) => generator.type === activeBrand?.defaultGeneratorType) || null;

  if (activeBrand) sessionStorage.setItem("forget-about-active-brand", activeBrand.key);

  function applyBrand() {
    if (!activeBrand) return;
    document.body.dataset.brand = activeBrand.key;
    document.body.dataset.generatorType = activeGenerator?.type || "";
    document.title = activeBrand.studioName;
    const theme = activeBrand.theme || {};
    const variables = {
      "--ink": theme.ink,
      "--muted": theme.muted,
      "--line": theme.line,
      "--paper": theme.paper,
      "--panel": theme.panel,
      "--white": theme.white,
      "--green": theme.accent,
      "--forest": theme.accentDark,
      "--brand-highlight": theme.highlight,
      "--brand-theme": theme.themeColor
    };
    Object.entries(variables).forEach(([name, value]) => {
      if (value) document.documentElement.style.setProperty(name, value);
    });
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta && theme.themeColor) themeMeta.content = theme.themeColor;
    document.querySelectorAll("[data-brand-name]").forEach((element) => { element.textContent = activeBrand.name; });
    document.querySelectorAll("[data-studio-name]").forEach((element) => { element.textContent = activeBrand.studioName; });
    const home = document.getElementById("brandHome");
    if (home) {
      home.href = window.location.pathname;
      home.setAttribute("aria-label", `${activeBrand.name} home`);
    }
  }

  function requestHeaders() {
    return {
      "X-Forget-About-Brand": activeBrand?.key || "tray",
      "X-Forget-About-Generator": activeGenerator?.type || "",
      "X-Forget-About-Path": window.location.pathname
    };
  }

  window.platformService = {
    config,
    activeBrand: () => activeBrand,
    activeGenerator: () => activeGenerator,
    brandKey: () => activeBrand?.key || "tray",
    generatorType: () => activeGenerator?.type || "movement_tray",
    requestHeaders,
    storageKey: (name) => `forget-about:${activeBrand?.key || "tray"}:${activeGenerator?.type || "platform"}:${name}`
  };

  applyBrand();
})();
