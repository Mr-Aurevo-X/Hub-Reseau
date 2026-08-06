(() => {
  "use strict";
  const SUITE_I18N = {
  "fr": {
    "tagline": "Profils Wi‑Fi · clé claire",
    "copyright": "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
    "title": "Wi‑Fi",
    "featuresTitle": "Fonctions",
    "features": "Liste les profils WLAN et affiche la clé.",
    "privacy": "Mr-Aurevo-X ne collecte aucune donnée. Clés Wi‑Fi locales uniquement.",
    "hostMissing": "Host indisponible",
    "ready": "Prêt",
    "fail": "Échec",
    "loading": "Chargement…",
    "btnRefresh": "Rafraîchir",
    "filterPh": "Filtrer…",
    "btnKey": "Afficher clé",
    "btnHideKey": "Masquer clé",
    "thName": "Profil",
    "keyPlaceholder": "—",
    "keyMasked": "••••••••",
    "noKey": "Clé non trouvée (admin ?)",
    "metaCount": "{n} profil(s)",
    "empty": "Aucun profil Wi‑Fi",
    "needSelect": "Sélectionnez un profil",
    "confirmReveal": "Afficher la clé Wi‑Fi de « {name} » ?",
    "alreadyAdmin": "Déjà en administrateur",
    "adminSuffix": " · admin",
    "noAdminSuffix": " · non-admin"
  },
  "en": {
    "tagline": "Wi‑Fi profiles · clear key",
    "copyright": "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
    "title": "Wi‑Fi",
    "featuresTitle": "Features",
    "features": "List WLAN profiles and show the key.",
    "privacy": "Mr-Aurevo-X does not collect your data. Local Wi‑Fi keys only.",
    "hostMissing": "Host unavailable",
    "ready": "Ready",
    "fail": "Failed",
    "loading": "Loading…",
    "btnRefresh": "Refresh",
    "filterPh": "Filter…",
    "btnKey": "Show key",
    "btnHideKey": "Hide key",
    "thName": "Profile",
    "keyPlaceholder": "—",
    "keyMasked": "••••••••",
    "noKey": "Key not found (admin?)",
    "metaCount": "{n} profile(s)",
    "empty": "No Wi‑Fi profiles",
    "needSelect": "Select a profile",
    "confirmReveal": "Reveal the Wi‑Fi key for \"{name}\"?",
    "alreadyAdmin": "Already running as admin",
    "adminSuffix": " · admin",
    "noAdminSuffix": " · non-admin"
  }
};

  let suiteLang = "fr";
  const t = (key) => (SUITE_I18N[suiteLang] && SUITE_I18N[suiteLang][key]) || SUITE_I18N.fr[key] || key;

  async function bootSuite(api) {
    const suite = window.MrAurevoXSuite;
    if (!suite) {
      if (api && api.get_suite_settings) {
        try {
          const s = await api.get_suite_settings();
          if (s && s.accent) applyAccent(s.accent);
          if (s && s.language === "en") suiteLang = "en";
        } catch (_) {}
      } else if (api && api.get_suite_accent) {
        try {
          const a = await api.get_suite_accent();
          if (a && a.accent) applyAccent(a.accent);
        } catch (_) {}
      }
      return suiteLang;
    }
    const settings = await suite.loadSuiteSettings(api);
    suiteLang = settings.language === "en" ? "en" : "fr";
    suite.applyAccent(settings.accent);
    suite.applyI18n(suiteLang, SUITE_I18N);
    return suiteLang;
  }

  function applyAccent(hex) {
    const accent = String(hex || "#e03545").trim();
    if (!(accent.startsWith("#") && (accent.length === 4 || accent.length === 7))) return;
    let h = accent.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const root = document.documentElement;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-dim", `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.4)`);
  }

  async function apiReady() {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      window.addEventListener("pywebviewready", () => resolve(window.pywebview.api), { once: true });
      setTimeout(() => resolve(window.pywebview && window.pywebview.api), 2500);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(text, isError) {
    if (!el.status) return;
    el.status.textContent = text || "";
    el.status.classList.toggle("error", !!isError);
    const s = String(text || "").trim();
    if (/^(prêt|ready|échec|failed|ok)$/i.test(s) || s === "") {
      if (window.SuiteProgress) window.SuiteProgress.forceClear();
    }
  }

  async function setStatusBusy(text, isError) {
    setStatus(text, isError);
    if (window.SuiteProgress) window.SuiteProgress.setBusy(text || "…");
    await new Promise((r) => setTimeout(r, 40));
  }

  function clearProgress() {
    if (window.SuiteProgress) window.SuiteProgress.forceClear();
  }

  const el = { tbody: document.getElementById("tbody"), keyBox: document.getElementById("keyBox"),
    meta: document.getElementById("meta"), status: document.getElementById("status"),
    btnRefresh: document.getElementById("btnRefresh"), btnKey: document.getElementById("btnKey")};
  let rows = [], selected = null;
  let revealedKey = null;
  let keyVisible = false;

  function paintKeyBox() {
    if (!el.keyBox) return;
    if (!revealedKey) {
      el.keyBox.textContent = t("keyPlaceholder");
      if (el.btnKey) el.btnKey.textContent = t("btnKey");
      return;
    }
    el.keyBox.textContent = keyVisible ? revealedKey : t("keyMasked");
    if (el.btnKey) el.btnKey.textContent = keyVisible ? t("btnHideKey") : t("btnKey");
  }

  function clearRevealedKey() {
    revealedKey = null;
    keyVisible = false;
    paintKeyBox();
  }

  function render() {
    if (!rows.length) {
      el.tbody.innerHTML = `<tr><td>${escapeHtml(t("empty"))}</td></tr>`;
    } else {
      el.tbody.innerHTML = rows.map((r) => `<tr data-name="${escapeHtml(r.name||"")}" class="${selected===r.name?"selected":""}">
        <td>${escapeHtml(r.name||"")}</td></tr>`).join("");
    }
    el.meta.textContent = t("metaCount").replace("{n}", String(rows.length));
    el.tbody.querySelectorAll("tr[data-name]").forEach((tr) => tr.addEventListener("click", () => {
      const name = tr.getAttribute("data-name");
      if (selected !== name) clearRevealedKey();
      selected = name;
      render();
    }));
  }

  async function refresh() {
    const api = await apiReady();
    if (!api) { setStatus(t("hostMissing"), true); return; }
    await setStatusBusy(t("loading"));
    const res = await api.list_profiles();
    clearProgress();
    if (!res || !res.ok) { setStatus((res && res.error) || t("fail"), true); return; }
    rows = res.profiles || [];
    clearRevealedKey();
    render();
    setStatus(t("ready") + (res.admin ? t("adminSuffix") : t("noAdminSuffix")));
  }

  el.btnRefresh.addEventListener("click", refresh);
  el.btnKey.addEventListener("click", async () => {
    if (!selected) { setStatus(t("needSelect"), true); return; }
    if (revealedKey && keyVisible) {
      keyVisible = false;
      paintKeyBox();
      return;
    }
    if (revealedKey && !keyVisible) {
      keyVisible = true;
      paintKeyBox();
      return;
    }
    if (!confirm(t("confirmReveal").replace("{name}", selected))) return;
    const api = await apiReady();
    if (!api || !api.prepare_get_key || !api.get_key) {
      setStatus(t("hostMissing"), true);
      return;
    }
    await setStatusBusy(t("loading"));
    const prep = await api.prepare_get_key(selected);
    if (!prep || !prep.ok || !prep.token) {
      clearProgress();
      setStatus((prep && prep.error) || t("fail"), true);
      return;
    }
    const res = await api.get_key(selected, prep.token);
    clearProgress();
    if (!res || !res.ok) {
      clearRevealedKey();
      setStatus((res && res.error) || t("fail"), true);
      return;
    }
    const key = String(res.key || "");
    if (!key) {
      clearRevealedKey();
      el.keyBox.textContent = t("noKey");
      setStatus(t("ready"));
      return;
    }
    revealedKey = key;
    keyVisible = true;
    paintKeyBox();
    setStatus(t("ready"));
  });
  (async () => {
    const api = await apiReady();
    await bootSuite(api);
    paintKeyBox();
    await refresh();
  })();

})();
