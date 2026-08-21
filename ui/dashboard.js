/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * Hub Accueil — Filament Void Glow (dash-prop · gauge-card).
 * Legacy cyber Accueil (Throughput / density-map) removed.
 */
const HUB_LABEL = "Network";
const HUB_BLURB = "PC Command — lecture seule · zéro mutator";
const SHOW_VIEW = () => window.HubReseau?.showView || window.HubShell?.showView;

const FALLBACK_MODULES = [
  { id: "netadmin", label: "NetAdmin", desc: "Adaptateurs réseau · fichier hosts · règles pare-feu", ico: "⌬" },
  { id: "netmap", label: "NetMap", desc: "Connexions TCP/UDP · ping · proxy · partages", ico: "⌖" },
  { id: "roadway", label: "RoadWay-X", desc: "Trafic live · alertes heuristiques · DNS · confiance", ico: "↗" },
  { id: "wifikey", label: "WifiKey", desc: "Profils WLAN et clés de sécurité", ico: "≋" },
];
const ICO = Object.fromEntries(FALLBACK_MODULES.map((m) => [m.id, m.ico]));

const HISTORY = 60;
const ARC_LEN = 141.37;

let metricsUrl = "";
let tickTimer = null;
let clockTimer = null;
const hist = { cpu: [], ram: [], gpu: [], netUp: [], netDown: [] };
let peakDn = 0;
let peakUp = 0;
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

function gaugeCard(kind, lab) {
  return `
  <article class="gauge-card" id="g-${kind}" style="--gc:var(--ok,#3dd68c)">
    <div class="arc-wrap">
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path class="trk" d="M15 58 A45 45 0 0 1 105 58"/>
        <path class="arc" id="${kind}Arc" d="M15 58 A45 45 0 0 1 105 58"
          stroke-dasharray="${ARC_LEN}" stroke-dashoffset="${ARC_LEN}"/>
      </svg>
      <span class="val" id="${kind}Val">—</span>
    </div>
    <div class="g-meta">
      <p class="lab">${lab}</p>
      <p class="name" id="${kind}Name">—</p>
      <p class="sub" id="${kind}Sub">—</p>
      <p class="temp" id="${kind}Temp" hidden><span class="t-dot"></span><span class="t-txt"></span></p>
      <svg class="spark-mini" id="${kind}Spark" viewBox="0 0 120 32" aria-hidden="true">
        <path class="area" d=""/>
        <polyline class="ln" points=""/>
      </svg>
    </div>
  </article>`;
}

function metricsMarkup() {
  return `
  <div class="hub-dash-root">
    <header class="hub-page-header hub-dash-head">
      <div>
        <p class="kicker">Hub ${esc(HUB_LABEL)} · Void Glow</p>
        <h1>Accueil</h1>
        <p>${esc(HUB_BLURB)}</p>
      </div>
      <div class="hub-dash-live">
        <time id="clock">—</time>
        <span class="live-pill off" id="livePill"><i></i> OFF</span>
      </div>
    </header>

    <div class="dash-prop">
      <section class="gauges-block" aria-label="CPU RAM GPU">
        <div class="gauges">
          ${gaugeCard("cpu", "CPU")}
          ${gaugeCard("ram", "RAM")}
          ${gaugeCard("gpu", "GPU")}
        </div>
      </section>
      <section class="mid-row" aria-label="Uptime et processus">
        <article class="kpi kpi-up">
          <small>Uptime</small>
          <b id="uptime">—</b>
          <em id="hostname">host</em>
          <span class="since" id="since">—</span>
        </article>
        <article class="kpi">
          <small>Processus</small>
          <b id="procCount">—</b>
          <em>actifs</em>
        </article>
      </section>
      <section class="bottom-row" aria-label="Réseau et disques">
        <article class="kpi kpi-net">
          <small><span class="live-dot"></span>Trafic · live</small>
          <div class="net-live">
            <div class="rate dn">↓ <b id="netDn">0</b><span>KB/s</span></div>
            <div class="rate up">↑ <b id="netUp">0</b><span>KB/s</span></div>
          </div>
          <p class="net-peak" id="netPeak">pic 60s · ↓ — · ↑ —</p>
          <svg class="net-spark" id="netSpark" viewBox="0 0 120 36" aria-hidden="true">
            <path class="area-dn" d=""/>
            <polyline class="ln-dn" points=""/>
            <path class="area-up" d=""/>
            <polyline class="ln-up" points=""/>
          </svg>
        </article>
        <article class="kpi kpi-disk">
          <div class="disk-head">
            <small>Disques</small>
            <b class="count" id="diskCount">— vol.</b>
          </div>
          <div class="disk-stack" id="diskStack">
            <div class="disk-empty">Chargement…</div>
          </div>
        </article>
      </section>
    </div>

    <section class="hub-dash-modules" aria-label="Accès rapide">
      <h2 class="hub-section-title sec">Modules</h2>
      <div class="mods" id="tileGrid"></div>
      <p class="hub-status" id="dashStatus"></p>
    </section>
  </div>`;
}

