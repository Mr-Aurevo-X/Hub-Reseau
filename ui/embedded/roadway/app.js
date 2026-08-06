/* RoadWay-X UI v1.1–1.3 */
(function () {
  const I18N = {
    fr: {
      tagline: "Trafic · alertes · live",
      featuresTitle: "Fonctions",
      features:
        "Débit, flux, heuristiques, apprentissage et lookups opt-in — jamais de blocage auto.",
      copyright: "© 2026 Mr-Aurevo-X · hors Suite · CGU dans Atelier",
      privacy: "Monitoring local. Lookups externes opt-in. Aucun blocage automatique.",
      tabLive: "Live",
      tabQuiz: "À trancher",
      tabAlerts: "Alertes",
      tabRules: "Règles",
      liveTitle: "Trafic en direct",
      loading: "Chargement…",
      auto: "Auto",
      filterPh: "Filtrer…",
      refresh: "Actualiser",
      exportJson: "Export JSON",
      exportCsv: "Export CSV",
      openNetMap: "NetMap",
      legendDown: "Descendant",
      legendUp: "Montant",
      colProcess: "Processus",
      colProto: "Proto",
      colLocal: "Local",
      colRemote: "Distant",
      colStatus: "État",
      colRate: "Débit*",
      emptyLive: "Aucune connexion",
      topsTitle: "Top processus",
      dnsTitle: "DNS récent",
      rateHint: "* Débit = I/O Windows (approx.) sauf indication contraire.",
      quizTitle: "À trancher",
      quizSub: "Apprentissage — aucune action réseau sans confirmation",
      startLearn: "Apprendre 10 min",
      stopLearn: "Stop",
      alertsTitle: "Alertes",
      toasts: "Toasts",
      clearAlerts: "Vider",
      rulesTitle: "Règles & réglages",
      rulesSub: "Seuils, trust, lookups opt-in, startup",
      saveRules: "Enregistrer",
      openData: "Données",
      blocklistTitle: "Blocklist",
      saveBlocklist: "Sauver blocklist",
      thresholdsTitle: "Seuils",
      repTitle: "Réputation (opt-in)",
      mute: "Mute",
      unmute: "Unmute",
      emptyAlerts: "Aucune alerte.",
      emptyQuiz: "Rien à trancher. Lance « Apprendre » pour détecter les nouveautés.",
      trustBtn: "Confiance",
      ignoreBtn: "Ignorer",
      blockBtn: "Proposer blocage…",
      monitoring: "Monitoring",
      paused: "En pause",
      statConn: "Flux",
      statAlerts: "Alertes",
      statQuiz: "À trancher",
    },
    en: {
      tagline: "Traffic · alerts · live",
      featuresTitle: "Features",
      features: "Throughput, flows, heuristics, learning and opt-in lookups — never auto-block.",
      copyright: "© 2026 Mr-Aurevo-X · outside Suite · Terms in Atelier",
      privacy: "Local monitoring. External lookups opt-in. No automatic blocking.",
      tabLive: "Live",
      tabQuiz: "Decide",
      tabAlerts: "Alerts",
      tabRules: "Rules",
      liveTitle: "Live traffic",
      loading: "Loading…",
      auto: "Auto",
      filterPh: "Filter…",
      refresh: "Refresh",
      exportJson: "Export JSON",
      exportCsv: "Export CSV",
      openNetMap: "NetMap",
      legendDown: "Down",
      legendUp: "Up",
      colProcess: "Process",
      colProto: "Proto",
      colLocal: "Local",
      colRemote: "Remote",
      colStatus: "State",
      colRate: "Rate*",
      emptyLive: "No connections",
      topsTitle: "Top processes",
      dnsTitle: "Recent DNS",
      rateHint: "* Rate = Windows I/O (approx.) unless noted.",
      quizTitle: "Decide",
      quizSub: "Learning — no network action without confirmation",
      startLearn: "Learn 10 min",
      stopLearn: "Stop",
      alertsTitle: "Alerts",
      toasts: "Toasts",
      clearAlerts: "Clear",
      rulesTitle: "Rules & settings",
      rulesSub: "Thresholds, trust, opt-in lookups, startup",
      saveRules: "Save",
      openData: "Data",
      blocklistTitle: "Blocklist",
      saveBlocklist: "Save blocklist",
      thresholdsTitle: "Thresholds",
      repTitle: "Reputation (opt-in)",
      mute: "Mute",
      unmute: "Unmute",
      emptyAlerts: "No alerts.",
      emptyQuiz: "Nothing to decide. Start Learn to catch unknowns.",
      trustBtn: "Trust",
      ignoreBtn: "Ignore",
      blockBtn: "Propose block…",
      monitoring: "Monitoring",
      paused: "Paused",
      statConn: "Flows",
      statAlerts: "Alerts",
      statQuiz: "Decide",
    },
  };

  let api = null;
  let lang = "fr";
  let timer = null;
  let rulesCache = {};
  let mutedRules = new Set();
  let liveFilter = "all";
  let lastSnap = null;
  let alertedPids = new Set();
  let ctxRow = null;
  let confirmAction = null;

  function t(key) {
    return (I18N[lang] || I18N.fr)[key] != null ? (I18N[lang] || I18N.fr)[key] : key;
  }
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmtBps(n) {
    const v = Number(n) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1) + " MB/s";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + " KB/s";
    return Math.round(v) + " B/s";
  }

  function waitApi() {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      window.addEventListener("pywebviewready", () => resolve(window.pywebview.api), { once: true });
      setTimeout(() => resolve(window.pywebview && window.pywebview.api), 2500);
    });
  }

  function setupTabs() {
    document.querySelectorAll(".hub-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        document.querySelectorAll(".hub-tab").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        document.querySelectorAll(".hub-panel").forEach((p) => {
          p.classList.toggle("active", p.getAttribute("data-panel") === tab);
        });
        if (tab === "alerts") refreshAlerts();
        if (tab === "rules") refreshRules();
        if (tab === "quiz") refreshQuiz();
      });
    });
  }

  function drawChart(history) {
    const canvas = document.getElementById("bwChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 900;
    const h = 72;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pts = Array.isArray(history) ? history : [];
    if (pts.length < 2) return;
    let max = 1;
    pts.forEach((p) => {
      max = Math.max(max, Number(p.bps_up) || 0, Number(p.bps_down) || 0);
    });
    function path(key, color) {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = (i / (pts.length - 1)) * (w - 2) + 1;
        const y = h - 4 - ((Number(p[key]) || 0) / max) * (h - 10);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    path("bps_down", "#5a9e72");
    path(
      "bps_up",
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e03545"
    );
  }

  function renderLive(snap) {
    lastSnap = snap;
    const nic = (snap && snap.nic) || {};
    const stats = (snap && snap.stats) || {};
    document.getElementById("statDown").textContent = fmtBps(nic.bps_down);
    document.getElementById("statUp").textContent = fmtBps(nic.bps_up);
    document.getElementById("statConn").textContent = String(stats.flow_count || stats.connection_count || 0);
    const qcount = (snap.questions || []).length || (snap.trust_status && snap.trust_status.queue_count) || 0;
    document.getElementById("statQuiz").textContent = String(qcount);

    const auto = document.getElementById("chkAuto").checked;
    document.getElementById("liveMeta").textContent =
      (auto ? t("monitoring") : t("paused")) +
      " · out " +
      (stats.outbound_count || 0) +
      " · listen " +
      (stats.listen_count || 0);
    const rm = snap.rate_meta || nic.rate_meta || {};
    document.getElementById("rateSource").textContent = rm.label ? "· " + rm.label : "";
    drawChart(snap.history || []);

    const q = (document.getElementById("filterLive").value || "").trim().toLowerCase();
    let flows = Array.isArray(snap.flows) ? snap.flows : snap.connections || [];
    if (liveFilter === "outbound") flows = flows.filter((r) => r.outbound);
    if (liveFilter === "listen") flows = flows.filter((r) => r.listening);
    if (liveFilter === "loose") flows = flows.filter((r) => r.loose);
    if (liveFilter === "alerted") flows = flows.filter((r) => alertedPids.has(Number(r.pid) || 0));
    if (q) {
      flows = flows.filter((r) =>
        [r.name, r.path, r.laddr, r.raddr, r.proto, r.status, r.hostname, r.country]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    const body = document.getElementById("liveBody");
    if (!flows.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7">${esc(t("emptyLive"))}</td></tr>`;
    } else {
      body.innerHTML = flows
        .slice(0, 400)
        .map((r) => {
          const rate = fmtBps((Number(r.bps_up) || 0) + (Number(r.bps_down) || 0));
          const cls = [r.outbound ? "row-outbound" : "", r.loose ? "row-loose" : ""].filter(Boolean).join(" ");
          const host = r.hostname ? ` · ${r.hostname}` : "";
          const cc = r.country || "";
          return `<tr class="${cls}" data-pid="${esc(r.pid)}" data-path="${esc(r.path)}" data-name="${esc(
            r.name
          )}" data-remote="${esc(r.raddr)}" data-ip="${esc(r.remote_ip)}">
            <td class="name-cell">${esc(r.name || "PID " + r.pid)}<div class="mono path">${esc(r.path || "")}</div></td>
            <td>${esc(r.proto || "")}</td>
            <td class="mono">${esc(r.laddr || "")}</td>
            <td class="mono">${esc(r.raddr || "")}${esc(host)}</td>
            <td class="mono">${esc(cc)}</td>
            <td>${esc(r.status || "")}</td>
            <td class="mono">${esc(rate)}</td>
          </tr>`;
        })
        .join("");
      body.querySelectorAll("tr[data-pid]").forEach((tr) => {
        tr.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          ctxRow = {
            pid: Number(tr.getAttribute("data-pid") || 0),
            path: tr.getAttribute("data-path") || "",
            name: tr.getAttribute("data-name") || "",
            remote: tr.getAttribute("data-remote") || "",
            ip: tr.getAttribute("data-ip") || "",
          };
          const menu = document.getElementById("ctxMenu");
          menu.hidden = false;
          menu.style.left = e.pageX + "px";
          menu.style.top = e.pageY + "px";
        });
      });
    }

    document.getElementById("topsList").innerHTML = (snap.tops || [])
      .slice(0, 10)
      .map(
        (p) =>
          `<li><strong>${esc(p.name || "PID " + p.pid)}</strong>↓ ${esc(fmtBps(p.bps_down))} · ↑ ${esc(
            fmtBps(p.bps_up)
          )}</li>`
      )
      .join("");
    document.getElementById("dnsList").innerHTML = (snap.dns_recent || [])
      .slice(0, 12)
      .map((d) => `<li class="mono">${esc(d.query)} → ${esc(d.result || "")}</li>`)
      .join("");
  }

  async function refreshQuiz() {
    if (!api) return;
    const res = await api.list_questions();
    const feed = document.getElementById("quizFeed");
    const items = (res && res.questions) || [];
    const learning = !!(res && res.learning);
    const remaining = Math.max(0, Math.floor(Number(res && res.remaining_s) || 0));
    document.getElementById("statQuiz").textContent = String(items.length);
    const banner = document.getElementById("learnBanner");
    const meta = document.getElementById("quizMeta");
    if (banner) {
      banner.hidden = !learning;
      if (learning) {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        banner.textContent =
          lang === "en"
            ? `Learning active — ${m}m ${s}s left · ${items.length} pending`
            : `Apprentissage actif — ${m} min ${s}s restantes · ${items.length} en file`;
      }
    }
    if (meta) {
      meta.textContent = learning
        ? banner
          ? banner.textContent
          : t("quizSub")
        : t("quizSub");
    }
    const learnBtn = document.getElementById("btnLearn");
    if (learnBtn) learnBtn.disabled = learning;
    if (!items.length) {
      feed.innerHTML = `<div class="alert-card"><div></div><div><p>${esc(t("emptyQuiz"))}</p></div><div></div></div>`;
      return;
    }
    feed.innerHTML = items
      .map((q) => {
        const rep = q.reputation;
        const repLine = rep
          ? `Réputation: ${esc(rep.verdict || "unknown")}`
          : "";
        return `<article class="alert-card quiz-card">
          <span class="sev ${esc(q.severity || "info")}">${esc(q.kind || "")}</span>
          <div>
            <h4>${esc(q.name || q.hostname || q.remote || "?")}</h4>
            <p>${esc(q.detail || "")}</p>
            <p class="mono">${esc(q.path || "")}</p>
            <p class="hint">${repLine}</p>
          </div>
          <div class="alert-meta quiz-actions">
            <button type="button" class="btn accent" data-qid="${esc(q.id)}" data-act="trust">${esc(t("trustBtn"))}</button>
            <button type="button" class="btn" data-qid="${esc(q.id)}" data-act="ignore">${esc(t("ignoreBtn"))}</button>
            <button type="button" class="btn ghost" data-qid="${esc(q.id)}" data-act="propose_block">${esc(t("blockBtn"))}</button>
          </div>
        </article>`;
      })
      .join("");
    feed.querySelectorAll("button[data-qid]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-qid");
        const act = btn.getAttribute("data-act");
        const res = await api.answer_question(id, act);
        if (res && res.needs_confirm_block && res.block_hint) {
          const hint = res.block_hint;
          const ip = (hint.remote || "").split(":").slice(0, -1).join(":") || hint.remote;
          askConfirm(
            "Bloquer cette IP en sortie (pare-feu) ?",
            hint.remote || ip,
            async () => {
              await api.block_remote(ip || hint.remote, 0, true);
              refreshQuiz();
            }
          );
        } else {
          refreshQuiz();
        }
      });
    });
  }

  async function refreshAlerts() {
    if (!api) return;
    const res = await api.list_alerts(120);
    mutedRules = new Set((res && res.muted_rules) || []);
    if (res && typeof res.toasts_enabled === "boolean") {
      document.getElementById("chkToasts").checked = res.toasts_enabled;
    }
    const alerts = (res && res.alerts) || [];
    alertedPids = new Set(alerts.map((a) => Number(a.pid) || 0).filter(Boolean));
    document.getElementById("statAlerts").textContent = String(res.count || alerts.length || 0);
    const feed = document.getElementById("alertsFeed");
    if (!alerts.length) {
      feed.innerHTML = `<div class="alert-card"><div></div><div><p>${esc(t("emptyAlerts"))}</p></div><div></div></div>`;
      return;
    }
    feed.innerHTML = alerts
      .map((a) => {
        const label = lang === "en" ? a.label_en || a.rule : a.label_fr || a.rule;
        const when = a.ts ? new Date(a.ts * 1000).toLocaleTimeString() : "";
        return `<article class="alert-card">
          <span class="sev ${esc(a.severity || "info")}">${esc(a.severity || "info")}</span>
          <div>
            <h4>${esc(label)}</h4>
            <p>${esc(a.detail || "")}</p>
            <p class="mono">${esc(a.name || "")} ${esc(a.remote || "")}</p>
            <div class="toolbar">
              <button type="button" class="btn ghost btn-a" data-pid="${esc(a.pid)}" data-path="${esc(a.path)}" data-act="folder">Dossier</button>
              <button type="button" class="btn ghost btn-a" data-pid="${esc(a.pid)}" data-act="kill">Kill…</button>
              <button type="button" class="btn ghost btn-a" data-remote="${esc(a.remote)}" data-act="block">Block…</button>
            </div>
          </div>
          <div class="alert-meta">${esc(when)}</div>
        </article>`;
      })
      .join("");
    feed.querySelectorAll(".btn-a").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.getAttribute("data-act"), btn));
    });
  }

  function askConfirm(title, body, fn) {
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmBody").textContent = body;
    document.getElementById("confirmModal").hidden = false;
    confirmAction = fn;
  }

  async function handleAction(act, el) {
    const pid = Number(el.getAttribute("data-pid") || 0);
    const path = el.getAttribute("data-path") || "";
    const remote = el.getAttribute("data-remote") || "";
    if (act === "folder") await api.open_process_folder(pid, path);
    if (act === "kill") {
      askConfirm("Terminer le processus ?", "PID " + pid, async () => {
        await api.kill_process(pid, true);
      });
    }
    if (act === "block") {
      const ip = remote.includes(":") ? remote.split(":").slice(0, -1).join(":") : remote;
      askConfirm("Bloquer l’IP en sortie (pare-feu) ?", remote, async () => {
        await api.block_remote(ip || remote, 0, true);
      });
    }
  }

  async function refreshRules() {
    if (!api) return;
    const res = await api.get_rules();
    rulesCache = (res && res.rules) || {};
    const settings = await api.get_alert_settings();
    mutedRules = new Set((settings && settings.muted_rules) || []);
    document.getElementById("rulesList").innerHTML = Object.keys(rulesCache)
      .map((id) => {
        const r = rulesCache[id];
        const label = lang === "en" ? r.label_en || id : r.label_fr || id;
        return `<div class="rule-row" data-rule="${esc(id)}">
          <input type="checkbox" class="rule-en" ${r.enabled !== false ? "checked" : ""} />
          <div><div class="label">${esc(label)}</div><div class="id">${esc(id)}</div></div>
          <label class="check"><input type="checkbox" class="rule-mute" ${
            mutedRules.has(id) ? "checked" : ""
          }/> ${esc(t("mute"))}</label>
          <span class="sev ${esc(r.severity || "info")}">${esc(r.severity || "")}</span>
        </div>`;
      })
      .join("");
    const spike = rulesCache.bandwidth_spike || {};
    const fan = rulesCache.dest_fanout || {};
    document.getElementById("thrBps").value = spike.threshold_bps || 8000000;
    document.getElementById("thrFactor").value = spike.baseline_factor || 4;
    document.getElementById("thrFanout").value = fan.threshold || 25;
    const bl = await api.get_blocklist();
    document.getElementById("blocklistText").value = ((bl && bl.items) || []).join("\n");
    const trust = await api.list_trust();
    document.getElementById("trustList").innerHTML = ((trust && trust.entries) || [])
      .map(
        (e) =>
          `<li>${esc(e.name || "")} <span class="mono">${esc(e.path || "")}</span>
          <button type="button" class="btn ghost btn-rm-trust" data-path="${esc(e.path)}" data-name="${esc(
            e.name
          )}">×</button></li>`
      )
      .join("");
    document.querySelectorAll(".btn-rm-trust").forEach((b) => {
      b.addEventListener("click", async () => {
        await api.remove_trust(b.getAttribute("data-path"), b.getAttribute("data-name"));
        refreshRules();
      });
    });
    const rep = await api.get_reputation_settings();
    document.getElementById("chkRep").checked = !!(rep && rep.enabled);
    const geo = await api.geo_status();
    document.getElementById("geoHint").textContent = geo.available
      ? "GeoIP MMDB: OK"
      : geo.hint || "GeoIP: placez GeoLite2-Country.mmdb dans le dossier données";
    const cap = await api.capture_status();
    document.getElementById("capHint").textContent = cap.npcap
      ? "Npcap: OK" + (cap.scapy ? " · scapy OK" : " · pip install scapy")
      : "Npcap manquant — capture désactivée";
    const st = await api.get_startup();
    document.getElementById("chkStartup").checked = !!(st && st.enabled);
  }

  async function tick() {
    if (!api) return;
    try {
      const snap = await api.get_snapshot();
      if (snap && snap.ok !== false) {
        renderLive(snap);
        const qcount = (snap.questions || []).length || (snap.trust_status && snap.trust_status.queue_count) || 0;
        document.getElementById("statQuiz").textContent = String(qcount);
        // Keep quiz panel live while learning / when that tab is active
        const quizActive = document.querySelector('.hub-panel[data-panel="quiz"]')?.classList.contains("active");
        const learning = !!(snap.trust_status && snap.trust_status.learning);
        if (quizActive || learning) {
          refreshQuiz();
        }
      }
    } catch (e) {
      document.getElementById("liveMeta").textContent = String(e);
    }
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = null;
    if (document.getElementById("chkAuto").checked) timer = setInterval(tick, 1000);
  }

  async function boot() {
    api = await waitApi();
    const bootApi = window.MrAurevoXSuite;
    if (bootApi) {
      if (typeof bootApi.applyAtelierTheme === "function") {
        await bootApi.applyAtelierTheme(api);
      }
      const settings = await bootApi.loadSuiteSettings(api);
      lang = (settings && settings.language) || "fr";
      bootApi.applyI18n(lang, I18N);
    }
    setupTabs();

    document.getElementById("filterChips").addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      liveFilter = btn.getAttribute("data-filter") || "all";
      document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
      if (lastSnap) renderLive(lastSnap);
    });

    document.getElementById("btnRefresh").addEventListener("click", tick);
    document.getElementById("filterLive").addEventListener("input", () => lastSnap && renderLive(lastSnap));
    document.getElementById("chkAuto").addEventListener("change", async (e) => {
      if (e.target.checked) {
        await api.start_monitor(1.0);
        schedule();
        tick();
      } else {
        await api.stop_monitor();
        schedule();
      }
    });
    document.getElementById("btnOpenNetMap").addEventListener("click", () => api.open_suite_app("NetMap"));
    document.getElementById("btnExportJson").addEventListener("click", () => api.export_snapshot("json"));
    document.getElementById("btnExportCsv").addEventListener("click", () => api.export_snapshot("csv"));
    document.getElementById("btnExportAlerts").addEventListener("click", () => api.export_alerts("json"));
    document.getElementById("chkToasts").addEventListener("change", (e) => api.set_toasts(!!e.target.checked));
    document.getElementById("btnClearAlerts").addEventListener("click", async () => {
      await api.clear_alerts();
      refreshAlerts();
    });
    document.getElementById("btnLearn").addEventListener("click", async () => {
      const res = await api.start_learn(10);
      // Switch to quiz tab so user sees the seeded queue
      document.querySelector('.hub-tab[data-tab="quiz"]')?.click();
      await refreshQuiz();
      if (res && res.ok && (res.seeded || 0) === 0 && (res.queue_count || 0) === 0) {
        const meta = document.getElementById("quizMeta");
        if (meta) {
          meta.textContent =
            lang === "en"
              ? "Learning started — waiting for outbound traffic…"
              : "Apprentissage démarré — en attente de trafic sortant…";
        }
      }
    });
    document.getElementById("btnStopLearn").addEventListener("click", async () => {
      await api.stop_learn();
      await refreshQuiz();
    });
    document.getElementById("btnSaveRules").addEventListener("click", async () => {
      const patch = {};
      document.querySelectorAll(".rule-row").forEach((row) => {
        const id = row.getAttribute("data-rule");
        patch[id] = { enabled: row.querySelector(".rule-en").checked };
        api.mute_rule(id, row.querySelector(".rule-mute").checked);
      });
      patch.bandwidth_spike = {
        ...(rulesCache.bandwidth_spike || {}),
        enabled: patch.bandwidth_spike?.enabled ?? rulesCache.bandwidth_spike?.enabled !== false,
        threshold_bps: Number(document.getElementById("thrBps").value) || 8000000,
        baseline_factor: Number(document.getElementById("thrFactor").value) || 4,
      };
      patch.dest_fanout = {
        ...(rulesCache.dest_fanout || {}),
        enabled: patch.dest_fanout?.enabled ?? rulesCache.dest_fanout?.enabled !== false,
        threshold: Number(document.getElementById("thrFanout").value) || 25,
      };
      const ports = (document.getElementById("thrPorts").value || "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => n > 0);
      if (ports.length) {
        patch.rare_port = { ...(rulesCache.rare_port || {}), common_ports: ports };
      }
      // merge enabled from rows
      Object.keys(patch).forEach((id) => {
        if (rulesCache[id] && patch[id].enabled === undefined && document.querySelector(`.rule-row[data-rule="${id}"]`)) {
          /* already set */
        }
      });
      document.querySelectorAll(".rule-row").forEach((row) => {
        const id = row.getAttribute("data-rule");
        patch[id] = { ...(patch[id] || {}), enabled: row.querySelector(".rule-en").checked };
      });
      await api.save_rules(patch);
      refreshRules();
    });
    document.getElementById("btnSaveBlocklist").addEventListener("click", async () => {
      const lines = document
        .getElementById("blocklistText")
        .value.split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      await api.set_blocklist(lines);
    });
    document.getElementById("btnOpenData").addEventListener("click", () => api.open_data_dir());
    document.getElementById("btnSaveRep").addEventListener("click", async () => {
      await api.set_reputation_enabled(document.getElementById("chkRep").checked);
      const key = document.getElementById("abuseKey").value;
      if (key) await api.set_abuseipdb_key(key);
    });
    document.getElementById("btnSaveStartup").addEventListener("click", async () => {
      await api.set_startup(document.getElementById("chkStartup").checked);
    });

    document.getElementById("confirmOk").addEventListener("click", async () => {
      document.getElementById("confirmModal").hidden = true;
      if (confirmAction) await confirmAction();
      confirmAction = null;
    });
    document.getElementById("confirmCancel").addEventListener("click", () => {
      document.getElementById("confirmModal").hidden = true;
      confirmAction = null;
    });

    function hideCtxMenu() {
      const menu = document.getElementById("ctxMenu");
      if (menu) menu.hidden = true;
    }
    document.addEventListener("click", hideCtxMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideCtxMenu();
    });
    document.getElementById("ctxMenu").addEventListener("click", async (e) => {
      e.stopPropagation();
      const btn = e.target.closest("button[data-act]");
      if (!btn || !ctxRow) return;
      const act = btn.getAttribute("data-act");
      hideCtxMenu();
      if (act === "trust") await api.add_trust(ctxRow.path, ctxRow.name);
      if (act === "folder") await api.open_process_folder(ctxRow.pid, ctxRow.path);
      if (act === "kill") {
        askConfirm("Terminer le processus ?", ctxRow.name + " PID " + ctxRow.pid, async () => {
          await api.kill_process(ctxRow.pid, true);
        });
      }
      if (act === "block") {
        askConfirm("Bloquer l’IP en sortie ?", ctxRow.remote, async () => {
          await api.block_remote(ctxRow.ip || ctxRow.remote, 0, true);
        });
      }
      if (act === "rep") {
        const r = await api.lookup_reputation(ctxRow.ip || ctxRow.remote);
        alert("Verdict: " + (r.verdict || "?") + "\n" + JSON.stringify(r.links || {}, null, 0));
      }
      if (act === "pcap") {
        const r = await api.capture_for_ip(ctxRow.ip || "", 8);
        alert(r.ok ? "PCAP: " + r.path : "Erreur: " + (r.error || ""));
      }
    });

    if (api) {
      await api.start_monitor(1.0);
      const settings = await api.get_alert_settings();
      if (settings && typeof settings.toasts_enabled === "boolean") {
        document.getElementById("chkToasts").checked = settings.toasts_enabled;
      }
    }
    schedule();
    await tick();
    await refreshAlerts();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
