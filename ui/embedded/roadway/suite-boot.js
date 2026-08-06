/**
 * Suite boot: language + i18n. Theme tokens come from PC Command kit
 * (settings-panel.js / atelier-theme.json via api.get_theme).
 */
(function (global) {
  const PRIVACY = {
    fr: "Aucune collecte de données par Mr-Aurevo-X. Tout reste sur cet ordinateur.",
    en: "Mr-Aurevo-X does not collect your data. Everything stays on this PC.",
  };

  function applyI18n(lang, dict) {
    const pack = (dict && dict[lang]) || (dict && dict.fr) || {};
    document.documentElement.lang = lang === "en" ? "en" : "fr";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (key && pack[key] != null) node.textContent = pack[key];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const key = node.getAttribute("data-i18n-placeholder");
      if (key && pack[key] != null) node.setAttribute("placeholder", pack[key]);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((node) => {
      const key = node.getAttribute("data-i18n-title");
      if (key && pack[key] != null) node.setAttribute("title", pack[key]);
    });
    const privacy = document.getElementById("privacyNote") || document.querySelector(".privacy-note");
    if (privacy) {
      const custom = pack.privacy;
      privacy.textContent = custom || PRIVACY[lang] || PRIVACY.fr;
    }
  }

  async function loadSuiteSettings(api) {
    const out = { language: "fr" };
    try {
      if (api && typeof api.get_suite_settings === "function") {
        const res = await api.get_suite_settings();
        if (res && res.ok && (res.language === "en" || res.language === "fr")) {
          out.language = res.language;
          return out;
        }
      }
      if (api && typeof api.get_suite_language === "function") {
        const res = await api.get_suite_language();
        if (res && res.language) out.language = res.language === "en" ? "en" : "fr";
      }
    } catch (_) {}
    return out;
  }

  async function applyAtelierTheme(api) {
    try {
      const themeApi = global.PcCommandTheme;
      if (!themeApi || typeof themeApi.applyTheme !== "function") return;
      let theme = themeApi.PRESETS && themeApi.PRESETS["pc-command"];
      if (api && typeof api.get_theme === "function") {
        const res = await api.get_theme();
        if (res && res.ok && res.data) theme = res.data;
      }
      if (theme) themeApi.applyTheme(theme);
    } catch (_) {}
  }

  global.MrAurevoXSuite = {
    PRIVACY,
    applyI18n,
    loadSuiteSettings,
    applyAtelierTheme,
  };
})(typeof window !== "undefined" ? window : globalThis);
