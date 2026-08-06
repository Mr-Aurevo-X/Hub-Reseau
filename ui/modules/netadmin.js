import { apiNs, esc, confirmMutator } from "./_hub_util.js";

export async function mount(root) {
  const api = apiNs("netadmin");
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>NetAdmin</h1>
        <p>Adaptateurs · Hosts · Pare-feu — in-process Couche B</p>
      </header>
      <div class="hub-module-apps" style="margin-bottom:.75rem">
        <button type="button" class="hub-btn" data-seg="adapters">Adaptateurs</button>
        <button type="button" class="hub-btn" data-seg="hosts">Hosts</button>
        <button type="button" class="hub-btn" data-seg="fw">Pare-feu</button>
        <button type="button" class="hub-btn accent" id="btnDedicated">Fenêtre dédiée</button>
      </div>
      <div id="naBody" class="hub-skel kpi" style="min-height:12rem"></div>
      <p class="hub-status" id="naStatus"></p>
    </div>`;

  const body = root.querySelector("#naBody");
  const status = root.querySelector("#naStatus");
  let seg = "adapters";

  async function showAdapters() {
    body.innerHTML = `
      <div class="hub-module-apps">
        <button type="button" class="hub-btn accent" id="btnIp">Reset IP</button>
        <button type="button" class="hub-btn" id="btnWinsock">Reset Winsock</button>
      </div>
      <pre class="hub-note" id="naOut" style="margin-top:.75rem;white-space:pre-wrap"></pre>`;
    body.querySelector("#btnIp")?.addEventListener("click", async () => {
      const c = await confirmMutator("netadmin", "reset_ip", {}, "Exécuter ipconfig /release puis /renew ?");
      if (!c.ok) { status.textContent = c.error; return; }
      status.textContent = "Reset IP…";
      const res = await api.reset_ip(c.token);
      status.textContent = res.ok ? "Reset IP OK" : (res.error || "Échec");
      body.querySelector("#naOut").textContent = res.output || res.error || JSON.stringify(res);
    });
    body.querySelector("#btnWinsock")?.addEventListener("click", async () => {
      const c = await confirmMutator("netadmin", "reset_winsock", {}, "Exécuter netsh winsock reset ? Redémarrage recommandé.");
      if (!c.ok) { status.textContent = c.error; return; }
      status.textContent = "Reset Winsock…";
      const res = await api.reset_winsock(c.token);
      status.textContent = res.ok ? "Winsock OK — redémarrage recommandé" : (res.error || "Échec");
      body.querySelector("#naOut").textContent = res.output || res.error || JSON.stringify(res);
    });
  }

  async function showHosts() {
    status.textContent = "Lecture hosts…";
    const res = await api.read_hosts();
    body.innerHTML = `
      <textarea id="hostsText" style="width:100%;min-height:14rem;font-family:var(--font-mono,monospace);font-size:.78rem;background:var(--bg1);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:.65rem"></textarea>
      <div class="hub-module-apps" style="margin-top:.55rem">
        <button type="button" class="hub-btn accent" id="btnSaveHosts">Enregistrer</button>
        <button type="button" class="hub-btn" id="btnFlush">Flush DNS</button>
      </div>`;
    body.querySelector("#hostsText").value = (res && res.text) || "";
    status.textContent = res.ok ? (res.path || "OK") : (res.error || "Échec lecture");
    body.querySelector("#btnSaveHosts")?.addEventListener("click", async () => {
      const text = body.querySelector("#hostsText").value;
      const c = await confirmMutator("netadmin", "write_hosts", { text }, "Écrire le fichier hosts système ?");
      if (!c.ok) { status.textContent = c.error; return; }
      const w = await api.write_hosts(text, c.token);
      status.textContent = w.ok ? ("Enregistré" + (w.backup ? " · backup " + w.backup : "")) : (w.error || "Échec");
    });
    body.querySelector("#btnFlush")?.addEventListener("click", async () => {
      const c = await confirmMutator("netadmin", "flush_dns", {}, "Vider le cache DNS ?");
      if (!c.ok) { status.textContent = c.error; return; }
      const f = await api.flush_dns(c.token);
      status.textContent = f.ok ? "DNS flush OK" : (f.error || "Échec");
    });
  }

  async function showFw() {
    status.textContent = "Chargement règles…";
    const res = await api.list_rules();
    const rules = (res && res.rules) || [];
    body.innerHTML = `<div class="hub-tile-grid" id="fwList"></div>`;
    const list = body.querySelector("#fwList");
    if (!rules.length) {
      list.innerHTML = `<p class="hub-note">${esc(res.error || "Aucune règle")}</p>`;
      status.textContent = "";
      return;
    }
    list.innerHTML = rules.slice(0, 80).map((r, i) => `
      <div class="hub-tile" style="cursor:default">
        <strong>${esc(r.name || r.Name || ("#" + i))}</strong>
        <span>${esc(String(r.enabled ?? r.Enabled))} · ${esc(r.direction || r.Direction || "")} · ${esc(r.action || r.Action || "")}</span>
        <div class="hub-module-apps" style="margin-top:.4rem">
          <button type="button" class="hub-btn" data-en="1" data-name="${esc(r.name || r.Name)}">Activer</button>
          <button type="button" class="hub-btn" data-en="0" data-name="${esc(r.name || r.Name)}">Désactiver</button>
        </div>
      </div>`).join("");
    list.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-name]");
      if (!btn) return;
      const name = btn.getAttribute("data-name");
      const enabled = btn.getAttribute("data-en") === "1";
      const c = await confirmMutator("netadmin", "set_rule_enabled", { name, enabled },
        `${enabled ? "Activer" : "Désactiver"} la règle « ${name} » ?`);
      if (!c.ok) { status.textContent = c.error; return; }
      const r = await api.set_rule_enabled(name, enabled, c.token);
      status.textContent = r.ok ? "OK" : (r.error || "Échec");
      if (r.ok) showFw();
    });
    status.textContent = `${rules.length} règles`;
  }

  async function render() {
    if (seg === "hosts") return showHosts();
    if (seg === "fw") return showFw();
    return showAdapters();
  }

  root.querySelectorAll("[data-seg]").forEach((btn) => {
    btn.addEventListener("click", () => { seg = btn.getAttribute("data-seg"); render(); });
  });
  root.querySelector("#btnDedicated")?.addEventListener("click", async () => {
    const r = await api.open_dedicated();
    status.textContent = r.ok ? "Fenêtre NetAdmin lancée" : (r.error || "Échec");
  });
  await render();
}
