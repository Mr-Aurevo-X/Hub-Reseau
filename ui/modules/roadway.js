import { apiNs, esc, confirmMutator } from "./_hub_util.js";

export async function mount(root) {
  const api = apiNs("roadway");
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>RoadWay-X</h1>
        <p>Trafic live · alertes · mutators ConfirmGate (kill / block / startup)</p>
      </header>
      <div class="hub-module-apps">
        <button type="button" class="hub-btn accent" id="btnStart">Start monitor</button>
        <button type="button" class="hub-btn" id="btnStop">Stop</button>
        <button type="button" class="hub-btn" id="btnSnap">Snapshot</button>
        <button type="button" class="hub-btn" id="btnAlerts">Alertes</button>
        <button type="button" class="hub-btn" id="btnDedicated">Fenêtre dédiée</button>
      </div>
      <div id="rwBody" style="margin-top:.85rem"></div>
      <p class="hub-status" id="rwStatus"></p>
    </div>`;

  const body = root.querySelector("#rwBody");
  const status = root.querySelector("#rwStatus");

  function renderFlows(snap) {
    const flows = (snap && (snap.flows || snap.connections)) || [];
    const rows = flows.slice(0, 80);
    body.innerHTML = `
      <div style="overflow:auto;max-height:20rem;border:1px solid var(--border);border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:.78rem">
          <thead><tr><th align="left">Remote</th><th align="left">PID</th><th align="left">Name</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${esc(r.raddr || r.remote || "")}</td>
            <td>${esc(r.pid || 0)}</td>
            <td>${esc(r.name || "")}</td>
            <td><button type="button" class="hub-btn" data-kill="${esc(r.pid || 0)}">Kill</button>
                <button type="button" class="hub-btn" data-block="${esc((r.raddr || r.remote || "").split(":")[0] || "")}">Block IP</button></td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    body.querySelector("tbody")?.addEventListener("click", async (ev) => {
      const kill = ev.target.closest("[data-kill]");
      const block = ev.target.closest("[data-block]");
      if (kill) {
        const pid = Number(kill.getAttribute("data-kill") || 0);
        const c = await confirmMutator("roadway", "kill_process", { pid }, `Tuer le process PID ${pid} ?`);
        if (!c.ok) { status.textContent = c.error; return; }
        const res = await api.kill_process(pid, c.token);
        status.textContent = res.ok ? `Kill ${pid} OK` : (res.error || "Échec");
      }
      if (block) {
        const ip = block.getAttribute("data-block") || "";
        if (!ip) return;
        const c = await confirmMutator("roadway", "block_remote", { ip, port: 0, rule_name: "" }, `Bloquer ${ip} (pare-feu) ?`);
        if (!c.ok) { status.textContent = c.error; return; }
        const res = await api.block_remote(ip, 0, c.token);
        status.textContent = res.ok ? `Block ${ip}` : (res.error || "Échec");
      }
    });
  }

  root.querySelector("#btnStart")?.addEventListener("click", async () => {
    const res = await api.start_monitor(1.0);
    status.textContent = res.ok ? "Monitor ON" : (res.error || "Échec");
  });
  root.querySelector("#btnStop")?.addEventListener("click", async () => {
    const res = await api.stop_monitor();
    status.textContent = res.ok ? "Monitor OFF" : (res.error || "Échec");
  });
  root.querySelector("#btnSnap")?.addEventListener("click", async () => {
    status.textContent = "Snapshot…";
    const snap = await api.get_snapshot();
    renderFlows(snap);
    status.textContent = snap.error ? snap.error : "Snapshot OK";
  });
  root.querySelector("#btnAlerts")?.addEventListener("click", async () => {
    const res = await api.list_alerts(50);
    body.innerHTML = `<pre class="hub-note" style="white-space:pre-wrap;max-height:18rem;overflow:auto">${esc(JSON.stringify(res, null, 2))}</pre>`;
    status.textContent = "Alertes";
  });
  root.querySelector("#btnDedicated")?.addEventListener("click", async () => {
    const r = await api.open_dedicated();
    status.textContent = r.ok ? "Fenêtre RoadWay lancée" : (r.error || "Échec");
  });

  status.textContent = "Prêt — Start monitor puis Snapshot";
}
