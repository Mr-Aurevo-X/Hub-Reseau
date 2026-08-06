(function () {
  "use strict";

  const SUITE_I18N = {
    fr: {
      tagline: "Réseau admin · local",
      featuresTitle: "Fonctions",
      features: "Réinit. adaptateurs, édition hosts et règles pare-feu — un seul hub.",
      privacy: "Mr-Aurevo-X ne collecte aucune donnée. Outils locaux uniquement.",
      copyright: "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
      title: "NetAdmin",
      subtitle: "L'Atelier Windows — administration réseau",
      tabAdapters: "Adaptateurs",
      tabHosts: "Hosts",
      tabFirewall: "Pare-feu",
      btnResetIp: "Reset IP",
      btnResetWinsock: "Reset Winsock",
      adminHint: "Ces actions nécessitent les droits administrateur.",
      winsockWarn: "Winsock : un redémarrage peut être nécessaire après reset.",
      confirmResetIp: "Exécuter ipconfig /release puis /renew ? La connexion réseau peut être interrompue brièvement.",
      confirmResetWinsock: "Exécuter netsh winsock reset ? Un redémarrage Windows est recommandé ensuite.",
      runningIp: "Reset IP en cours…",
      runningWinsock: "Reset Winsock en cours…",
      needsAdmin: "Administrateur requis — lancez depuis Atelier (admin).",
      doneIp: "Reset IP terminé",
      doneWinsock: "Reset Winsock terminé — redémarrage recommandé",
      outputEmpty: "La sortie des commandes s'affichera ici.",
      metaAdmin: "Mode administrateur",
      metaUser: "Mode utilisateur — droits admin requis",
      btnReload: "Recharger",
      btnSave: "Enregistrer",
      btnLoadProfile: "Charger",
      btnSaveProfile: "Sauver profil",
      profileLabel: "Profil",
      profilePh: "Nom du profil…",
      backupHint: "Un backup est créé dans %LOCALAPPDATA%\\Mr-Aurevo-X\\hosts-backups\\ avant chaque écriture.",
      backupLast: "Dernier backup : {backup}",
      btnFlushDns: "Flush DNS",
      btnResolveHost: "Résoudre",
      hostLabel: "Hostname",
      hostPh: "example.com",
      confirmFlush: "Vider le cache DNS maintenant ?",
      flushing: "Flush DNS…",
      flushed: "Cache DNS vidé",
      flushFail: "Échec flush DNS",
      resolving: "Résolution…",
      needHostname: "Hostname requis",
      resolveFail: "Échec résolution",
      resolveOk: "{count} enregistrement(s)",
      resolveNone: "Aucun enregistrement",
      thName: "Name",
      thType: "Type",
      thTtl: "TTL",
      thIp: "IP / Host",
      refreshing: "Lecture…",
      writing: "Écriture…",
      confirmWrite: "Écrire le fichier hosts système ? Un backup sera créé avant l'écriture.",
      saved: "Enregistré. Backup : {backup}",
      readFail: "Échec lecture",
      writeFail: "Échec écriture",
      noProfile: "Aucun profil",
      chooseProfile: "— choisir —",
      needProfile: "Choisissez ou saisissez un profil",
      needName: "Nom de profil requis",
      profileLoaded: "Profil chargé : {name}",
      profileSaved: "Profil sauvé : {name}",
      loadFail: "Échec chargement",
      saveProfileFail: "Échec sauvegarde profil",
      filterPh: "Filtrer…",
      btnRefresh: "Rafraîchir",
      btnEnable: "Activer",
      btnDisable: "Désactiver",
      thFwName: "Nom",
      thEnabled: "Activé",
      thDir: "Dir",
      thAction: "Action",
      metaCount: "{n} règles",
      empty: "Aucune règle",
      needSelect: "Sélectionnez une règle",
      confirmEnable: "Activer la règle « {name} » ?",
      confirmDisable: "Désactiver la règle « {name} » ?",
      adminSuffix: " · admin",
      noAdminSuffix: " · non-admin",
      hostMissing: "API indisponible — lancez via Atelier / Lancer.cmd",
      ready: "Prêt",
      fail: "Échec",
      loading: "Chargement…",
    },
    en: {
      tagline: "Net admin · local",
      featuresTitle: "Features",
      features: "Adapter reset, hosts editor and firewall rules — one hub.",
      privacy: "Mr-Aurevo-X does not collect your data. Local tools only.",
      copyright: "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
      title: "NetAdmin",
      subtitle: "L'Atelier Windows — network administration",
      tabAdapters: "Adapters",
      tabHosts: "Hosts",
      tabFirewall: "Firewall",
      btnResetIp: "Reset IP",
      btnResetWinsock: "Reset Winsock",
      adminHint: "These actions require administrator rights.",
      winsockWarn: "Winsock: a reboot may be required after reset.",
      confirmResetIp: "Run ipconfig /release then /renew? Network may drop briefly.",
      confirmResetWinsock: "Run netsh winsock reset? A Windows reboot is recommended afterward.",
      runningIp: "Resetting IP…",
      runningWinsock: "Resetting Winsock…",
      needsAdmin: "Administrator required — launch from elevated Atelier.",
      doneIp: "IP reset complete",
      doneWinsock: "Winsock reset complete — reboot recommended",
      outputEmpty: "Command output will appear here.",
      metaAdmin: "Administrator mode",
      metaUser: "Standard user — admin rights required",
      btnReload: "Reload",
      btnSave: "Save",
      btnLoadProfile: "Load",
      btnSaveProfile: "Save profile",
      profileLabel: "Profile",
      profilePh: "Profile name…",
      backupHint: "A backup is created in %LOCALAPPDATA%\\Mr-Aurevo-X\\hosts-backups\\ before each write.",
      backupLast: "Last backup: {backup}",
      btnFlushDns: "Flush DNS",
      btnResolveHost: "Resolve",
      hostLabel: "Hostname",
      hostPh: "example.com",
      confirmFlush: "Flush the DNS cache now?",
      flushing: "Flushing DNS…",
      flushed: "DNS cache flushed",
      flushFail: "DNS flush failed",
      resolving: "Resolving…",
      needHostname: "Hostname required",
      resolveFail: "Resolve failed",
      resolveOk: "{count} record(s)",
      resolveNone: "No records",
      thName: "Name",
      thType: "Type",
      thTtl: "TTL",
      thIp: "IP / Host",
      refreshing: "Reading…",
      writing: "Writing…",
      confirmWrite: "Write the system hosts file? A backup will be created first.",
      saved: "Saved. Backup: {backup}",
      readFail: "Read failed",
      writeFail: "Write failed",
      noProfile: "No profiles",
      chooseProfile: "— choose —",
      needProfile: "Choose or enter a profile name",
      needName: "Profile name required",
      profileLoaded: "Profile loaded: {name}",
      profileSaved: "Profile saved: {name}",
      loadFail: "Load failed",
      saveProfileFail: "Profile save failed",
      filterPh: "Filter…",
      btnRefresh: "Refresh",
      btnEnable: "Enable",
      btnDisable: "Disable",
      thFwName: "Name",
      thEnabled: "Enabled",
      thDir: "Dir",
      thAction: "Action",
      metaCount: "{n} rules",
      empty: "No rules",
      needSelect: "Select a rule",
      confirmEnable: "Enable rule \"{name}\"?",
      confirmDisable: "Disable rule \"{name}\"?",
      adminSuffix: " · admin",
      noAdminSuffix: " · non-admin",
      hostMissing: "API unavailable — launch via Atelier / Lancer.cmd",
      ready: "Ready",
      fail: "Failed",
      loading: "Loading…",
    },
  };

  let lang = "fr";
  let booted = false;
  let fwRows = [];
  let fwSelected = null;
  let hostsLoaded = false;
  let fwLoaded = false;

  const t = (k) => (SUITE_I18N[lang] && SUITE_I18N[lang][k]) || SUITE_I18N.fr[k] || k;

  function api() {
    return window.pywebview && window.pywebview.api;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(msg, ok) {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("ok", ok === true);
    el.classList.toggle("error", ok === false);
    if (window.SuiteProgress && (!msg || /^(prêt|ready|échec|failed|ok)/i.test(String(msg).trim()))) {
      window.SuiteProgress.forceClear();
    }
  }

  async function setBusy(msg) {
    setStatus(msg);
    if (window.SuiteProgress) window.SuiteProgress.setBusy(msg || "…");
    await new Promise((r) => setTimeout(r, 40));
  }

  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (SUITE_I18N.fr[k]) el.textContent = t(k);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const k = el.getAttribute("data-i18n-placeholder");
      if (SUITE_I18N.fr[k]) el.setAttribute("placeholder", t(k));
    });
  }

  async function bootSuite() {
    const a = api();
    const suite = window.MrAurevoXSuite;
    if (suite) {
      const s = await suite.loadSuiteSettings(a);
      lang = s.language === "en" ? "en" : "fr";
      suite.applyAccent(s.accent);
      if (suite.applyTheme) suite.applyTheme(s.theme);
      suite.applyI18n(lang, SUITE_I18N);
    } else if (a && a.get_suite_settings) {
      try {
        const s = await a.get_suite_settings();
        if (s && s.language === "en") lang = "en";
      } catch (_) {}
    }
    applyI18n();
  }

  function switchTab(id) {
    document.querySelectorAll(".hub-tab").forEach((btn) => {
      const on = btn.getAttribute("data-tab") === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".hub-panel").forEach((panel) => {
      const on = panel.getAttribute("data-panel") === id;
      panel.classList.toggle("active", on);
      panel.hidden = !on;
    });
    if (id === "hosts" && !hostsLoaded) loadHosts();
    if (id === "firewall" && !fwLoaded) refreshFw();
  }


  async function refreshAdminMeta() {
    const a = api();
    const meta = document.getElementById("adapterMeta");
    if (!a || !a.is_admin || !meta) return;
    try {
      const res = await a.is_admin();
      meta.textContent = res && res.admin ? t("metaAdmin") : t("metaUser");
    } catch (_) {
      meta.textContent = "—";
    }
  }

  async function prepareAction(action, payload) {
    const a = api();
    if (!a || typeof a.prepare_action !== "function") {
      throw new Error(t("hostMissing"));
    }
    const prep = await a.prepare_action(action, payload || {});
    if (!prep || !prep.ok || !prep.token) {
      throw new Error((prep && prep.error) || t("fail"));
    }
    return prep.token;
  }

  async function runAdapter(kind) {
    const confirmKey = kind === "ip" ? "confirmResetIp" : "confirmResetWinsock";
    if (!window.confirm(t(confirmKey))) return;
    const a = api();
    if (!a) {
      setStatus(t("hostMissing"), false);
      return;
    }
    await setBusy(kind === "ip" ? t("runningIp") : t("runningWinsock"));
    const action = kind === "ip" ? "reset_ip" : "reset_winsock";
    let res;
    try {
      const token = await prepareAction(action, {});
      const fn = kind === "ip" ? a.reset_ip : a.reset_winsock;
      res = await fn.call(a, token);
    } catch (e) {
      setStatus(String(e.message || e), false);
      return;
    }
    const out = document.getElementById("adapterOut");
    if (!res || !res.ok) {
      if (res && res.needsAdmin) setStatus(t("needsAdmin"), false);
      else setStatus((res && res.error) || t("fail"), false);
      if (res && res.output && out) out.textContent = res.output;
      return;
    }
    if (out) out.textContent = res.output || "";
    setStatus(kind === "ip" ? t("doneIp") : t("doneWinsock"), true);
    await refreshAdminMeta();
  }


  async function refreshProfiles() {
    const a = api();
    if (!a || !a.list_profiles) return;
    const res = await a.list_profiles();
    const names = (res && res.profiles) || [];
    const sel = document.getElementById("profileSelect");
    const current = sel.value;
    sel.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = names.length ? t("chooseProfile") : t("noProfile");
    sel.appendChild(empty);
    names.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    });
    if (names.includes(current)) sel.value = current;
  }

  async function loadHosts() {
    const a = api();
    if (!a) {
      setStatus(t("hostMissing"), false);
      return;
    }
    setStatus(t("refreshing"));
    try {
      await refreshProfiles();
      const res = await a.read_hosts();
      if (!res.ok) {
        setStatus(res.error || t("readFail"), false);
        if (res.needAdmin)        return;
      }
      document.getElementById("editor").value = res.text || "";
      document.getElementById("hostsMeta").textContent = res.path || "hosts";
      hostsLoaded = true;
      setStatus(t("ready"), true);
    } catch (e) {
      setStatus(String(e.message || e), false);
    }
  }

  function renderFw() {
    const tbody = document.getElementById("fwTbody");
    const meta = document.getElementById("fwMeta");
    const q = (document.getElementById("fwFilter")?.value || "").toLowerCase();
    const shown = fwRows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
    if (!shown.length) {
      tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(t("empty"))}</td></tr>`;
    } else {
      tbody.innerHTML = shown
        .map(
          (r) => `<tr data-name="${escapeHtml(r.Name || "")}" class="${fwSelected === r.Name ? "selected" : ""}">
        <td class="wrap">${escapeHtml(r.DisplayName || r.Name || "")}</td>
        <td>${escapeHtml(String(r.Enabled))}</td>
        <td>${escapeHtml(r.Direction || "")}</td>
        <td>${escapeHtml(r.Action || "")}</td></tr>`
        )
        .join("");
      tbody.querySelectorAll("tr[data-name]").forEach((tr) => {
        tr.addEventListener("click", () => {
          fwSelected = tr.getAttribute("data-name");
          renderFw();
        });
      });
    }
    meta.textContent = t("metaCount").replace("{n}", String(shown.length));
  }

  async function refreshFw() {
    const a = api();
    if (!a || !a.list_rules) {
      setStatus(t("hostMissing"), false);
      return;
    }
    await setBusy(t("loading"));
    const res = await a.list_rules();
    if (!res || !res.ok) {
      setStatus((res && res.error) || t("fail"), false);
      return;
    }
    fwRows = res.rules || [];
    fwLoaded = true;
    renderFw();
    setStatus(t("ready") + (res.admin ? t("adminSuffix") : t("noAdminSuffix")), true);
  }

  async function setFwEnabled(en) {
    if (!fwSelected) {
      setStatus(t("needSelect"), false);
      return;
    }
    const key = en ? "confirmEnable" : "confirmDisable";
    if (!confirm(t(key).replace("{name}", fwSelected))) return;
    const a = api();
    try {
      const payload = { name: fwSelected, enabled: !!en };
      const token = await prepareAction("set_rule_enabled", payload);
      const res = await a.set_rule_enabled(fwSelected, en, token);
      setStatus(res && res.ok ? t("ready") : (res && res.error) || t("fail"), !!(res && res.ok));
      if (res && res.ok) refreshFw();
    } catch (e) {
      setStatus(String(e.message || e), false);
    }
  }

  function wire() {
    document.getElementById("hubTabs")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-tab]");
      if (btn) switchTab(btn.getAttribute("data-tab"));
    });

    document.getElementById("btnResetIp")?.addEventListener("click", () => runAdapter("ip"));
    document.getElementById("btnResetWinsock")?.addEventListener("click", () => runAdapter("winsock"));

    document.getElementById("btnReload")?.addEventListener("click", loadHosts);
    document.getElementById("btnSave")?.addEventListener("click", async () => {
      if (!confirm(t("confirmWrite"))) return;
      const a = api();
      if (!a) return;
      setStatus(t("writing"));
      try {
        const text = document.getElementById("editor").value;
        const token = await prepareAction("write_hosts", { text: String(text || "") });
        const res = await a.write_hosts(text, token);
        if (!res.ok) {
          setStatus(res.error || t("writeFail"), false);
          if (res.needAdmin)        return;
        }
        setStatus(t("saved").replace("{backup}", res.backup || "—"), true);
        const note = document.getElementById("backupNote");
        if (note && res.backup) note.textContent = t("backupLast").replace("{backup}", res.backup);
      } catch (e) {
        setStatus(String(e.message || e), false);
      }
    });

    document.getElementById("profileSelect")?.addEventListener("change", () => {
      const sel = document.getElementById("profileSelect");
      if (sel.value) document.getElementById("profileName").value = sel.value;
    });

    document.getElementById("btnLoadProfile")?.addEventListener("click", async () => {
      const name = (
        document.getElementById("profileSelect").value ||
        document.getElementById("profileName").value ||
        ""
      ).trim();
      if (!name) {
        setStatus(t("needProfile"), false);
        return;
      }
      const res = await api().load_profile(name);
      if (!res.ok) {
        setStatus(res.error || t("loadFail"), false);
        return;
      }
      document.getElementById("editor").value = res.text || "";
      document.getElementById("profileName").value = res.name || name;
      setStatus(t("profileLoaded").replace("{name}", res.name), true);
    });

    document.getElementById("btnSaveProfile")?.addEventListener("click", async () => {
      const name = (
        document.getElementById("profileName").value ||
        document.getElementById("profileSelect").value ||
        ""
      ).trim();
      if (!name) {
        setStatus(t("needName"), false);
        return;
      }
      const res = await api().save_profile(name, document.getElementById("editor").value);
      if (!res.ok) {
        setStatus(res.error || t("saveProfileFail"), false);
        return;
      }
      setStatus(t("profileSaved").replace("{name}", res.name), true);
      await refreshProfiles();
      document.getElementById("profileSelect").value = res.name;
    });

    document.getElementById("btnFlushDns")?.addEventListener("click", async () => {
      if (!confirm(t("confirmFlush"))) return;
      const a = api();
      if (!a || !a.flush_dns) {
        setStatus(t("hostMissing"), false);
        return;
      }
      setStatus(t("flushing"));
      let res;
      try {
        const token = await prepareAction("flush_dns", {});
        res = await a.flush_dns(token);
      } catch (e) {
        setStatus(String(e.message || e), false);
        return;
      }
      const flushOut = document.getElementById("flushOut");
      if (flushOut) {
        flushOut.hidden = false;
        flushOut.textContent = (res && (res.output || res.error)) || "";
      }
      setStatus(res && res.ok ? t("flushed") : (res && res.error) || t("flushFail"), !!(res && res.ok));
    });

    document.getElementById("btnResolveHost")?.addEventListener("click", async () => {
      const host = (document.getElementById("resolveHost")?.value || "").trim();
      if (!host) {
        setStatus(t("needHostname"), false);
        return;
      }
      const a = api();
      if (!a || !a.resolve_host) {
        setStatus(t("hostMissing"), false);
        return;
      }
      setStatus(t("resolving"));
      const res = await a.resolve_host(host);
      const records = (res && res.records) || [];
      document.getElementById("dnsTbody").innerHTML = records
        .map(
          (r) => `<tr>
            <td>${escapeHtml(r.Name || "")}</td>
            <td>${escapeHtml(r.Type || "")}</td>
            <td>${escapeHtml(r.TTL || "")}</td>
            <td>${escapeHtml(r.IPAddress || r.NameHost || "")}</td>
          </tr>`
        )
        .join("");
      document.getElementById("dnsMeta").textContent = records.length
        ? t("resolveOk").replace("{count}", String(records.length))
        : t("resolveNone");
      setStatus(res && res.ok ? t("ready") : (res && res.error) || t("resolveFail"), !!(res && res.ok));
    });

    document.getElementById("fwFilter")?.addEventListener("input", renderFw);
    document.getElementById("btnFwRefresh")?.addEventListener("click", refreshFw);
    document.getElementById("btnEnable")?.addEventListener("click", () => setFwEnabled(true));
    document.getElementById("btnDisable")?.addEventListener("click", () => setFwEnabled(false));
  }

  async function boot() {
    if (booted) return;
    booted = true;
    wire();
    await bootSuite();
    document.getElementById("adapterOut").textContent = t("outputEmpty");
    await refreshAdminMeta();
    setStatus(t("ready"), true);
  }

  if (window.pywebview) {
    window.addEventListener("pywebviewready", boot);
    setTimeout(boot, 80);
  } else {
    window.addEventListener("pywebviewready", boot);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
