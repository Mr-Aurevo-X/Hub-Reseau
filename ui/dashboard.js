/**
 * Hub-Reseau Accueil — Atelier live metrics + tuiles modules (zéro mutator).
 */

const HUB_LABEL = "Network";
const HUB_BLURB = "PC Command — live metrics (read-only) · no mutators";
const SHOW_VIEW =
  () => window.HubReseau?.showView || window.HubShell?.showView;

const FALLBACK_MODULES = [
  { id: "netadmin", label: "NetAdmin", desc: "Adaptateurs réseau · fichier hosts · règles pare-feu", ico: "⌬" },
  { id: "netmap", label: "NetMap", desc: "Connexions TCP/UDP · ping · proxy · partages", ico: "⌖" },
  { id: "roadway", label: "RoadWay-X", desc: "Trafic live · alertes heuristiques · DNS · confiance", ico: "↗" },
  { id: "wifikey", label: "WifiKey", desc: "Profils WLAN et clés de sécurité", ico: "≋" },
];

const ICO = Object.fromEntries(FALLBACK_MODULES.map((m) => [m.id, m.ico]));

const HISTORY = 60;
const ARC_LEN = 283;

let metricsUrl = "";
let tickTimer = null;
let clockTimer = null;
const hist = { cpu: [], ram: [], gpu: [], netUp: [], netDown: [] };
let lastNet = null;
let lastTs = null;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function api() {
  return window.pywebview && window.pywebview.api;
}

function el(id) {
  return document.getElementById(id);
}

