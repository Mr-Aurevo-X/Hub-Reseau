/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * Hub Accueil Réseau — Filament Void Glow (dash-prop · gauge-card).
 * Hero Down/Up only · TCP/NIC KPIs · adapters — lecture seule.
 */
import { locale, t } from "./i18n.js";

const SHOW_VIEW = () => window.HubReseau?.showView || window.HubShell?.showView;

function moduleCatalog() {
  return [
    { id: "netadmin", label: "NetAdmin", desc: t("modNetAdminDesc"), ico: "⌬" },
    { id: "netmap", label: "NetMap", desc: t("modNetMapDesc"), ico: "⌖" },
    { id: "roadway", label: "Traffic", desc: t("modTrafficDesc"), ico: "↗" },
    { id: "wifikey", label: "WifiKey", desc: t("modWifiKeyDesc"), ico: "≋" },
  ];
}

const ICO = { netadmin: "⌬", netmap: "⌖", roadway: "↗", wifikey: "≋" };

const HISTORY = 60;
const ARC_LEN = 141.37;
const KPI_MS = 4000;

let metricsUrl = "";
let tickTimer = null;
let kpiTimer = null;
let clockTimer = null;
const hist = { down: [], up: [], netUp: [], netDown: [] };
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
        <h1>${esc(t("dashTitle"))}</h1>
        <p>${esc(t("dashBlurb"))}</p>
      </div>
      <div class="hub-dash-live">
        <time id="clock">—</time>
        <span class="live-pill off" id="livePill"><i></i> ${esc(t("dashOff"))}</span>
      </div>
    </header>

    <div class="dash-prop">
      <section class="gauges-block" aria-label="${esc(t("dashGaugesAria"))}">
        <div class="gauges gauges-2">
          ${gaugeCard("down", esc(t("dashDown")))}
          ${gaugeCard("up", esc(t("dashUp")))}
        </div>
      </section>
      <section class="mid-row" aria-label="${esc(t("dashTcpNicAria"))}">
        <article class="kpi">
          <small>${esc(t("dashTcp"))}</small>
          <b id="tcpCount">—</b>
          <em>${esc(t("dashTcpEm"))}</em>
        </article>
        <article class="kpi">
          <small>${esc(t("dashNicUp"))}</small>
          <b id="nicUp">—</b>
          <em id="nicNames">—</em>
        </article>
      </section>
      <section class="bottom-row" aria-label="${esc(t("dashTrafficAdaptersAria"))}">
        <article class="kpi kpi-net">
          <small><span class="live-dot"></span>${esc(t("dashTrafficLive"))}</small>
          <div class="net-live">
            <div class="rate dn">↓ <b id="netDn">0</b><span>KB/s</span></div>
            <div class="rate up">↑ <b id="netUp">0</b><span>KB/s</span></div>
          </div>
          <p class="net-peak" id="netPeak">${esc(t("dashPeak", { dn: "—", up: "—" }))}</p>
          <svg class="net-spark" id="netSpark" viewBox="0 0 120 36" aria-hidden="true">
            <path class="area-dn" d=""/>
            <polyline class="ln-dn" points=""/>
            <path class="area-up" d=""/>
            <polyline class="ln-up" points=""/>
          </svg>
        </article>
        <article class="kpi kpi-disk">
          <div class="disk-head">
            <small>${esc(t("dashAdapters"))}</small>
            <b class="count" id="adapterCount">—</b>
          </div>
          <div class="disk-stack" id="adapterStack">
            <div class="disk-empty">${esc(t("dashAdaptersLoading"))}</div>
          </div>
        </article>
      </section>
    </div>

    <section class="hub-dash-modules" aria-label="${esc(t("dashQuickAria"))}">
      <h2 class="hub-section-title sec">${esc(t("dashModules"))}</h2>
      <div class="mods" id="tileGrid"></div>
      <p class="hub-status" id="dashStatus"></p>
    </section>
  </div>`;
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

function setGauge(kind, pct, name, sub, tempC, valText) {
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
  if (el(`${kind}Val`)) {
    el(`${kind}Val`).textContent = valText != null ? String(valText) : `${Math.round(pct)}%`;
  }
  if (el(`${kind}Name`)) el(`${kind}Name`).textContent = name || "—";
  if (el(`${kind}Sub`)) el(`${kind}Sub`).textContent = sub || "—";
  const temp = el(`${kind}Temp`);
  if (temp) {
    if (tempC != null && Number.isFinite(tempC)) {
      temp.hidden = false;
      temp.style.setProperty("--tc", tone.color);
      const tEl = temp.querySelector(".t-txt");
      if (tEl) tEl.textContent = `${Math.round(tempC)}°C`;
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
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (Math.min(max, v) / max) * (h - 4) - 2;
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

function fmtRate(kb) {
  if (kb >= 1024) {
    return { text: (kb / 1024).toFixed(1), unit: "MB/s", labelKb: `${kb.toFixed(0)} KB/s` };
  }
  return { text: kb < 10 ? kb.toFixed(1) : kb.toFixed(0), unit: "KB/s", labelKb: `${kb.toFixed(0)} KB/s` };
}

function ratePct(rateKb, peakKb) {
  const denom = Math.max(peakKb, rateKb, 256);
  return Math.min(100, (rateKb / denom) * 100);
}

function renderAdapters(adapters, nicUp, nicNames) {
  const stack = el("adapterStack");
  const count = el("adapterCount");
  if (!stack) return;
  let rows = Array.isArray(adapters) ? adapters : [];
  if (!rows.length && nicNames) {
    rows = String(nicNames)
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ name, status: "Up" }));
  }
  if (count) {
    const up = nicUp != null ? Number(nicUp) : rows.filter((a) => /up/i.test(String(a.status || ""))).length;
    count.textContent = t("dashAdaptersUp", { n: up });
  }
  if (!rows.length) {
    stack.innerHTML = `<div class="disk-empty">${esc(t("dashAdaptersEmpty"))}</div>`;
    return;
  }
  stack.innerHTML = rows
    .slice(0, 8)
    .map((a) => {
      const name = esc(a.name || a.Name || "?");
      const st = String(a.status || a.Status || "—");
      const up = /up/i.test(st);
      const cls = up ? "up" : "down";
      const label = up ? "Up" : /down/i.test(st) ? "Down" : esc(st);
      return `<div class="arow ${cls}"><span class="aname" title="${name}">${name}</span><span class="astat">${label}</span></div>`;
    })
    .join("");
}

function applyMetrics(data) {
  let downKb = 0;
  let upKb = 0;
  const net = data.network || {};
  const ts = data.ts || Date.now() / 1000;
  if (lastNet && lastTs) {
    const dt = Math.max(ts - lastTs, 1e-3);
    downKb = Math.max(0, (Number(net.bytes_recv) - Number(lastNet.bytes_recv)) / dt / 1024);
    upKb = Math.max(0, (Number(net.bytes_sent) - Number(lastNet.bytes_sent)) / dt / 1024);
  }
  lastNet = net;
  lastTs = ts;
  peakDn = Math.max(peakDn, downKb);
  peakUp = Math.max(peakUp, upKb);
  push("netDown", downKb);
  push("netUp", upKb);
  push("down", ratePct(downKb, peakDn));
  push("up", ratePct(upKb, peakUp));

  const dn = fmtRate(downKb);
  const up = fmtRate(upKb);
  const peakDnF = fmtRate(peakDn);
  const peakUpF = fmtRate(peakUp);
  setGauge(
    "down",
    ratePct(downKb, peakDn),
    dn.unit,
    t("dashPeakGauge", { val: `${peakDnF.text} ${peakDnF.unit}` }),
    null,
    dn.text
  );
  setGauge(
    "up",
    ratePct(upKb, peakUp),
    up.unit,
    t("dashPeakGauge", { val: `${peakUpF.text} ${peakUpF.unit}` }),
    null,
    up.text
  );

  if (el("netDn")) el("netDn").textContent = downKb.toFixed(0);
  if (el("netUp")) el("netUp").textContent = upKb.toFixed(0);
  if (el("netPeak")) {
    el("netPeak").textContent = t("dashPeak", { dn: peakDn.toFixed(0), up: peakUp.toFixed(0) });
  }
  drawNetSpark();

  if (el("livePill")) {
    el("livePill").classList.remove("off");
    el("livePill").innerHTML = `<i></i> ${esc(t("dashLive"))}`;
  }
}

function applyKpis(k) {
  if (!k || !k.ok) return;
  if (el("tcpCount")) {
    el("tcpCount").textContent =
      k.tcpEstablished != null ? Number(k.tcpEstablished).toLocaleString(locale()) : "—";
  }
  if (el("nicUp")) el("nicUp").textContent = k.nicUp != null ? String(k.nicUp) : "—";
  if (el("nicNames")) el("nicNames").textContent = k.nicNames || "—";
  renderAdapters(k.adapters, k.nicUp, k.nicNames);
  if (el("livePill") && !metricsUrl) {
    el("livePill").classList.remove("off");
    el("livePill").innerHTML = `<i></i> ${esc(t("dashLive"))}`;
  }
}

function offline() {
  if (el("livePill")) {
    el("livePill").classList.add("off");
    el("livePill").innerHTML = `<i></i> ${esc(t("dashOff"))}`;
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

async function tickMetrics() {
  if (!metricsUrl) {
    offline();
    return;
  }
  try {
    const res = await fetch(metricsUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("bad");
    applyMetrics(await res.json());
  } catch {
    offline();
  }
}

async function tickKpis() {
  const a = api();
  try {
    if (a?.dashboard?.get_kpis) {
      applyKpis(await a.dashboard.get_kpis());
    }
  } catch (_) {}
}

function clock() {
  const c = el("clock");
  if (c) c.textContent = new Date().toLocaleTimeString(locale(), { hour12: false });
}

async function mountTiles() {
  const a = api();
  const fallback = moduleCatalog();
  let modules = [];
  try {
    if (a?.dashboard?.list_modules) {
      const res = await a.dashboard.list_modules();
      modules = (res && res.modules) || [];
    }
  } catch (_) {}
  if (!modules.length) modules = fallback;
  else {
    modules = modules.map((m) => {
      const fb = fallback.find((f) => f.id === m.id);
      return {
        ...m,
        ico: ICO[m.id] || m.ico || "▪",
        label: fb?.label || m.label,
        desc: fb?.desc || m.desc || "",
      };
    });
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
        <span class="go">${esc(t("dashOpen"))}</span>
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
  if (kpiTimer) {
    clearInterval(kpiTimer);
    kpiTimer = null;
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
  if (status) status.textContent = t("dashStatus");
  await mountTiles();
  clock();
  clockTimer = setInterval(clock, 1000);
  metricsUrl = await resolveMetricsUrl();
  await tickMetrics();
  await tickKpis();
  tickTimer = setInterval(tickMetrics, 1000);
  kpiTimer = setInterval(tickKpis, KPI_MS);
}
