(() => {
  "use strict";

  async function setStatusBusy(text, isError) {
    setStatus(text, isError);
    if (window.SuiteProgress) window.SuiteProgress.setBusy(text || "…");
    await new Promise((r) => setTimeout(r, 40));
  }

  function clearProgress() {
    if (window.SuiteProgress) window.SuiteProgress.forceClear();
  }


  const SUITE_I18N = {
  "fr": {
    "featuresTitle": "Fonctions",
    "features": "Vue des connexions réseau et ports. Vérification TCP host:port (ouvert/fermé/timeout), filtre Listen, auto-rafraîchissement, export CSV.",
    "privacy": "Mr-Aurevo-X ne collecte aucune donnée. Vue locale des connexions uniquement.",
    "copyright": "© 2026 Mr-Aurevo-X · local · CGU dans Atelier",
    "hostMissing": "Host indisponible",
    "ready": "Prêt",
    "refreshing": "Actualisation…",
    "fail": "Échec",
    "metaCount": "{shown} / {total} connexions",
    "emptyFilter": "Aucune connexion (filtre / Listen)",
    "btnRefresh": "Rafraîchir",
    "btnOpen": "Dossier",
    "btnExport": "Export CSV",
    "title": "Connexions",
    "tagline": "Réseau · ports · live",
    "filterPh": "Filtrer processus / IP / port…",
    "loading": "Chargement…",
    "exportMissing": "Export indisponible",
    "exporting": "Export CSV…",
    "exportCancelled": "Export annulé",
    "exportFail": "Échec export",
    "exportSaved": "CSV enregistré : {path}",
    "exportDone": "CSV exporté ({count})",
    "listenOnly": "Listen only",
    "autoRefresh": "Auto",
    "portPanelTitle": "Port Check",
    "hostLabel": "Hôte",
    "hostPh": "127.0.0.1 ou example.com",
    "portLabel": "Port",
    "btnPortCheck": "Vérifier TCP",
    "portChecking": "Vérification TCP…",
    "portInvalid": "Port invalide (1–65535)",
    "needHost": "Hôte requis",
    "portNone": "Aucune connexion locale sur ce port",
    "portFound": "{count} connexion(s) locale(s) sur le port {port}",
    "probeOpen": "ouvert · {ms} ms",
    "probeClosed": "fermé · {ms} ms",
    "probeTimeout": "timeout · {ms} ms",
    "thProto": "Proto",
    "thLocal": "Local",
    "thRemote": "Distant",
    "thStatus": "Statut",
    "thPid": "PID",
    "thProc": "Processus",
    "thName": "Nom",
    "thPath": "Chemin"
  },
  "en": {
    "featuresTitle": "Features",
    "features": "Shows network connections and ports. TCP host:port check (open/closed/timeout), Listen filter, auto-refresh, CSV export.",
    "privacy": "Mr-Aurevo-X does not collect your data. Local connection view only.",
    "copyright": "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
    "hostMissing": "Host unavailable",
    "ready": "Ready",
    "refreshing": "Refreshing…",
    "fail": "Failed",
    "metaCount": "{shown} / {total} connections",
    "emptyFilter": "No connections (filter / Listen)",
    "btnRefresh": "Refresh",
    "btnOpen": "Folder",
    "btnExport": "Export CSV",
    "title": "Connections",
    "tagline": "Network · ports · live",
    "filterPh": "Filter process / IP / port…",
    "loading": "Loading…",
    "exportMissing": "Export unavailable",
    "exporting": "Exporting CSV…",
    "exportCancelled": "Export cancelled",
    "exportFail": "Export failed",
    "exportSaved": "CSV saved: {path}",
    "exportDone": "CSV exported ({count})",
    "listenOnly": "Listen only",
    "autoRefresh": "Auto",
    "portPanelTitle": "Port Check",
    "hostLabel": "Host",
    "hostPh": "127.0.0.1 or example.com",
    "portLabel": "Port",
    "btnPortCheck": "Check TCP",
    "portChecking": "TCP check…",
    "portInvalid": "Invalid port (1–65535)",
    "needHost": "Host required",
    "portNone": "No local connection on this port",
    "portFound": "{count} local connection(s) on port {port}",
    "probeOpen": "open · {ms} ms",
    "probeClosed": "closed · {ms} ms",
    "probeTimeout": "timeout · {ms} ms",
    "thProto": "Proto",
    "thLocal": "Local",
    "thRemote": "Remote",
    "thStatus": "Status",
    "thPid": "PID",
    "thProc": "Process",
    "thName": "Name",
    "thPath": "Path"
  }
};
  let suiteLang = "fr";
  const t = (key) => (SUITE_I18N[suiteLang] && SUITE_I18N[suiteLang][key]) || SUITE_I18N.fr[key] || key;

  async function bootSuite(api) {
    const suite = window.MrAurevoXSuite;
    if (!suite) {
      if (api && api.get_suite_accent) {
        try {
          const a = await api.get_suite_accent();
          if (a && a.accent) applyAccent(a.accent);
        } catch (_) {}
      }
      return "fr";
    }
    const settings = await suite.loadSuiteSettings(api);
    suiteLang = settings.language === "en" ? "en" : "fr";
    suite.applyAccent(settings.accent);
    suite.applyI18n(suiteLang, SUITE_I18N);
    return suiteLang;
  }


  const el = {
    filter: document.getElementById("filter"),
    tbody: document.getElementById("tbody"),
    meta: document.getElementById("meta"),
    status: document.getElementById("status"),
    btnRefresh: document.getElementById("btnRefresh"),
    btnOpen: document.getElementById("btnOpen"),
    btnExport: document.getElementById("btnExport"),
    listenOnly: document.getElementById("listenOnly"),
    autoRefresh: document.getElementById("autoRefresh"),
    probeHost: document.getElementById("probeHost"),
    portCheck: document.getElementById("portCheck"),
    btnPortCheck: document.getElementById("btnPortCheck"),
    portTbody: document.getElementById("portTbody"),
    portMeta: document.getElementById("portMeta"),
    probeBadge: document.getElementById("probeBadge"),
  };

  let rows = [];
  let selected = null;
  let selectedKey = "";
  let interacting = false;
  let autoTimer = null;
  let refreshInFlight = false;

  function rowKey(r) {
    return [r.proto, r.laddr, r.raddr, r.status, r.pid, r.name].join("|");
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

  function markInteracting() {
    interacting = true;
    clearTimeout(markInteracting._t);
    markInteracting._t = setTimeout(() => {
      interacting = false;
    }, 2500);
  }

  function isListen(r) {
    const s = String(r.status || "").toUpperCase();
    return s === "LISTEN" || s === "LISTENING" || s.includes("LISTEN");
  }

  function filtered() {
    let list = rows;
    if (el.listenOnly && el.listenOnly.checked) {
      list = list.filter(isListen);
    }
    const q = (el.filter.value || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.proto, r.laddr, r.raddr, r.status, String(r.pid), r.name, r.path].some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }

  function render() {
    const list = filtered();
    el.tbody.innerHTML = "";
    if (!list.length) {
      const tr = document.createElement("tr");
      tr.className = "empty-row";
      tr.innerHTML = `<td colspan="7">${escapeHtml(t("emptyFilter"))}</td>`;
      el.tbody.appendChild(tr);
    } else {
      list.forEach((r) => {
        const key = rowKey(r);
        const tr = document.createElement("tr");
        if (selected && selectedKey === key) tr.classList.add("selected");
        tr.innerHTML = `
          <td>${escapeHtml(r.proto || "")}</td>
          <td class="mono" title="${escapeHtml(r.laddr || "")}">${escapeHtml(r.laddr || "—")}</td>
          <td class="mono" title="${escapeHtml(r.raddr || "")}">${escapeHtml(r.raddr || "—")}</td>
          <td>${escapeHtml(r.status || "—")}</td>
          <td>${r.pid || "—"}</td>
          <td>${escapeHtml(r.name || "—")}</td>
          <td class="path" title="${escapeHtml(r.path || "")}">${escapeHtml(r.path || "—")}</td>`;
        tr.addEventListener("click", () => {
          markInteracting();
          selected = r;
          selectedKey = key;
          el.btnOpen.disabled = !r.path;
          render();
        });
        el.tbody.appendChild(tr);
      });
    }
    el.meta.textContent = t("metaCount").replace("{shown}", String(list.length)).replace("{total}", String(rows.length));
    if (el.btnExport) el.btnExport.disabled = list.length === 0;
  }

  function setProbeBadge(status, ms) {
    if (!el.probeBadge) return;
    const key = status === "open" ? "probeOpen" : status === "timeout" ? "probeTimeout" : "probeClosed";
    el.probeBadge.hidden = false;
    el.probeBadge.textContent = t(key).replace("{ms}", String(ms == null ? "—" : ms));
    el.probeBadge.className = "port-badge status-" + (status || "closed");
  }

  function renderPortRows(list, port) {
    if (!el.portTbody) return;
    el.portTbody.innerHTML = (list || []).map((r) => {
      const local = r.laddr || `${r.LocalAddress || ""}:${r.LocalPort || ""}`;
      const remote = r.raddr || `${r.RemoteAddress || ""}:${r.RemotePort || ""}`;
      const status = r.status || r.State || "—";
      const pid = r.pid || r.OwningProcess || "—";
      const name = r.name || r.ProcessName || "—";
      return `<tr>
        <td class="mono">${escapeHtml(local)}</td>
        <td class="mono">${escapeHtml(remote || "—")}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(pid)}</td>
        <td>${escapeHtml(name)}</td>
      </tr>`;
    }).join("");
    if (el.portMeta) {
      el.portMeta.textContent = list && list.length
        ? t("portFound").replace("{count}", String(list.length)).replace("{port}", String(port))
        : t("portNone");
    }
  }

  async function runPortCheck() {
    markInteracting();
    const api = await apiReady();
    if (!api) {
      el.status.textContent = t("hostMissing");
      return;
    }
    const host = ((el.probeHost && el.probeHost.value) || "").trim() || "127.0.0.1";
    const port = Number(el.portCheck && el.portCheck.value);
    if (!host) {
      el.status.textContent = t("needHost");
      return;
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      el.status.textContent = t("portInvalid");
      return;
    }
    el.status.textContent = t("portChecking");
    if (el.btnPortCheck) el.btnPortCheck.disabled = true;
    try {
      if (api.tcp_probe) {
        const probe = await api.tcp_probe(host, port, 2.0);
        if (!probe || !probe.ok) {
          el.status.textContent = (probe && probe.error) || t("fail");
          if (el.probeBadge) el.probeBadge.hidden = true;
        } else {
          setProbeBadge(probe.status, probe.ms);
          el.status.textContent = t("ready");
        }
      }
      if (api.check_port) {
        const res = await api.check_port(port);
        if (!res || !res.ok) {
          renderPortRows([], port);
          if (!api.tcp_probe) el.status.textContent = (res && res.error) || t("fail");
        } else {
          renderPortRows(res.connections || [], res.port || port);
        }
      }
    } catch (e) {
      el.status.textContent = String(e.message || e);
    } finally {
      if (el.btnPortCheck) el.btnPortCheck.disabled = false;
    }
  }

  async function refresh(fromAuto) {
    if (refreshInFlight) return;
    if (fromAuto && interacting) return;
    const api = await apiReady();
    if (!api) {
      el.status.textContent = t("hostMissing");
      return;
    }
    refreshInFlight = true;
    if (!fromAuto) el.status.textContent = t("refreshing");
    el.btnRefresh.disabled = true;
    try {
      const res = await api.list_connections();
      if (res && res.ok === false) {
        rows = [];
        el.status.textContent = res.error || t("fail");
      } else {
        rows = (res && res.connections) || [];
        if (!fromAuto) el.status.textContent = t("ready");
      }
      selected = null;
      selectedKey = "";
      el.btnOpen.disabled = true;
      render();
    } catch (e) {
      el.status.textContent = String(e.message || e);
    } finally {
      el.btnRefresh.disabled = false;
      refreshInFlight = false;
    }
  }

  function syncAutoTimer() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (el.autoRefresh && el.autoRefresh.checked) {
      autoTimer = setInterval(() => refresh(true), 3000);
    }
  }

  el.btnRefresh.addEventListener("click", () => refresh(false));
  el.filter.addEventListener("input", () => {
    markInteracting();
    render();
  });
  el.filter.addEventListener("focus", markInteracting);
  if (el.listenOnly) {
    el.listenOnly.addEventListener("change", () => {
      markInteracting();
      render();
    });
  }
  if (el.autoRefresh) {
    el.autoRefresh.addEventListener("change", syncAutoTimer);
  }
  if (el.btnPortCheck) {
    el.btnPortCheck.addEventListener("click", runPortCheck);
  }
  if (el.portCheck) {
    el.portCheck.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") runPortCheck();
    });
  }
  el.btnOpen.addEventListener("click", async () => {
    if (!selected || !selected.path) return;
    markInteracting();
    const api = await apiReady();
    const res = await api.open_path(selected.path);
    if (!res.ok) el.status.textContent = res.error || t("fail");
  });
  if (el.btnExport) {
    el.btnExport.addEventListener("click", async () => {
      markInteracting();
      const list = filtered();
      if (!list.length) return;
      const api = await apiReady();
      if (!api || !api.export_csv) {
        el.status.textContent = t("exportMissing");
        return;
      }
      el.status.textContent = t("exporting");
      const res = await api.export_csv(list);
      if (res && res.ok && !res.cancelled) {
        el.status.textContent = res.path
          ? t("exportSaved").replace("{path}", res.path)
          : t("exportDone").replace("{count}", String(res.count || list.length));
      } else if (res && res.cancelled) {
        el.status.textContent = t("exportCancelled");
      } else {
        el.status.textContent = (res && res.error) || t("exportFail");
      }
    });
  }

  (async () => {
    const api = await apiReady();
    await bootSuite(api);
    await refresh(false);
    syncAutoTimer();
  })();
})();
