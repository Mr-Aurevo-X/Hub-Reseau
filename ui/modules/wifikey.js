import { apiNs, esc } from "./_hub_util.js";

export async function mount(root) {
  const api = apiNs("wifikey");
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>WifiKey</h1>
        <p>Profils WLAN · révélation clé via ConfirmGate</p>
      </header>
      <div class="hub-module-apps">
        <button type="button" class="hub-btn accent" id="btnRefresh">Rafraîchir</button>
        <button type="button" class="hub-btn" id="btnDedicated">Fenêtre dédiée</button>
      </div>
      <div class="hub-tile-grid" id="wifiList" style="margin-top:.85rem"></div>
      <p class="hub-status" id="wifiStatus"></p>
      <pre class="hub-note" id="wifiKey" style="margin-top:.5rem"></pre>
    </div>`;

  const list = root.querySelector("#wifiList");
  const status = root.querySelector("#wifiStatus");
  const keyEl = root.querySelector("#wifiKey");

  async function refresh() {
    status.textContent = "Chargement…";
    keyEl.textContent = "";
    const res = await api.list_profiles();
    const profiles = (res && res.profiles) || [];
    if (!res.ok) {
      list.innerHTML = `<p class="hub-note">${esc(res.error || "Échec")}</p>`;
      status.textContent = "";
      return;
    }
    list.innerHTML = profiles.map((p) => `
      <button type="button" class="hub-tile" data-name="${esc(p.name)}">
        <strong>${esc(p.name)}</strong>
        <span>Afficher la clé…</span>
      </button>`).join("");
    status.textContent = `${profiles.length} profil(s)` + (res.admin ? " · admin" : " · non-admin");
  }

  list.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-name]");
    if (!btn) return;
    const name = btn.getAttribute("data-name");
    if (!window.confirm(`Afficher la clé Wi‑Fi de « ${name} » ?`)) return;
    const prep = await api.prepare_get_key(name);
    if (!prep?.ok || !prep.token) {
      status.textContent = (prep && prep.error) || "Confirmation refusée";
      return;
    }
    const res = await api.get_key(name, prep.token);
    if (!res.ok) {
      status.textContent = res.error || "Échec";
      keyEl.textContent = "";
      return;
    }
    keyEl.textContent = res.key ? `${res.profile} → ${res.key}` : "Clé non trouvée (admin ?)";
    status.textContent = "Clé révélée (local)";
  });

  root.querySelector("#btnRefresh")?.addEventListener("click", refresh);
  root.querySelector("#btnDedicated")?.addEventListener("click", async () => {
    const r = await api.open_dedicated();
    status.textContent = r.ok ? "Fenêtre WifiKey lancée" : (r.error || "Échec");
  });
  await refresh();
}
