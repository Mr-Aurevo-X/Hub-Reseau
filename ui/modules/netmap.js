/**
 * NetMap — native in-hub (no iframe).
 * Bridge: pywebview.api.netmap.*
 * Segments: Connexions | Outils réseau | Proxy | Partages
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

export async function mount(root) {
  const { body, setStatus, askConfirm } = mountModuleShell(root, {
    title: "NetMap",
    subtitle: "Connexions TCP/UDP · ping · proxy · partages",
    segments: [
      { id: "connections", label: "Connexions" },
      { id: "tools",       label: "Outils réseau" },
      { id: "proxy",       label: "Proxy" },
      { id: "shares",      label: "Partages" },
    ],
    onSegment,
  });

  const api = await waitNs("netmap", "list_connections");

  // ─── CONNEXIONS ──────────────────────────────────────────────────────────────

  let connsData = [];
  let connsFilter = "";

  async function buildConnections() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" id="nmSearch" placeholder="Filtrer par proto, adresse, processus, PID…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="nmRefresh">Actualiser</button>
        </div>
        <p class="meta" id="nmMeta"></p>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="nmEmpty">Chargement des connexions réseau…</div>
        <div class="table-wrap" id="nmWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>Proto</th>
              <th>Adresse locale</th>
              <th>Adresse distante</th>
              <th>État</th>
              <th>PID</th>
              <th>Processus</th>
            </tr></thead>
            <tbody id="nmBody"></tbody>
          </table>
        </div>
      </div>`;

    const searchEl = body.querySelector("#nmSearch");
    const metaEl   = body.querySelector("#nmMeta");
    const emptyEl  = body.querySelector("#nmEmpty");
    const wrapEl   = body.querySelector("#nmWrap");
    const bodyEl   = body.querySelector("#nmBody");

    function renderConns() {
      const q = connsFilter.toLowerCase();
      const rows = q
        ? connsData.filter(c =>
            (c.proto || "").toLowerCase().includes(q) ||
            (c.laddr || "").toLowerCase().includes(q) ||
            (c.raddr || "").toLowerCase().includes(q) ||
            (c.name  || "").toLowerCase().includes(q) ||
            String(c.pid || "").includes(q))
        : connsData;
      if (!rows.length) {
        emptyEl.hidden = false; wrapEl.hidden = true;
        metaEl.textContent = q ? "Aucune correspondance." : "Aucune connexion active.";
        return;
      }
      emptyEl.hidden = true; wrapEl.hidden = false;
      metaEl.textContent = `${rows.length} / ${connsData.length} connexion(s)`;
      bodyEl.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (const c of rows) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td>${esc(c.proto || "")}</td>` +
          `<td class="meta">${esc(c.laddr || "—")}</td>` +
          `<td class="meta">${esc(c.raddr || "—")}</td>` +
          `<td>${esc(c.status || "")}</td>` +
          `<td>${esc(c.pid || "")}</td>` +
          `<td title="${esc(c.path || "")}">${esc(c.name || "—")}</td>`;
        frag.appendChild(tr);
      }
      bodyEl.appendChild(frag);
    }

    searchEl.addEventListener("input", () => { connsFilter = searchEl.value || ""; renderConns(); });
    body.querySelector("#nmRefresh").addEventListener("click", loadConns);

    async function loadConns() {
      if (!api?.list_connections) { setStatus("API netmap indisponible.", "error"); return; }
      setStatus("Chargement connexions…");
      emptyEl.hidden = false; wrapEl.hidden = true; emptyEl.textContent = "Chargement…";
      try {
        const res = await api.list_connections();
        if (!res?.ok) {
          emptyEl.textContent = res?.error || "Erreur";
          setStatus("Erreur : " + (res?.error || "?"), "error");
          return;
        }
        connsData = Array.isArray(res.connections) ? res.connections : [];
        emptyEl.textContent = "Aucune connexion active.";
        renderConns();
        setStatus(`${connsData.length} connexion(s) chargée(s).`);
      } catch (err) {
        emptyEl.textContent = String(err);
        setStatus("Erreur : " + String(err), "error");
      }
    }

    await loadConns();
  }

  // ─── OUTILS RÉSEAU ───────────────────────────────────────────────────────────

  async function buildTools() {
    body.innerHTML = `
      <div class="panel">
        <h3 style="font-size:.85rem;font-weight:600;margin-bottom:10px">Ping / Traceroute</h3>
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="text" id="nmPingHost" placeholder="Hostname ou adresse IP…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="nmPingBtn">Lancer</button>
        </div>
        <pre id="nmPingResult"
          style="margin-top:10px;font-size:.78rem;font-family:var(--mono,ui-monospace,monospace);
                 white-space:pre-wrap;background:var(--bg1);border:1px solid var(--border);
                 border-radius:8px;padding:10px 12px;min-height:44px;max-height:220px;overflow:auto"></pre>
      </div>
      <div class="panel">
        <h3 style="font-size:.85rem;font-weight:600;margin-bottom:10px">Sonde TCP (port check)</h3>
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="text" id="nmProbeHost" placeholder="Hostname ou IP…" autocomplete="off" value="8.8.8.8" />
          </div>
          <input type="number" id="nmProbePort" value="443" min="1" max="65535"
            style="width:88px" title="Port cible" />
          <input type="number" id="nmProbeTimeout" value="2" min="0.2" max="30" step="0.5"
            style="width:76px" title="Timeout (secondes)" />
          <button type="button" class="btn accent" id="nmProbeBtn">Sonder</button>
          <span class="meta" id="nmProbeResult" style="min-width:140px"></span>
        </div>
      </div>`;

    const pingHost   = body.querySelector("#nmPingHost");
    const pingBtn    = body.querySelector("#nmPingBtn");
    const pingResult = body.querySelector("#nmPingResult");
    const probeBtn   = body.querySelector("#nmProbeBtn");
    const probeRes   = body.querySelector("#nmProbeResult");

    pingBtn.addEventListener("click", async () => {
      const h = (pingHost.value || "").trim();
      if (!h || !api?.run_ping_trace) return;
      setStatus("Ping/traceroute en cours…");
      pingResult.textContent = "…";
      pingBtn.disabled = true;
      try {
        const res = await api.run_ping_trace(h);
        if (res?.ok) {
          pingResult.textContent = res.output || "(aucune sortie)";
          setStatus("");
        } else {
          pingResult.textContent = res?.error || "Erreur";
          setStatus("Erreur ping.", "error");
        }
      } catch (err) {
        pingResult.textContent = String(err);
        setStatus("Erreur : " + String(err), "error");
      } finally { pingBtn.disabled = false; }
    });
    pingHost.addEventListener("keydown", e => { if (e.key === "Enter") pingBtn.click(); });

    probeBtn.addEventListener("click", async () => {
      if (!api?.tcp_probe) { setStatus("API indisponible.", "error"); return; }
      const host    = (body.querySelector("#nmProbeHost").value    || "").trim() || "127.0.0.1";
      const port    = parseInt(body.querySelector("#nmProbePort").value)    || 80;
      const timeout = parseFloat(body.querySelector("#nmProbeTimeout").value) || 2.0;
      setStatus("Sonde TCP en cours…");
      probeRes.textContent = "…";
      try {
        const res = await api.tcp_probe(host, port, timeout);
        if (res?.ok) {
          const icon = res.status === "open" ? "✓" : res.status === "timeout" ? "⏱" : "✕";
          probeRes.textContent = `${icon} ${res.status} — ${res.ms} ms`;
          setStatus("");
        } else { probeRes.textContent = res?.error || "Erreur"; setStatus("Erreur sonde.", "error"); }
      } catch (err) { probeRes.textContent = String(err); setStatus("Erreur : " + String(err), "error"); }
    });
  }

  // ─── PROXY ───────────────────────────────────────────────────────────────────

  async function buildProxy() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row" style="margin-bottom:10px">
          <button type="button" class="btn accent" id="nmProxyRead">Lire proxies actuels</button>
          <button type="button" class="btn danger" id="nmProxyClear">Effacer env. proxy</button>
        </div>
        <div class="card-grid" id="nmProxyCards">
          <p class="meta">Cliquer « Lire proxies actuels ».</p>
        </div>
      </div>
      <div class="panel">
        <h3 style="font-size:.85rem;font-weight:600;margin-bottom:10px">Définir proxy (variables d'environnement utilisateur)</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div>
            <label style="font-size:.74rem;color:var(--muted);display:block;margin-bottom:4px">HTTP_PROXY</label>
            <input type="text" id="nmProxyHttp" placeholder="http://proxy:port" autocomplete="off" />
          </div>
          <div>
            <label style="font-size:.74rem;color:var(--muted);display:block;margin-bottom:4px">HTTPS_PROXY</label>
            <input type="text" id="nmProxyHttps" placeholder="http://proxy:port" autocomplete="off" />
          </div>
          <div style="grid-column:1/-1">
            <label style="font-size:.74rem;color:var(--muted);display:block;margin-bottom:4px">NO_PROXY</label>
            <input type="text" id="nmProxyNoProxy" placeholder="localhost,127.0.0.1,…" autocomplete="off" />
          </div>
        </div>
        <button type="button" class="btn accent" id="nmProxySet">Appliquer les variables</button>
      </div>`;

    async function readProxies() {
      if (!api?.read_proxies) return;
      const cards = body.querySelector("#nmProxyCards");
      try {
        const res = await api.read_proxies();
        if (!res?.ok) { cards.innerHTML = `<p class="meta">${esc(res?.error || "Erreur lecture proxies")}</p>`; return; }
        const entries = Object.entries(res.proxies || {}).filter(([, v]) => v);
        if (!entries.length) { cards.innerHTML = `<p class="meta">Aucun proxy configuré dans les variables d'environnement.</p>`; return; }
        cards.innerHTML = entries
          .map(([k, v]) => `<div class="card"><span class="label">${esc(k)}</span>
            <span class="value" style="font-size:.88rem;font-family:var(--mono,monospace)">${esc(v)}</span></div>`)
          .join("");
      } catch (err) { cards.innerHTML = `<p class="meta">${esc(String(err))}</p>`; }
    }

    body.querySelector("#nmProxyRead").addEventListener("click", readProxies);

    body.querySelector("#nmProxyClear").addEventListener("click", async () => {
      const ok = await askConfirm(
        "Supprimer les variables d'environnement HTTP_PROXY, HTTPS_PROXY et NO_PROXY pour l'utilisateur courant ?",
        "Effacer les proxies"
      );
      if (!ok) return;
      setStatus("Suppression proxy…");
      try {
        const prep = await api.prepare_action("clear_user_env_proxy", {});
        if (!prep?.ok || !prep.token) { setStatus("Erreur préparation.", "error"); return; }
        const res = await api.clear_user_env_proxy(prep.token);
        if (res?.ok) { setStatus("Variables proxy supprimées.", "ok"); await readProxies(); }
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    body.querySelector("#nmProxySet").addEventListener("click", async () => {
      const http    = body.querySelector("#nmProxyHttp").value.trim();
      const https   = body.querySelector("#nmProxyHttps").value.trim();
      const noProxy = body.querySelector("#nmProxyNoProxy").value.trim();
      const ok = await askConfirm(
        "Définir HTTP_PROXY, HTTPS_PROXY et NO_PROXY dans les variables d'environnement utilisateur ? " +
        "Les applications lancées ensuite hériteront de ces valeurs.",
        "Définir les proxies"
      );
      if (!ok) return;
      setStatus("Définition proxy…");
      try {
        const prep = await api.prepare_action("set_user_env_proxy", { http, https, no_proxy: noProxy });
        if (!prep?.ok || !prep.token) { setStatus("Erreur préparation.", "error"); return; }
        const res = await api.set_user_env_proxy(http, https, noProxy, prep.token);
        if (res?.ok) { setStatus("Variables proxy définies.", "ok"); await readProxies(); }
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    await readProxies();
  }

  // ─── PARTAGES ────────────────────────────────────────────────────────────────

  async function buildShares() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="nmSharesRefresh">Actualiser</button>
          <p class="meta" id="nmSharesMeta" style="margin:0"></p>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="nmSharesEmpty">Chargement des partages réseau…</div>
        <div class="table-wrap" id="nmSharesWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>Nom</th>
              <th>Chemin local</th>
              <th>Description</th>
            </tr></thead>
            <tbody id="nmSharesBody"></tbody>
          </table>
        </div>
      </div>`;

    body.querySelector("#nmSharesRefresh").addEventListener("click", loadShares);

    async function loadShares() {
      const emptyEl = body.querySelector("#nmSharesEmpty");
      const wrapEl  = body.querySelector("#nmSharesWrap");
      const bodyEl  = body.querySelector("#nmSharesBody");
      const metaEl  = body.querySelector("#nmSharesMeta");
      if (!api?.list_shares) { setStatus("API netmap indisponible.", "error"); return; }
      setStatus("Chargement partages…");
      emptyEl.hidden = false; wrapEl.hidden = true; emptyEl.textContent = "Chargement…";
      try {
        const res = await api.list_shares();
        if (!res?.ok) {
          emptyEl.textContent = res?.error || "Erreur";
          setStatus("Erreur : " + (res?.error || "?"), "error");
          return;
        }
        const shares = Array.isArray(res.shares) ? res.shares : [];
        if (!shares.length) { emptyEl.textContent = "Aucun partage réseau trouvé."; setStatus(""); return; }
        emptyEl.hidden = true; wrapEl.hidden = false;
        metaEl.textContent = `${shares.length} partage(s)`;
        bodyEl.innerHTML = shares.map(s =>
          `<tr>
            <td>${esc(s.name || "")}</td>
            <td class="meta">${esc(s.path || "")}</td>
            <td>${esc(s.description || s.caption || "")}</td>
          </tr>`
        ).join("");
        setStatus("");
      } catch (err) {
        emptyEl.textContent = String(err);
        setStatus("Erreur : " + String(err), "error");
      }
    }

    await loadShares();
  }

  // ─── SEGMENT ROUTER ──────────────────────────────────────────────────────────

  async function onSegment(seg) {
    setStatus("");
    if      (seg === "connections") await buildConnections();
    else if (seg === "tools")       await buildTools();
    else if (seg === "proxy")       await buildProxy();
    else if (seg === "shares")      await buildShares();
  }
}