function metricsMarkup() {
  return `
  <div class="hub-dash-root">
    <header class="hub-page-header hub-dash-head">
      <div>
        <h1>${esc(HUB_LABEL)}</h1>
        <p>${esc(HUB_BLURB)}</p>
      </div>
      <div class="hub-dash-live">
        <span class="clock" id="clock">—</span>
        <span class="live-pill off" id="livePill"><i></i> OFF</span>
      </div>
    </header>

    <div class="hub-dash-metrics">
    <div class="pcd-grid" id="hubMetricsGrid">
      <section class="panel hero tint-red">
        <div class="hero-gauge-wrap">
          <svg class="hero-gauge" viewBox="0 0 220 140" aria-hidden="true">
            <defs>
              <linearGradient id="gArc" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#3dd68c"/>
                <stop offset="55%" stop-color="#f0a33a"/>
                <stop offset="100%" stop-color="#e03545"/>
              </linearGradient>
            </defs>
            <path class="track" d="M20 120 A90 90 0 0 1 200 120" fill="none" stroke-width="14" stroke-linecap="round"/>
            <path id="cpuArc" class="arc" d="M20 120 A90 90 0 0 1 200 120" fill="none" stroke="url(#gArc)" stroke-width="14" stroke-linecap="round"
              stroke-dasharray="283" stroke-dashoffset="283"/>
          </svg>
          <div class="hero-center">
            <b id="cpuPct">--</b>
            <span class="level" id="cpuLevel">—</span>
            <small>CPU LOAD</small>
          </div>
        </div>
        <div class="hero-meta">
          <div><small>Processor</small><strong id="cpuName">…</strong></div>
          <div class="meta-row">
            <span><small>Cores</small><b id="cpuCores">—</b></span>
            <span><small>Clock</small><b id="cpuMhz">—</b></span>
          </div>
        </div>
      </section>

      <section class="panel kpis">
        <article class="kpi">
          <div class="kpi-ico crit">◉</div>
          <div>
            <small>Processes</small>
            <b id="procCount">—</b>
          </div>
          <em class="up">active</em>
        </article>
        <article class="kpi">
          <div class="kpi-ico warn">◈</div>
          <div>
            <small>Uptime</small>
            <b id="uptime">—</b>
          </div>
          <em class="muted" id="hostname">host</em>
        </article>
        <article class="kpi">
          <div class="kpi-ico ok">▣</div>
          <div>
            <small>RAM used</small>
            <b id="ramUsed">—</b>
          </div>
          <em class="muted" id="ramTotal">/ —</em>
        </article>
      </section>

      <section class="panel map-block tint-cyan">
        <div class="split">
          <div>
            <h3>Core load</h3>
            <div class="core-bars" id="coreBars"></div>
            <div class="pct-row">
              <span><b id="ramPctLabel">—</b><small>RAM</small></span>
              <span><b id="gpuPctLabel">—</b><small>GPU</small></span>
              <span><b id="diskTopPct">—</b><small>DISK</small></span>
            </div>
          </div>
          <div>
            <h3>Network density</h3>
            <div class="density-map" id="densityMap" aria-hidden="true"></div>
            <div class="net-rates">
              <span>↓ <b id="netDown">0</b> KB/s</span>
              <span>↑ <b id="netUp">0</b> KB/s</span>
            </div>
          </div>
        </div>
      </section>

      <section class="panel charts">
        <h3>CPU · RAM · GPU — 60s</h3>
        <canvas id="histCanvas" width="640" height="160"></canvas>
        <div class="legend">
          <span class="l-cpu">CPU</span>
          <span class="l-ram">RAM</span>
          <span class="l-gpu">GPU</span>
        </div>
      </section>

      <section class="panel area tint-cyan">
        <h3>Throughput spectrum</h3>
        <canvas id="areaCanvas" width="640" height="110"></canvas>
      </section>

      <section class="panel risk">
        <h3>Resource pressure</h3>
        <div class="bar-row"><span>CPU</span><div class="bar-track"><div class="bar-fill c" id="barCpu"></div></div><span id="barCpuT">—</span></div>
        <div class="bar-row"><span>RAM</span><div class="bar-track"><div class="bar-fill w" id="barRam"></div></div><span id="barRamT">—</span></div>
        <div class="bar-row"><span>GPU</span><div class="bar-track"><div class="bar-fill o" id="barGpu"></div></div><span id="barGpuT">—</span></div>
        <div class="gpu-gauge-row">
          <div class="mini-gauge" id="gpuRing" style="--p:0%">
            <span id="gpuRingVal">—</span>
          </div>
          <div class="kpi">
            <small>GPU load</small>
            <b id="gpuName">—</b>
            <span class="muted" id="gpuVram">VRAM —</span>
          </div>
        </div>
      </section>

      <section class="panel disks tint-amber">
        <div class="panel-head">
          <h3>Volumes · fixed &amp; USB</h3>
          <span class="disk-count" id="diskCount">— volumes</span>
        </div>
        <div class="disk-grid" id="diskCards">
          <div class="disk-empty">Chargement des volumes…</div>
        </div>
        <div class="os-line">
          <span class="dot" id="statusDot"></span>
          <span id="osLine">Connexion metrics…</span>
        </div>
      </section>
    </div>
    </div>

    <section class="hub-dash-modules" aria-label="Accès rapide">
      <h2 class="hub-section-title">Accès rapide</h2>
      <div class="hub-tile-grid" id="tileGrid"></div>
      <p class="hub-status" id="dashStatus"></p>
    </section>
  </div>
  `;
}

function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

function push(key, val) {
  hist[key].push(val == null || Number.isNaN(val) ? 0 : Number(val));
  while (hist[key].length > HISTORY) hist[key].shift();
}

function setArc(pct) {
  const offset = ARC_LEN * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const arc = el("cpuArc");
  if (arc) arc.style.strokeDashoffset = String(offset);
}

function levelClass(label) {
  const L = (label || "").toUpperCase();
  if (L === "LOW") return "ok";
  if (L === "MEDIUM" || L === "MED") return "warn";
  return "";
}