function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  return `${h}h ${m}m`;
}

function push(key, val) {
  hist[key].push(val == null || Number.isNaN(val) ? 0 : Number(val));
  while (hist[key].length > HISTORY) hist[key].shift();
}

function levelTone(pct) {
  if (pct < 45) return { cls: "ok", color: "#3dd68c" };
  if (pct < 75) return { cls: "warn", color: "#e0a84a" };
  if (pct < 90) return { cls: "hot", color: "#e07020" };
  return { cls: "crit", color: "#e03545" };
}

function setGauge(kind, pct, name, sub, tempC) {
  const tone = levelTone(pct);
  const card = el(`g-${kind}`);
  if (card) {
    card.className = `gauge-card ${tone.cls}`;
    card.style.setProperty("--gc", tone.color);
  }
  const arc = el(`${kind}Arc`);
  if (arc) {
    const offset = ARC_LEN * (1 - Math.min(100, Math.max(0, pct)) / 100);
    arc.style.stroke = tone.color;
    arc.setAttribute("stroke-dashoffset", String(offset));
  }
  if (el(`${kind}Val`)) el(`${kind}Val`).textContent = `${Math.round(pct)}%`;
  if (el(`${kind}Name`)) el(`${kind}Name`).textContent = name || "—";
  if (el(`${kind}Sub`)) el(`${kind}Sub`).textContent = sub || "—";
  const temp = el(`${kind}Temp`);
  if (temp) {
    if (tempC != null && Number.isFinite(tempC)) {
      temp.hidden = false;
      temp.style.setProperty("--tc", tone.color);
      const t = temp.querySelector(".t-txt");
      if (t) t.textContent = `${Math.round(tempC)}°C`;
    } else {
      temp.hidden = true;
    }
  }
  drawSpark(kind, hist[kind], tone.color);
}

function drawSpark(kind, data, color) {
  const svg = el(`${kind}Spark`);
  if (!svg || !data || data.length < 2) return;
  const w = 120;
  const h = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (Math.min(100, v) / 100) * (h - 4) - 2;
    return [x, y];
  });
  const ln = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area =
    `M0,${h} ` +
    pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") +
    ` L${w},${h} Z`;
  const path = svg.querySelector(".area");
  const poly = svg.querySelector(".ln");
  if (path) {
    path.setAttribute("d", area);
    path.style.fill = color;
  }
  if (poly) {
    poly.setAttribute("points", ln);
    poly.style.stroke = color;
  }
}

function drawNetSpark() {
  const svg = el("netSpark");
  if (!svg) return;
  const dn = hist.netDown;
  const up = hist.netUp;
  if (dn.length < 2) return;
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...dn, ...up, peakDn, peakUp);
  function series(arr) {
    return arr.map((v, i) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - (Math.min(max, v) / max) * (h - 4) - 2;
      return [x, y];
    });
  }
  const pd = series(dn);
  const pu = series(up);
  const area = (pts) =>
    `M0,${h} ` + pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + ` L${w},${h} Z`;
  const ln = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  svg.querySelector(".area-dn")?.setAttribute("d", area(pd));
  svg.querySelector(".ln-dn")?.setAttribute("points", ln(pd));
  svg.querySelector(".area-up")?.setAttribute("d", area(pu));
  svg.querySelector(".ln-up")?.setAttribute("points", ln(pu));
}

