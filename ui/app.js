/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * Hub-Reseau shell — Dashboard boot + lazy modules + sidebar collapsible.
 */
const HUB_NAME = "PC Command | Network";

const TITLES = {
  dashboard: HUB_NAME,
  netadmin: `${HUB_NAME} [NetAdmin]`,
  netmap:   `${HUB_NAME} [NetMap]`,
  roadway:  `${HUB_NAME} [RoadWay-X]`,
  wifikey:  `${HUB_NAME} [WifiKey]`,
};

const cache = Object.create(null);
let currentView    = "dashboard";
let currentDash    = null;
let currentSegment = "";
let appVersion = "";

function apiRoot() {
  return window.pywebview && window.pywebview.api;
}

function syncChromeTitle(title) {
  try {
    document.body && document.body.setAttribute("data-tool-title", title);
    document.body && document.body.setAttribute("data-tool-subtitle", "");
    const el = document.getElementById("toolTitleText");
    if (el) {
      el.dataset.locked = "1";
      el.textContent = title;
    }
  } catch (_) {}
}

async function waitApi(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const a = apiRoot();
    if (a) return a;
    await new Promise((r) => setTimeout(r, 40));
  }
  return apiRoot();
}

async function applyTitle(title) {
  document.title = title;
  syncChromeTitle(title);
  const a = apiRoot();
  try {
    if (a && typeof a.set_window_title === "function") {
      await a.set_window_title(title);
    }
  } catch (_) {}
}


function homeTitle() {
  return appVersion ? `${HUB_NAME} [${appVersion}]` : HUB_NAME;
}

async function setTitle(viewId, segmentLabel) {
  currentSegment = segmentLabel || "";
  let title;
  if (viewId === "dashboard" || !viewId) {
    title = homeTitle();
  } else if (segmentLabel) {
    title = `${HUB_NAME} [${segmentLabel}]`;
  } else {
    title = TITLES[viewId] || homeTitle();
  }
  await applyTitle(title);
}

function setActiveNav(viewId) {
  document.querySelectorAll(".hub-nav-item").forEach((btn) => {
    const on = btn.dataset.view === viewId;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-current", on ? "page" : "false");
  });
}

function replayEnter(el) {
  el.classList.remove("is-enter");
  void el.offsetWidth;
  el.classList.add("is-enter");
}

async function loadAppVersion() {
  const a = apiRoot();
  if (!a) return;
  try {
    if (typeof a.get_app_version === "function") {
      const v = await a.get_app_version();
      if (v?.version) appVersion = String(v.version);
    }
  } catch (_) {}
  try {
    if (typeof a.check_latest_release === "function") {
      const u = await a.check_latest_release();
      if (u?.ok && u.updateAvailable) showReleaseBanner(u);
    }
  } catch (_) {}
}

function dismissReleaseBanner() {
  const el = document.getElementById("hubReleaseBanner");
  if (el) el.remove();
}

function showReleaseBanner(info) {
  dismissReleaseBanner();
  if (!info || !info.updateAvailable) return;
  const main = document.getElementById("hubMain");
  if (!main) return;
  const remote = String(info.remote || "");
  try {
    if (sessionStorage.getItem("hubReleaseDismissed") === remote) return;
  } catch (_) {}
  const bar = document.createElement("div");
  bar.id = "hubReleaseBanner";
  bar.className = "hub-release-banner";
  bar.setAttribute("role", "status");
  const msg = info.message || `Nouvelle version ${info.remote || ""} disponible`;
  bar.innerHTML =
    '<div class="hub-release-text"><strong>Nouvelle version</strong><span></span></div>' +
    '<div class="hub-release-actions">' +
    '<button type="button" class="hub-release-btn" id="hubReleaseOpen">Ouvrir la release</button>' +
    '<button type="button" class="hub-release-dismiss" id="hubReleaseDismiss" aria-label="Fermer">×</button>' +
    "</div>";
  bar.querySelector(".hub-release-text span").textContent = msg;
  main.insertBefore(bar, main.firstChild);
  document.getElementById("hubReleaseDismiss")?.addEventListener("click", () => {
    try {
      sessionStorage.setItem("hubReleaseDismissed", remote);
    } catch (_) {}
    dismissReleaseBanner();
  });
  document.getElementById("hubReleaseOpen")?.addEventListener("click", async () => {
    const api = apiRoot();
    try {
      if (api && typeof api.open_release_page === "function") {
        await api.open_release_page(info.releaseUrl || "");
      }
    } catch (_) {}
  });
}

async function showView(viewId) {
  const id = viewId || "dashboard";
  const root = document.getElementById("hubView");
  if (!root) return;

  currentView    = id;
  currentSegment = "";
  setActiveNav(id);
  await setTitle(id);
  root.dataset.view = id;

  if (currentDash && typeof currentDash.unmount === "function") {
    try { currentDash.unmount(); } catch (_) {}
    currentDash = null;
  }
  root.innerHTML = "";

  if (id === "dashboard") {
    currentDash = await import("./dashboard.js");
    await currentDash.mount(root);
  } else {
    if (!cache[id]) {
      cache[id] = await import(`./modules/${id}.js`);
    }
    await cache[id].mount(root, { openModule: showView });
  }
  replayEnter(root);
}

function wireSidebar() {
  const shell = document.getElementById("hubShell");
  const btn = document.getElementById("btnCollapse");

  document.getElementById("hubNav")?.addEventListener("click", (ev) => {
    const btnNav = ev.target.closest(".hub-nav-item");
    if (!btnNav) return;
    const view = btnNav.dataset.view;
    if (view) showView(view);
  });

  btn?.addEventListener("click", () => {
    const collapsed = shell.classList.toggle("is-collapsed");
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.title = collapsed ? "Étendre la barre" : "Réduire la barre";
    const label = btn.querySelector(".hub-nav-label");
    if (label) label.textContent = collapsed ? "Étendre" : "Réduire";
    const ico = btn.querySelector(".hub-nav-ico");
    if (ico) ico.textContent = collapsed ? "▸" : "◂";
  });

  document.querySelector(".hub-support")?.addEventListener("click", async (ev) => {
    const supportBtn = ev.target.closest("[data-support]");
    if (!supportBtn) return;
    const kind = supportBtn.dataset.support;
    const a = apiRoot();
    try {
      if (a && typeof a.open_support_url === "function") {
        await a.open_support_url(kind);
      }
    } catch (_) {}
  });
}

async function waitPywebviewReady(timeoutMs = 8000) {
  if (window.pywebview && window.pywebview.api) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    window.addEventListener(
      "pywebviewready",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

function showBootError(err) {
  const root = document.getElementById("hubView");
  if (!root) return;
  const msg = String((err && err.message) || err || "Erreur inconnue")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
  root.innerHTML =
    '<div class="hub-boot-error" role="alert" style="padding:1.5rem;color:#f5f5f5">' +
    "<strong>Erreur au démarrage</strong>" +
    `<p style="margin-top:0.5rem;opacity:0.85">${msg}</p></div>`;
}

async function boot() {
  try {
    wireSidebar();
    await waitPywebviewReady();
    await waitApi();
    await showView("dashboard");
    const bootView = (location.hash || "").replace(/^#/, "").trim();
    if (bootView && bootView !== "dashboard") await showView(bootView);
    void loadAppVersion();
  } catch (err) {
    console.error("[Hub boot]", err);
    showBootError(err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

window.HubShell  = { showView };
window.HubReseau = {
  showView,
  setSegmentTitle(label) {
    setTitle(currentView, label);
  },
};
