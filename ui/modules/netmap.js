import { apiNs, esc, confirmMutator } from "./_hub_util.js";

export async function mount(root) {
  const api = apiNs("netmap");
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>NetMap</h1>
        <p>Connexions · ping/trace · proxy · partages — in-process</p>
      </header>
      <div class="hub-module-apps">
        <button type="button" class="hub-btn accent" data-seg="conn">Connexions</button>
        <button type="button" class="hub-btn" data-seg="ping">Ping/Trace</button>
        <button type="button" class="hub-btn" data-seg="proxy">Proxy</button>
        <button type="button" class="hub-btn" data-seg="shares">Partages</button>
        <button type="button" class="hub-btn" id="btnDedicated">Fenêtre dédiée</button>
      </div>
      <div id="nmBody" style="margin-top:.85rem"></div>
      <p class="hub-status" id="nmStatus"></p>
    </div>`;

  const body = root.querySelector("#nmBody");
  const status = root.querySelector("#nmStatus");
  let seg = "conn";

  async function showConn() {
    status.textContent = "Scan connexions…";
    body.innerHTML = `<div class="hub-skel kpi" style="height:8rem"></div>`;
    const res = await api.list_connections();
    const rows = (res.connections || []).slice(0, 120);
    body.innerHTML = `
      <div style="overflow:auto;max-height:22rem;border:1px solid var(--border);border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:.78rem">
          <thead><tr>
            <th align="left">Proto</th><th align="left">Local</th><th align="left">Remote</th>
            <th align="left">État</th><th align="left">PID</th><th align="left">Process</th>
          </tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${esc(r.proto)}</td><td>${esc(r.laddr)}</td><td>${esc(r.raddr)}</td>
            <td>${esc(r.status)}</td><td>${esc(r.pid)}</td><td>${esc(r.name)}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    status.textContent = res.ok ? `${res.count || rows.length} connexions (aperçu ${rows.length})` : (res.error || "Échec");
  }

  async function showPing() {
    body.innerHTML = `
      <div class="hub-module-apps">
        <input id="pingHost" placeholder="host / IP" style="flex:1;min-width:12rem;padding:.45rem .6rem;border-radius:8px;border:1px solid var(--border);background:var(--bg1);color:var(--text)" />
        <button type="button" class="hub-btn accent" id="btnPing">Ping / Trace</button>
        <input id="probePort" placeholder="port" value="80" style="width:4.5rem;padding:.45rem .6rem;border-radius:8px;border:1px solid var(--border);background:var(--bg1);color:var(--text)" />
        <button type="button" class="hub-btn" id="btnProbe">TCP probe</button>
      </div>
      <pre class="hub-note" id="pingOut" style="margin-top:.65rem;white-space:pre-wrap;max-height:16rem;overflow:auto"></pre>`;
    body.querySelector("#btnPing")?.addEventListener("click", async () => {
      const host = body.querySelector("#pingHost").value;
      status.textContent = "Ping/trace…";
      const res = await api.run_ping_trace(host);
      body.querySelector("#pingOut").textContent = res.output || res.error || JSON.stringify(res, null, 2);
      status.textContent = res.ok ? "OK" : (res.error || "Échec");
    });
    body.querySelector("#btnProbe")?.addEventListener("click", async () => {
      const host = body.querySelector("#pingHost").value || "127.0.0.1";
      const port = Number(body.querySelector("#probePort").value || 80);
      const res = await api.tcp_probe(host, port);
      body.querySelector("#pingOut").textContent = JSON.stringify(res, null, 2);
      status.textContent = res.ok ? `${res.status} (${res.ms} ms)` : (res.error || "Échec");
    });
    status.textContent = "";
  }

  async function showProxy() {
    const cur = await api.read_proxies();
    body.innerHTML = `
      <p class="hub-note">Proxy utilisateur (HKCU) — mutators ConfirmGate</p>
      <pre class="hub-note" id="proxyCur">${esc(JSON.stringify(cur, null, 2))}</pre>
      <div class="hub-module-apps" style="margin-top:.55rem">
        <input id="httpP" placeholder="HTTP proxy" style="flex:1;min-width:10rem;padding:.45rem .6rem;border-radius:8px;border:1px solid var(--border);background:var(--bg1);color:var(--text)" />
        <input id="httpsP" placeholder="HTTPS proxy" style="flex:1;min-width:10rem;padding:.45rem .6rem;border-radius:8px;border:1px solid var(--border);background:var(--bg1);color:var(--text)" />
        <button type="button" class="hub-btn accent" id="btnSetProxy">Appliquer</button>
        <button type="button" class="hub-btn" id="btnClearProxy">Effacer</button>
      </div>`;
    body.querySelector("#btnSetProxy")?.addEventListener("click", async () => {
      const http = body.querySelector("#httpP").value;
      const https = body.querySelector("#httpsP").value;
      const payload = { http, https, no_proxy: "" };
      const c = await confirmMutator("netmap", "set_user_env_proxy", payload, "Écrire les variables proxy utilisateur ?");
      if (!c.ok) { status.textContent = c.error; return; }
      const res = await api.set_user_env_proxy(http, https, "", c.token);
      status.textContent = res.ok ? "Proxy appliqué" : (res.error || "Échec");
      showProxy();
    });
    body.querySelector("#btnClearProxy")?.addEventListener("click", async () => {
      const c = await confirmMutator("netmap", "clear_user_env_proxy", {}, "Effacer les proxy utilisateur ?");
      if (!c.ok) { status.textContent = c.error; return; }
      const res = await api.clear_user_env_proxy(c.token);
      status.textContent = res.ok ? "Proxy effacé" : (res.error || "Échec");
      showProxy();
    });
    status.textContent = "";
  }

  async function showShares() {
    status.textContent = "Partages…";
    const res = await api.list_shares();
    body.innerHTML = `<pre class="hub-note" style="white-space:pre-wrap">${esc(JSON.stringify(res, null, 2))}</pre>`;
    status.textContent = res.ok ? "OK" : (res.error || "Échec");
  }

  async function render() {
    if (seg === "ping") return showPing();
    if (seg === "proxy") return showProxy();
    if (seg === "shares") return showShares();
    return showConn();
  }

  root.querySelectorAll("[data-seg]").forEach((b) => {
    b.addEventListener("click", () => { seg = b.getAttribute("data-seg"); render(); });
  });
  root.querySelector("#btnDedicated")?.addEventListener("click", async () => {
    const r = await api.open_dedicated();
    status.textContent = r.ok ? "Fenêtre NetMap lancée" : (r.error || "Échec");
  });
  await render();
}