function renderDisks(disks) {
  const stack = el("diskStack");
  const count = el("diskCount");
  if (!stack) return;
  const rows = Array.isArray(disks) ? disks : [];
  if (count) count.textContent = `${rows.length} vol.`;
  if (!rows.length) {
    stack.innerHTML = `<div class="disk-empty">Aucun volume</div>`;
    return;
  }
  stack.innerHTML = rows
    .slice(0, 8)
    .map((d) => {
      const pct = Math.round(d.percent ?? d.used_percent ?? 0);
      let cls = "ok";
      if (pct >= 90) cls = "crit";
      else if (pct >= 75) cls = "warn";
      if (d.bus === "USB" || d.kind === "removable") cls += " usb";
      const letter = esc((d.device || d.mount || d.letter || "?").replace(/\\+$/, ""));
      const title = esc(d.label || d.name || letter);
      return `<div class="drow ${cls}"><span class="ltr">${letter}</span><div class="dbar" title="${title}"><i style="width:${pct}%"></i></div><span class="pct">${pct}%</span></div>`;
    })
    .join("");
}

function apply(data) {
  const cpu = data.cpu || {};
  const ram = data.ram || {};
  const gpu = data.gpu || {};
  const load = data.load || {};
  const cpuPct = Number(cpu.percent ?? load.score ?? 0);
  const ramPct = Number(ram.percent ?? 0);
  const gpuAvail = !!gpu.available;
  const gpuPct = gpuAvail ? Number(gpu.load_percent ?? 0) : 0;

  push("cpu", cpuPct);
  push("ram", ramPct);
  push("gpu", gpuPct);

  const cores = `${cpu.cores_physical || "?"}c / ${cpu.cores_logical || "?"}t`;
  const loadLabel = (load.label || "").toUpperCase() || "—";
  setGauge("cpu", cpuPct, cpu.model || "CPU", `${cores} · ${loadLabel}`, cpu.temp_c ?? cpu.temperature);
  setGauge(
    "ram",
    ramPct,
    `${ram.used_gb ?? "—"} / ${ram.total_gb ?? "—"} Go`,
    "working set",
    null
  );
  setGauge(
    "gpu",
    gpuPct,
    gpu.name || "GPU",
    gpuAvail
      ? `VRAM ${gpu.memory_used_mb ?? "—"}/${gpu.memory_total_mb ?? "—"} MB`
      : data.degraded?.gpu_note || "N/A",
    gpu.temp_c ?? gpu.temperature
  );

  if (el("procCount")) el("procCount").textContent = (data.procs ?? 0).toLocaleString("fr-FR");
  if (el("uptime")) el("uptime").textContent = fmtUptime(data.uptime_sec ?? 0);
  if (el("hostname")) el("hostname").textContent = data.hostname || "host";
  if (el("since")) {
    const boot = data.boot_time || data.boot_iso || "";
    el("since").textContent = boot ? `boot ${boot}` : (data.os || "—");
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
  peakDn = Math.max(peakDn, downKb);
  peakUp = Math.max(peakUp, upKb);
  push("netDown", downKb);
  push("netUp", upKb);
  if (el("netDn")) el("netDn").textContent = downKb.toFixed(0);
  if (el("netUp")) el("netUp").textContent = upKb.toFixed(0);
  if (el("netPeak")) el("netPeak").textContent = `pic 60s · ↓ ${peakDn.toFixed(0)} · ↑ ${peakUp.toFixed(0)}`;
  drawNetSpark();
  renderDisks(data.disk || []);

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
      <button type="button" class="tile" data-open="${esc(m.id)}">
        <span class="tile-k">${esc(m.ico || "▪")}</span>
        <strong>${esc(m.label)}</strong>
        <span class="tile-b">${esc(m.desc || "")}</span>
        <span class="go">Ouvrir →</span>
        <span class="fil"></span>
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
  peakDn = 0;
  peakUp = 0;
  for (const k of Object.keys(hist)) hist[k] = [];
}

export async function mount(root) {
  unmount();
  root.innerHTML = metricsMarkup();
  const status = el("dashStatus");
  if (status) status.textContent = "Lecture locale · métriques live · aucune donnée envoyée hors machine.";
  await mountTiles();
  clock();
  clockTimer = setInterval(clock, 1000);
  metricsUrl = await resolveMetricsUrl();
  await tick();
  tickTimer = setInterval(tick, 1000);
}
