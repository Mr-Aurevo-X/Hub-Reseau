/**
 * Suite boot: accent + language + theme (dark|light).
 * Expects pywebview api.get_suite_settings() -> { ok, accent, language, theme }
 */
(function (global) {
  const DEFAULT_ACCENT = "#e03545";
  const DEFAULT_THEME = "dark";
  const PRIVACY = {
    fr: "Aucune collecte de données par Mr-Aurevo-X. Tout reste sur cet ordinateur.",
    en: "Mr-Aurevo-X does not collect your data. Everything stays on this PC.",
  };

  function normalizeAccent(value) {
    const accent = String(value || "").trim();
    if (accent.startsWith("#") && (accent.length === 4 || accent.length === 7)) return accent;
    return DEFAULT_ACCENT;
  }

  function normalizeTheme(value) {
    const t = String(value || "").trim().toLowerCase();
    return t === "light" ? "light" : "dark";
  }

  function applyAccent(hex) {
    const accent = normalizeAccent(hex);
    let h = accent.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const root = document.documentElement;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-dim", `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.35)`);
    return accent;
  }

  function applyTheme(theme) {
    const t = normalizeTheme(theme);
    document.documentElement.setAttribute("data-theme", t);
    try {
      document.body && document.body.setAttribute("data-theme", t);
    } catch (_) {}
    return t;
  }

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
    const out = { language: "fr", accent: DEFAULT_ACCENT, theme: DEFAULT_THEME };
    try {
      if (typeof process !== "undefined" && process.env && process.env.MRAUREVOX_THEME) {
        out.theme = normalizeTheme(process.env.MRAUREVOX_THEME);
      }
    } catch (_) {}
    try {
      if (api && typeof api.get_suite_settings === "function") {
        const res = await api.get_suite_settings();
        if (res && res.ok) {
          if (res.language === "en" || res.language === "fr") out.language = res.language;
          if (res.accent) out.accent = normalizeAccent(res.accent);
          if (res.theme) out.theme = normalizeTheme(res.theme);
          return out;
        }
      }
      if (api && typeof api.get_suite_language === "function") {
        const res = await api.get_suite_language();
        if (res && res.language) out.language = res.language === "en" ? "en" : "fr";
      }
      if (api && typeof api.get_suite_accent === "function") {
        const res = await api.get_suite_accent();
        if (res && res.accent) out.accent = normalizeAccent(res.accent);
      }
      if (api && typeof api.get_suite_theme === "function") {
        const res = await api.get_suite_theme();
        if (res && res.theme) out.theme = normalizeTheme(res.theme);
      }
    } catch (_) {}
    return out;
  }

  global.MrAurevoXSuite = {
    PRIVACY,
    applyAccent,
    applyTheme,
    applyI18n,
    loadSuiteSettings,
    normalizeAccent,
    normalizeTheme,
  };

  /* PC Command embed: ?embed=1 -> body.pcd-embed (hub iframe) */
  function applyPcdEmbedClass() {
    try {
      if (!/(?:^|[?&])embed=1(?:&|$)/.test(String(location.search || ""))) return;
      document.documentElement.classList.add("pcd-embed");
      const mark = () => {
        if (document.body) document.body.classList.add("pcd-embed");
      };
      if (document.body) mark();
      else document.addEventListener("DOMContentLoaded", mark);
    } catch (_) {}
  }
  applyPcdEmbedClass();

  async function autoApplySuiteChrome() {
    try {
      const api = global.pywebview && global.pywebview.api;
      const s = await loadSuiteSettings(api);
      applyAccent(s.accent);
      applyTheme(s.theme);
    } catch (_) {
      applyTheme(DEFAULT_THEME);
    }
  }

  if (typeof document !== "undefined") {
    const run = () => {
      autoApplySuiteChrome();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
    global.addEventListener("pywebviewready", run);
  }
})(typeof window !== "undefined" ? window : globalThis);
