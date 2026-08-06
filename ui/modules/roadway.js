/**
 * RoadWay-X — native in-hub (no iframe).
 * Bridge: pywebview.api.roadway.*
 * Segments: Trafic | Alertes | DNS | Confiance
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

export async function mount(root) {
  const { body, setStatus, askConfirm } = mountModuleShell(root, {
    title: "RoadWay-X",
    subtitle: "Trafic live · alertes · confiance · DNS",
    segments: [
      { id: "traffic", label: "Trafic" },
      { id: "alerts",  label: "Alertes" },
      { id: "dns",     label: "DNS" },
      { id: "trust",   label: "Confiance" },
    ],
    onSegment,
  });

  const api = await waitNs("roadway", "get_snapshot");
  let pollTimer = null;

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ─── TRAFIC ──────────────────────────────────────────────────────────────────

  async function buildTraffic() {
    stopPoll();
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwStart">▶ Démarrer</button>
          <button type="button" class="btn" id="rwStop" disabled>■ Arrêter</button>
          <span class="meta" id="rwMonMeta" style="margin-left:6px"></span>
          <div style="flex:1"></div>
          <button type="button" class="btn ghost" id="rwSnap">Snapshot</button>
        </div>
        <div class="card-grid" id="rwRateCards" style="margin-top:8px"></div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="rwFlowsEmpty">Démarrer le moniteur ou prendre un snapshot pour afficher les flux réseau.</div>
        <div class="table-wrap" id="rwFlowsWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>Proto</th>
              <th>Adresse locale</th>
              <th>Adresse distante</th>
              <th>PID</th>
              <th>Processus</th>
              <th>Pays</th>
              <th>↑ B/s</th>
              <th>↓ B/s</th>
              <th>Actions</th>
            </tr></thead>
            <tbody id="rwFlowsBody"></tbody>
          </table>
        </div>
      </div>`;

    const startBtn   = body.querySelector("#rwStart");
    const stopBtn    = body.querySelector("#rwStop");
    const monMeta    = body.querySelector("#rwMonMeta");
    const rateCards  = body.querySelector("#rwRateCards");
    const flowsEmpty = body.querySelector("#rwFlowsEmpty");
    const flowsWrap  = body.querySelector("#rwFlowsWrap");
    const flowsBody  = body.querySelector("#rwFlowsBody");

    function renderSnapshot(snap) {
      const flows = Array.isArray(snap?.flows)
        ? snap.flows
        : (Array.isArray(snap?.connections) ? snap.connections : []);
      if (!flows.length) { flowsEmpty.hidden = false; flowsWrap.hidden = true; return; }
      flowsEmpty.hidden = true; flowsWrap.hidden = false;
      flowsBody.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (const f of flows) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td>${esc(f.proto || "")}</td>` +
          `<td class="meta">${esc(f.laddr || "")}</td>` +
          `<td class="meta">${esc(f.raddr || "")}</td>` +
          `<td>${esc(f.pid || "")}</td>` +
          `<td title="${esc(f.path || "")}">${esc(f.name || "—")}</td>` +
          `<td>${esc(f.country || "")}</td>` +
          `<td>${f.bps_up != null ? f.bps_up : "—"}</td>` +
          `<td>${f.bps_down != null ? f.bps_down : "—"}</td>` +
          `<td>` +
          `<button type="button" class="action-btn danger" data-action="kill" data-pid="${esc(String(f.pid || 0))}"` +
          ` ${!f.pid ? "disabled" : ""} title="Terminer le processus">Kill</button>` +
          `<button type="button" class="action-btn" data-action="block" data-raddr="${esc(f.raddr || "")}"` +
          ` ${!f.raddr ? "disabled" : ""} title="Bloquer cette adresse distante">Bloquer</button>` +
          `</td>`;
        frag.appendChild(tr);
      }
      flowsBody.appendChild(frag);

      const rm = snap?.rate_meta || {};
      const up = rm.total_bps_up   != null ? Math.round(rm.total_bps_up   / 1024) + " KB/s ↑" : null;
      const dn = rm.total_bps_down != null ? Math.round(rm.total_bps_down / 1024) + " KB/s ↓" : null;
      if (up || dn) {
        rateCards.innerHTML =
          `<div class="card"><span class="label">Débit montant</span><span class="value">${esc(up || "—")}</span></div>` +
          `<div class="card"><span class="label">Débit descendant</span><span class="value">${esc(dn || "—")}</span></div>` +
          `<div class="card"><span class="label">Flux actifs</span><span class="value">${flows.length}</span></div>`;
      }
    }

    flowsBody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || btn.disabled || !api) return;
      if (btn.dataset.action === "kill") {
        const pid = parseInt(btn.dataset.pid) || 0;
        if (!pid) return;
        const ok = await askConfirm(`Terminer le processus PID ${pid} ?`, "Terminer un processus");
        if (!ok) return;
        setStatus("Terminaison processus…");
        try {
          const prep = await api.prepare_action("kill_process", { pid });
          if (!prep?.ok || !prep.token) { setStatus("Erreur préparation.", "error"); return; }
          const res = await api.kill_process(pid, prep.token, true);
          if (res?.ok) setStatus(`Processus PID ${pid} terminé.`, "ok");
          else setStatus("Erreur : " + (res?.error || "?"), "error");
        } catch (err) { setStatus("Erreur : " + String(err), "error"); }
      } else if (btn.dataset.action === "block") {
        const rawAddr = btn.dataset.raddr || "";
        const lastColon = rawAddr.lastIndexOf(":");
        const ip   = lastColon > 0 ? rawAddr.slice(0, lastColon) : rawAddr;
        const port = lastColon > 0 ? parseInt(rawAddr.slice(lastColon + 1)) || 0 : 0;
        if (!ip) return;
        const ok = await askConfirm(
          `Créer une règle pare-feu pour bloquer le trafic sortant vers ${ip}${port ? ":" + port : ""} ?`,
          "Bloquer une adresse distante"
        );
        if (!ok) return;
        setStatus("Blocage en cours…");
        try {
          const prep = await api.prepare_action("block_remote", { ip, port });
          if (!prep?.ok || !prep.token) { setStatus("Erreur préparation.", "error"); return; }
          const res = await api.block_remote(ip, port, prep.token, true, "");
          if (res?.ok) setStatus(`${ip} bloqué.`, "ok");
          else setStatus("Erreur : " + (res?.error || "?"), "error");
        } catch (err) { setStatus("Erreur : " + String(err), "error"); }
      }
    });

    async function startMonitor() {
      if (!api?.start_monitor) return;
      const res = await api.start_monitor(1.0);
      if (res?.ok) {
        monMeta.textContent = "Moniteur actif";
        startBtn.disabled = true; stopBtn.disabled = false;
        setStatus("");
        pollTimer = setInterval(async () => {
          try { renderSnapshot(await api.get_snapshot()); } catch (_) {}
        }, 1500);
        try { renderSnapshot(await api.get_snapshot()); } catch (_) {}
      }
    }

    startBtn.addEventListener("click", startMonitor);

    stopBtn.addEventListener("click", async () => {
      stopPoll();
      if (api?.stop_monitor) await api.stop_monitor();
      monMeta.textContent = "Moniteur arrêté";
      startBtn.disabled = false; stopBtn.disabled = true;
      setStatus("Moniteur arrêté.");
    });

    body.querySelector("#rwSnap").addEventListener("click", async () => {
      if (!api?.get_snapshot) return;
      setStatus("Récupération du snapshot…");
      try { renderSnapshot(await api.get_snapshot()); setStatus(""); }
      catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    // If monitor was already running, resume live display
    if (api?.get_monitor_status) {
      try {
        const st = await api.get_monitor_status();
        if (st?.monitoring) {
          monMeta.textContent = "Moniteur actif";
          startBtn.disabled = true; stopBtn.disabled = false;
          pollTimer = setInterval(async () => {
            try { renderSnapshot(await api.get_snapshot()); } catch (_) {}
          }, 1500);
          try { renderSnapshot(await api.get_snapshot()); } catch (_) {}
        }
      } catch (_) {}
    }
  }

  // ─── ALERTES ─────────────────────────────────────────────────────────────────

  async function buildAlerts() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwAlertRefresh">Actualiser</button>
          <button type="button" class="btn danger" id="rwAlertClear">Effacer toutes les alertes</button>
          <p class="meta" id="rwAlertMeta" style="margin:0"></p>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="rwAlertEmpty">Chargement des alertes…</div>
        <div class="table-wrap" id="rwAlertWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>Heure</th>
              <th>Sévérité</th>
              <th>Règle</th>
              <th>Détail</th>
              <th>PID / Processus</th>
            </tr></thead>
            <tbody id="rwAlertBody"></tbody>
          </table>
        </div>
      </div>`;

    body.querySelector("#rwAlertRefresh").addEventListener("click", loadAlerts);
    body.querySelector("#rwAlertClear").addEventListener("click", async () => {
      const ok = await askConfirm("Effacer toutes les alertes RoadWay-X ?", "Effacer les alertes");
      if (!ok) return;
      if (api?.clear_alerts) await api.clear_alerts();
      await loadAlerts();
      setStatus("Alertes effacées.", "ok");
    });

    async function loadAlerts() {
      const emptyEl = body.querySelector("#rwAlertEmpty");
      const wrapEl  = body.querySelector("#rwAlertWrap");
      const bodyEl  = body.querySelector("#rwAlertBody");
      const metaEl  = body.querySelector("#rwAlertMeta");
      if (!api?.list_alerts) { emptyEl.textContent = "API roadway indisponible."; return; }
      setStatus("Chargement alertes…");
      emptyEl.hidden = false; wrapEl.hidden = true; emptyEl.textContent = "Chargement…";
      try {
        const res = await api.list_alerts(100);
        const alerts = Array.isArray(res?.alerts) ? res.alerts : [];
        if (!alerts.length) { emptyEl.textContent = "Aucune alerte enregistrée."; setStatus(""); return; }
        emptyEl.hidden = true; wrapEl.hidden = false;
        metaEl.textContent = `${alerts.length} alerte(s)`;
        bodyEl.innerHTML = "";
        const frag = document.createDocumentFragment();
        for (const a of alerts) {
          const tr = document.createElement("tr");
          const ts  = a.ts ? new Date(a.ts * 1000).toLocaleTimeString("fr-FR") : "—";
          const sev = (a.severity || "").toLowerCase();
          const col = sev === "high" ? "#ff8a95" : sev === "medium" ? "var(--warn,#f0a33a)" : "var(--muted)";
          tr.innerHTML =
            `<td class="meta">${esc(ts)}</td>` +
            `<td style="color:${col};font-weight:600">${esc(a.severity || "")}</td>` +
            `<td>${esc(a.rule || "")}</td>` +
            `<td class="wrap">${esc(a.detail || "")}</td>` +
            `<td title="${esc(a.path || "")}">${esc(a.pid ? String(a.pid) : "")} ${esc(a.name || "")}</td>`;
          frag.appendChild(tr);
        }
        bodyEl.appendChild(frag);
        setStatus("");
      } catch (err) { emptyEl.textContent = String(err); setStatus("Erreur : " + String(err), "error"); }
    }

    await loadAlerts();
  }

  // ─── DNS ─────────────────────────────────────────────────────────────────────

  async function buildDns() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwDnsLoad">Charger</button>
          <button type="button" class="btn" id="rwDnsRefresh">Rafraîchir cache</button>
          <p class="meta" id="rwDnsMeta" style="margin:0"></p>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="rwDnsEmpty">Cliquer Charger pour afficher les entrées DNS récentes.</div>
        <div class="table-wrap" id="rwDnsWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>Requête</th>
              <th>Résultat</th>
              <th>Type</th>
            </tr></thead>
            <tbody id="rwDnsBody"></tbody>
          </table>
        </div>
      </div>`;

    body.querySelector("#rwDnsLoad").addEventListener("click", loadDns);
    body.querySelector("#rwDnsRefresh").addEventListener("click", async () => {
      if (!api?.refresh_dns) return;
      setStatus("Rafraîchissement cache DNS…");
      try { await api.refresh_dns(); await loadDns(); }
      catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    async function loadDns() {
      const emptyEl = body.querySelector("#rwDnsEmpty");
      const wrapEl  = body.querySelector("#rwDnsWrap");
      const bodyEl  = body.querySelector("#rwDnsBody");
      const metaEl  = body.querySelector("#rwDnsMeta");
      if (!api?.list_dns) { emptyEl.textContent = "API roadway indisponible."; return; }
      setStatus("Chargement DNS…");
      emptyEl.hidden = false; wrapEl.hidden = true; emptyEl.textContent = "Chargement…";
      try {
        const res = await api.list_dns(60);
        const items = Array.isArray(res?.items) ? res.items : [];
        if (!items.length) { emptyEl.textContent = "Aucune entrée DNS récente."; setStatus(""); return; }
        emptyEl.hidden = true; wrapEl.hidden = false;
        metaEl.textContent = `${items.length} entrée(s)`;
        bodyEl.innerHTML = items.map(d =>
          `<tr>
            <td class="meta">${esc(d.query || d.name || "")}</td>
            <td class="meta">${esc(Array.isArray(d.answers) ? d.answers.join(", ") : (d.result || ""))}</td>
            <td>${esc(d.type || "")}</td>
          </tr>`
        ).join("");
        setStatus("");
      } catch (err) { emptyEl.textContent = String(err); setStatus("Erreur : " + String(err), "error"); }
    }
  }

  // ─── CONFIANCE ───────────────────────────────────────────────────────────────

  async function buildTrust() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwLearnStart">Apprentissage 10 min</button>
          <button type="button" class="btn ghost" id="rwLearnStop">Arrêter</button>
          <button type="button" class="btn" id="rwTrustRefresh">Actualiser</button>
          <span class="meta" id="rwTrustStatus" style="min-width:140px"></span>
        </div>
      </div>
      <div id="rwQuestionsWrap" style="display:none"></div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="rwTrustEmpty">Chargement…</div>
        <div class="table-wrap" id="rwTrustWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>Processus</th>
              <th>Chemin</th>
              <th>Action</th>
            </tr></thead>
            <tbody id="rwTrustBody"></tbody>
          </table>
        </div>
      </div>`;

    body.querySelector("#rwTrustRefresh").addEventListener("click", loadTrust);

    body.querySelector("#rwLearnStart").addEventListener("click", async () => {
      if (!api?.start_learn) return;
      setStatus("Démarrage apprentissage…");
      try {
        const res = await api.start_learn(10.0);
        if (res?.ok) { setStatus("Apprentissage démarré (10 min).", "ok"); await loadTrust(); }
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    body.querySelector("#rwLearnStop").addEventListener("click", async () => {
      if (!api?.stop_learn) return;
      await api.stop_learn().catch(() => {});
      setStatus("Apprentissage arrêté.", "ok");
      await loadTrust();
    });

    async function loadTrust() {
      const emptyEl   = body.querySelector("#rwTrustEmpty");
      const wrapEl    = body.querySelector("#rwTrustWrap");
      const bodyEl    = body.querySelector("#rwTrustBody");
      const statusEl  = body.querySelector("#rwTrustStatus");
      const questWrap = body.querySelector("#rwQuestionsWrap");
      if (!api?.list_trust) { emptyEl.textContent = "API roadway indisponible."; return; }
      setStatus("Chargement confiance…");
      emptyEl.hidden = false; wrapEl.hidden = true; emptyEl.textContent = "Chargement…";
      try {
        const [stRes, trustRes, questRes] = await Promise.all([
          api.trust_status().catch(() => ({})),
          api.list_trust().catch(() => ({ ok: false, items: [] })),
          api.list_questions().catch(() => ({ questions: [] })),
        ]);

        const st = stRes || {};
        statusEl.textContent = st.mode
          ? `Mode : ${st.mode} · ${st.queue_count ?? 0} en file`
          : "";

        const questions = Array.isArray(questRes?.questions) ? questRes.questions : [];
        if (questions.length) {
          questWrap.style.display = "";
          questWrap.innerHTML = `
            <div class="panel" style="flex-shrink:0">
              <h3 style="font-size:.8rem;color:var(--muted);margin-bottom:8px">${questions.length} question(s) en attente</h3>
              ${questions.slice(0, 6).map(q => `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:.82rem">
                  <span style="flex:1;color:var(--muted)">${esc(q.hostname || q.remote || q.id || "")} — <em>${esc(q.kind || "")}</em></span>
                  <button class="action-btn" data-qid="${esc(q.id)}" data-qa="trust">Confiance</button>
                  <button class="action-btn" data-qid="${esc(q.id)}" data-qa="ignore">Ignorer</button>
                  <button class="action-btn danger" data-qid="${esc(q.id)}" data-qa="propose_block">Bloquer</button>
                </div>`).join("")}
            </div>`;
          questWrap.addEventListener("click", async (e) => {
            const btn = e.target.closest("[data-qid]");
            if (!btn || !api?.answer_question) return;
            try {
              await api.answer_question(btn.dataset.qid, btn.dataset.qa);
              await loadTrust();
            } catch (_) {}
          });
        } else {
          questWrap.style.display = "none";
        }

        const trusted = Array.isArray(trustRes?.items) ? trustRes.items : [];
        if (!trusted.length) { emptyEl.textContent = "Aucune entrée de confiance."; setStatus(""); return; }
        emptyEl.hidden = true; wrapEl.hidden = false;
        bodyEl.innerHTML = trusted.map(t =>
          `<tr>
            <td>${esc(t.name || "")}</td>
            <td class="meta wrap">${esc(t.path || "")}</td>
            <td><button class="action-btn danger" data-remove-path="${esc(t.path || "")}" data-remove-name="${esc(t.name || "")}">Retirer</button></td>
          </tr>`
        ).join("");

        bodyEl.querySelectorAll("[data-remove-path]").forEach(btn => {
          btn.addEventListener("click", async () => {
            if (!api?.remove_trust) return;
            await api.remove_trust(btn.dataset.removePath, btn.dataset.removeName).catch(() => {});
            await loadTrust();
          });
        });

        setStatus("");
      } catch (err) { emptyEl.textContent = String(err); setStatus("Erreur : " + String(err), "error"); }
    }

    await loadTrust();
  }

  // ─── SEGMENT ROUTER ──────────────────────────────────────────────────────────

  async function onSegment(seg) {
    stopPoll();
    setStatus("");
    if      (seg === "traffic") await buildTraffic();
    else if (seg === "alerts")  await buildAlerts();
    else if (seg === "dns")     await buildDns();
    else if (seg === "trust")   await buildTrust();
  }
}
