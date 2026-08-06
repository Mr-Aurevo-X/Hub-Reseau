/**
 * Dashboard home — KPIs lecture seule + tuiles modules (zéro mutator).
 */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function api() {
  return window.pywebview && window.pywebview.api;
}

export async function mount(root) {
  root.innerHTML = `
    <header class="hub-page-header">
      <h1>Réseau</h1>
      <p>Dashboard lecture seule · hub réseau</p>
    </header>
    <div class="hub-kpi-grid" id="kpiGrid" aria-busy="true">
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
    </div>
    <h2 class="hub-note" style="margin-bottom:.65rem;font-size:.92rem;color:var(--text);font-weight:600;">Accès rapide</h2>
    <div class="hub-tile-grid" id="tileGrid"></div>
    <p class="hub-status" id="dashStatus"></p>
  `;

  const a = api();
  let modules = [];
  try {
    if (a?.dashboard?.list_modules) {
      const res = await a.dashboard.list_modules();
      modules = (res && res.modules) || [];
    }
  } catch (_) {}

  if (!modules.length) {
    modules = [
      { id: "netadmin", label: "NetAdmin", desc: "Adaptateurs, hosts, firewall" },
      { id: "netmap", label: "NetMap", desc: "Connexions TCP/UDP ↔ PID" },
      { id: "roadway", label: "RoadWay-X", desc: "Trafic live NIC / alertes" },
      { id: "wifikey", label: "WifiKey", desc: "Profils et clés Wi-Fi" }
    ];
  }

  const tiles = document.getElementById("tileGrid");
  tiles.innerHTML = modules
    .map(
      (m) => `
      <button type="button" class="hub-tile" data-open="${esc(m.id)}">
        <strong>${esc(m.label)}</strong>
        <span>${esc(m.desc || "")}</span>
      </button>`
    )
    .join("");

  tiles.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-open]");
    if (!btn) return;
    const id = btn.getAttribute("data-open");
    if (id && window.HubShell?.showView) window.HubShell.showView(id);
  });

  const grid = document.getElementById("kpiGrid");
  const status = document.getElementById("dashStatus");
  try {
    let kpis = { ok: true, admin: false };
    if (a?.dashboard?.get_kpis) {
      kpis = await a.dashboard.get_kpis();
    }
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = `
      <div class="hub-kpi"><span class="label">NIC actives</span><span class="value">${esc(fmt(kpis.nicUp))}</span></div>
      <div class="hub-kpi"><span class="label">TCP établis</span><span class="value">${esc(fmt(kpis.tcpEstablished))}</span></div>
      <div class="hub-kpi"><span class="label">Interfaces</span><span class="value">${esc(fmt(kpis.nicNames))}</span></div>
      <div class="hub-kpi"><span class="label">Admin</span><span class="value">${kpis.admin ? "Oui" : "Non"}</span></div>
    `;
    if (kpis.partial && kpis.error) {
      status.textContent = "KPIs partiels : " + kpis.error;
    } else {
      status.textContent = "";
    }
  } catch (e) {
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = `<div class="hub-kpi"><span class="label">KPIs</span><span class="value">—</span></div>`;
    status.textContent = "KPIs indisponibles (API ou bridge).";
  }
}