function drawHistory(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const series = [
    { key: "cpu", color: "#e03545", glow: "rgba(224,53,69,0.55)" },
    { key: "ram", color: "#f0a33a", glow: "rgba(240,163,58,0.45)" },
    { key: "gpu", color: "#3ec7ff", glow: "rgba(62,199,255,0.45)" },
  ];
  for (const s of series) {
    const data = hist[s.key];
    if (data.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.25;
    ctx.shadowColor = s.glow;
    ctx.shadowBlur = 10;
    data.forEach((v, i) => {
      const x = (i / (HISTORY - 1)) * (w - 4) + 2;
      const y = h - (Math.min(100, v) / 100) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawArea(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(1, ...hist.netUp, ...hist.netDown, 10);
  function paint(data, top, bot) {
    if (data.length < 2) return;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * w;
      const y = h - (v / max) * (h * 0.85) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }
  paint(hist.netDown, "rgba(62,199,255,0.55)", "rgba(62,199,255,0.03)");
  paint(hist.netUp, "rgba(224,53,69,0.5)", "rgba(224,53,69,0.03)");
}

function renderCores(perCore) {
  const box = el("coreBars");
  if (!box) return;
  const n = (perCore && perCore.length) || 1;
  while (box.children.length < n) box.appendChild(document.createElement("i"));
  while (box.children.length > n) box.lastChild.remove();
  [...box.children].forEach((node, i) => {
    node.style.height = `${Math.max(6, perCore[i] ?? 0)}%`;
  });
}

function diskKey(d) {
  return (d.device || d.mount || "").replace(/\\+$/, "").toUpperCase();
}

function fillClass(pct) {
  if (pct >= 90) return "c";
  if (pct >= 75) return "w";
  return "ok";
}

function pressureClass(pct) {
  if (pct >= 90) return "crit";
  if (pct >= 75) return "warn";
  return "";
}

function renderDisks(disks) {
  const box = el("diskCards");
  const countEl = el("diskCount");
  const list = Array.isArray(disks) ? disks : [];

  if (countEl) {
    const usb = list.filter((d) => d.removable).length;
    countEl.innerHTML =
      usb > 0
        ? `<b>${list.length}</b> volumes · <b>${usb}</b> USB`
        : `<b>${list.length}</b> volumes`;
  }

  if (!box) return;

  if (!list.length) {
    box.innerHTML = `<div class="disk-empty">Aucun volume détecté</div>`;
    if (el("diskTopPct")) el("diskTopPct").textContent = "—";
    return;
  }

  box.innerHTML = list
    .map((d) => {
      const pct = d.percent ?? d.pct ?? 0;
      const key = diskKey(d);
      const letter = (d.device || d.mount || "?").replace(/\\+$/, "");
      const label = d.label && d.label !== letter ? d.label : d.fstype || "Volume";
      const isUsb = !!d.removable || d.drive_type === "removable";
      const isNet = d.drive_type === "network";
      const badge = isUsb
        ? `<span class="disk-badge usb">USB</span>`
        : isNet
          ? `<span class="disk-badge network">NET</span>`
          : `<span class="disk-badge">${d.type_label || "Fixed"}</span>`;
      const cardCls = [
        "disk-card",
        pressureClass(pct),
        isUsb ? "usb" : "",
        isNet ? "network" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const fill = fillClass(pct);
      return `<article class="${cardCls}" data-disk="${esc(key)}">
          <div class="disk-top">
            <div>
              <span class="disk-letter">${esc(letter)}</span>
              <span class="disk-label" title="${esc(label)}">${esc(label)}</span>
            </div>
            ${badge}
          </div>
          <div class="disk-pct">${Math.round(pct)}%</div>
          <div class="bar-track"><div class="bar-fill ${fill}" style="width:${pct}%"></div></div>
          <div class="disk-meta">
            <span><b>${d.used_gb ?? "—"}</b> / ${d.total_gb ?? "—"} GB</span>
            <span>libre <b>${d.free_gb ?? "—"}</b> GB</span>
          </div>
        </article>`;
    })
    .join("");

  const fixed = list.filter((d) => !d.removable);
  const topSrc = fixed[0] || list[0];
  const top = topSrc.percent ?? topSrc.pct ?? 0;
  if (el("diskTopPct")) el("diskTopPct").textContent = `${Math.round(top)}%`;
}

function updateDensity(cpu, netDown) {
  const density = el("densityMap");
  if (!density) return;
  const base = Math.min(1, (cpu / 100) * 0.55 + Math.min(netDown, 500) / 800);
  for (let i = 0; i < density.children.length; i++) {
    const jitter = 0.05 + Math.random() * 0.55;
    density.children[i].style.setProperty("--o", String(Math.min(0.95, base * jitter + 0.05)));
  }
}

function apply(data) {
  const cpu = data.cpu || {};
  const ram = data.ram || {};
  const gpu = data.gpu || {};
  const load = data.load || {};

  const cpuPct = cpu.percent ?? 0;
  const loadScore = load.score ?? cpuPct;
  const loadLabel = load.label || "—";

  if (el("cpuPct")) el("cpuPct").textContent = Math.round(loadScore);
  const lvl = el("cpuLevel");
  if (lvl) {
    lvl.textContent = loadLabel;
    lvl.className = "level " + levelClass(loadLabel);
  }
  setArc(loadScore);

  if (el("cpuName")) el("cpuName").textContent = cpu.model || "CPU";
  if (el("cpuCores")) el("cpuCores").textContent = `${cpu.cores_physical || "?"}p / ${cpu.cores_logical || "?"}t`;
  if (el("cpuMhz")) el("cpuMhz").textContent = cpu.freq_mhz ? `${Math.round(cpu.freq_mhz)} MHz` : "—";

  if (el("procCount")) el("procCount").textContent = (data.procs ?? 0).toLocaleString("fr-FR");
  if (el("uptime")) el("uptime").textContent = fmtUptime(data.uptime_sec ?? 0);
  if (el("hostname")) el("hostname").textContent = data.hostname || "host";

  if (el("ramUsed")) el("ramUsed").textContent = `${ram.used_gb ?? "—"} GB`;
  if (el("ramTotal")) el("ramTotal").textContent = `/ ${ram.total_gb ?? "—"} GB`;
  if (el("ramPctLabel")) el("ramPctLabel").textContent = `${Math.round(ram.percent ?? 0)}%`;

  renderCores(cpu.per_core || []);

  if (el("barCpu")) el("barCpu").style.width = `${cpuPct}%`;
  if (el("barCpuT")) el("barCpuT").textContent = `${Math.round(cpuPct)}%`;
  if (el("barRam")) el("barRam").style.width = `${ram.percent ?? 0}%`;
  if (el("barRamT")) el("barRamT").textContent = `${Math.round(ram.percent ?? 0)}%`;

  const gpuAvail = !!gpu.available;
  const gpuPct = gpuAvail ? (gpu.load_percent ?? 0) : 0;
  if (el("barGpu")) el("barGpu").style.width = `${gpuPct}%`;
  if (el("barGpuT")) el("barGpuT").textContent = gpuAvail ? `${Math.round(gpuPct)}%` : "N/A";
  if (el("gpuPctLabel")) el("gpuPctLabel").textContent = gpuAvail ? `${Math.round(gpuPct)}%` : "N/A";
  if (el("gpuRing")) el("gpuRing").style.setProperty("--p", `${gpuPct}%`);
  if (el("gpuRingVal")) el("gpuRingVal").textContent = gpuAvail ? Math.round(gpuPct) : "—";
  if (el("gpuName")) el("gpuName").textContent = gpu.name || "GPU";
  if (el("gpuVram")) {
    el("gpuVram").textContent =
      gpuAvail && gpu.memory_total_mb
        ? `VRAM ${gpu.memory_used_mb}/${gpu.memory_total_mb} MB (${gpu.memory_percent}%)`
        : data.degraded?.gpu_note || "VRAM n/d";
  }

  let downKb = 0;
  let upKb = 0;
  const net = data.network || {};
  const ts = data.ts || Date.now() / 1000;
  if (lastNet && lastTs) {
    const dt = Math.max(ts - lastTs, 1e-3);
    downKb = Math.max(0, (net.bytes_recv - lastNet.bytes_recv) / dt / 1024);
    upKb = Math.max(0, (net.bytes_sent - lastNet.bytes_sent) / dt / 1024);
  }
  lastNet = net;
  lastTs = ts;
  if (el("netDown")) el("netDown").textContent = downKb.toFixed(1);
  if (el("netUp")) el("netUp").textContent = upKb.toFixed(1);

  push("cpu", cpuPct);
  push("ram", ram.percent ?? 0);
  push("gpu", gpuPct);
  push("netDown", downKb);
  push("netUp", upKb);

  renderDisks(data.disk || []);
  updateDensity(cpuPct, downKb);
  drawHistory(el("histCanvas"));
  drawArea(el("areaCanvas"));

  if (el("osLine")) {
    el("osLine").textContent = `${data.hostname || ""} · ${data.os || ""} · ${cpu.cores_logical || "?"} threads`;
  }
  if (el("statusDot")) el("statusDot").className = "dot";
  if (el("livePill")) {
    el("livePill").classList.remove("off");
    el("livePill").innerHTML = "<i></i> LIVE";
  }
}

function offline() {
  if (el("livePill")) {
    el("livePill").classList.add("off");
    el("livePill").innerHTML = "<i></i> OFF";
  }
  if (el("osLine")) el("osLine").textContent = "API metrics offline";
  if (el("statusDot")) el("statusDot").className = "dot bad";
}

async function resolveMetricsUrl() {
  const a = api();
  try {
    if (a?.dashboard?.get_metrics_url) {
      const res = await a.dashboard.get_metrics_url();
      if (res?.ok && res.url) return String(res.url);
    }
  } catch (_) {}
  try {
    if (window.PC_COMMAND_METRICS_URL) return String(window.PC_COMMAND_METRICS_URL);
  } catch (_) {}
  return "";
}

async function tick() {
  if (!metricsUrl) {
    offline();
    return;
  }
  try {
    const res = await fetch(metricsUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("bad");
    apply(await res.json());
  } catch {
    offline();
  }
}

function clock() {
  const c = el("clock");
  if (c) c.textContent = new Date().toLocaleTimeString("fr-FR", { hour12: false });
}

function initDensity() {
  const density = el("densityMap");
  if (!density || density.childElementCount) return;
  for (let i = 0; i < 128; i++) {
    const s = document.createElement("span");
    if (i % 3 === 0) s.classList.add("cyan");
    s.style.setProperty("--o", String(0.08 + Math.random() * 0.2));
    density.appendChild(s);
  }
}

async function mountTiles() {
  const a = api();
  let modules = [];
  try {
    if (a?.dashboard?.list_modules) {
      const res = await a.dashboard.list_modules();
      modules = (res && res.modules) || [];
    }
  } catch (_) {}

  if (!modules.length) modules = FALLBACK_MODULES;
  else {
    modules = modules.map((m) => ({
      ...m,
      ico: ICO[m.id] || m.ico || "▪",
      desc: m.desc || FALLBACK_MODULES.find((f) => f.id === m.id)?.desc || "",
    }));
  }

  const tiles = el("tileGrid");
  if (!tiles) return;
  tiles.innerHTML = modules
    .map(
      (m) => `
      <button type="button" class="hub-tile" data-open="${esc(m.id)}">
        <span class="hub-tile-ico" aria-hidden="true">${esc(m.ico || "▪")}</span>
        <strong>${esc(m.label)}</strong>
        <span>${esc(m.desc || "")}</span>
      </button>`
    )
    .join("");

  tiles.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-open]");
    if (!btn) return;
    const id = btn.getAttribute("data-open");
    const open = SHOW_VIEW();
    if (id && typeof open === "function") open(id);
  });
}

export function unmount() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  metricsUrl = "";
  lastNet = null;
  lastTs = null;
  for (const k of Object.keys(hist)) hist[k] = [];
}

export async function mount(root) {
  unmount();
  root.innerHTML = metricsMarkup();
  initDensity();

  const status = el("dashStatus");
  metricsUrl = await resolveMetricsUrl();
  if (metricsUrl) {
    try {
      window.PC_COMMAND_METRICS_URL = metricsUrl;
    } catch (_) {}
    if (status) status.textContent = "Lecture locale · métriques live · aucune donnée envoyée hors machine.";
  } else if (status) {
    status.textContent = "Serveur metrics indisponible — tuiles modules toujours accessibles.";
  }

  await mountTiles();

  clock();
  clockTimer = setInterval(clock, 1000);
  await tick();
  tickTimer = setInterval(tick, 1000);
}
