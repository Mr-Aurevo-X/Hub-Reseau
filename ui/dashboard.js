/**
 * Hub-Reseau — Dashboard home.
 * KPIs lecture seule + tuiles modules avec icônes. Zéro mutator.
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

const MODULE_DEFS = [
  {
    id:   "netadmin",
    icon: "⌬",
    label: "NetAdmin",
    desc: "Adaptateurs réseau · fichier hosts · règles pare-feu",
    detail: "Réinitialisation IP/TCP, Winsock, cache DNS. Édition hosts avec profils. Activation/désactivation règles pare-feu.",
  },
  {
    id:   "netmap",
    icon: "⌖",
    label: "NetMap",
    desc: "Connexions TCP/UDP · ping · proxy · partages",
    detail: "Tableau en direct des connexions par PID. Ping/traceroute, sonde TCP. Gestion variables proxy. Partages réseau.",
  },
  {
    id:   "roadway",
    icon: "↗",
    label: "RoadWay-X",
    desc: "Trafic live · alertes heuristiques · DNS · confiance",
    detail: "Moniteur de flux réseau temps réel avec débit. Alertes par règles. Liste DNS récente. Apprentissage et confiance processus.",
  },
  {
    id:   "wifikey",
    icon: "≋",
    label: "WifiKey",
    desc: "Profils WLAN et clés de sécurité",
    detail: "Inventaire des profils Wi-Fi Windows. Révélation des clés de sécurité avec confirmation (ConfirmGate).",
  },
];

export async function mount(root) {
  root.innerHTML = `
    <header class="hub-page-header">
      <h1>Réseau</h1>
      <p>Dashboard lecture seule · Hub réseau — L'Atelier PC Command</p>
    </header>

    <div class="hub-kpi-grid" id="kpiGrid" aria-busy="true">
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
    </div>

    <h2 style="margin-bottom:.65rem;font-size:.88rem;font-weight:600;color:var(--muted);letter-spacing:.04em;text-transform:uppercase">
      Modules disponibles
    </h2>
    <div class="hub-tile-grid" id="tileGrid"></div>
    <p class="hub-status" id="dashStatus"></p>
  `;

  const tiles  = document.getElementById("tileGrid");
  const grid   = document.getElementById("kpiGrid");
  const status = document.getElementById("dashStatus");

  tiles.innerHTML = MODULE_DEFS.map((m) => `
    <button type="button" class="hub-tile" data-open="${esc(m.id)}">
      <span style="font-size:1.4rem;line-height:1;margin-bottom:.15rem;opacity:.85">${m.icon}</span>
      <strong>${esc(m.label)}</strong>
      <span>${esc(m.desc)}</span>
      <span style="font-size:.72rem;color:var(--muted);margin-top:.1rem;line-height:1.35">${esc(m.detail)}</span>
    </button>`
  ).join("");

  tiles.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-open]");
    if (!btn) return;
    const id = btn.getAttribute("data-open");
    if (id && window.HubShell?.showView) window.HubShell.showView(id);
  });

  const a = api();
  try {
    let kpis = { ok: true, admin: false };
    if (a?.dashboard?.get_kpis) {
      kpis = await a.dashboard.get_kpis();
    }
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = `
      <div class="hub-kpi">
        <span class="label">NIC actives</span>
        <span class="value">${esc(fmt(kpis.nicUp))}</span>
      </div>
      <div class="hub-kpi">
        <span class="label">TCP établis</span>
        <span class="value">${esc(fmt(kpis.tcpEstablished))}</span>
      </div>
      <div class="hub-kpi">
        <span class="label">Interfaces</span>
        <span class="value" style="font-size:.95rem;word-break:break-all">${esc(fmt(kpis.nicNames))}</span>
      </div>
      <div class="hub-kpi">
        <span class="label">Privilèges</span>
        <span class="value" style="color:${kpis.admin ? "var(--ok,#3dd68c)" : "var(--muted)"}">${kpis.admin ? "Admin" : "Standard"}</span>
      </div>
    `;
    status.textContent = kpis.partial && kpis.error ? "KPIs partiels : " + kpis.error : "";
  } catch (e) {
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = `<div class="hub-kpi"><span class="label">KPIs</span><span class="value">—</span></div>`;
    status.textContent = "KPIs indisponibles (pywebview.api non prêt).";
  }
}
