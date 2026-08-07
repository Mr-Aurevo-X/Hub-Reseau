/**
 * Hub-Reseau shell — Dashboard boot + lazy modules + sidebar collapsible.
 */
const HUB_NAME = "L'Atelier PC Command — Réseau";

const TITLES = {
  dashboard: HUB_NAME,
  netadmin: `${HUB_NAME} [NetAdmin]`,
  netmap:   `${HUB_NAME} [NetMap]`,
  roadway:  `${HUB_NAME} [RoadWay-X]`,
  wifikey:  `${HUB_NAME} [WifiKey]`,
};

const cache = Object.create(null);
let currentView    = "dashboard";
let currentSegment = "";

function apiRoot() {
  return window.pywebview && window.pywebview.api;
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
  const a = apiRoot();
  try {
    if (a && typeof a.set_window_title === "function") {
      await a.set_window_title(title);
    }
  } catch (_) {}
}

async function setTitle(viewId, segmentLabel) {
  currentSegment = segmentLabel || "";
  let title = TITLES[viewId] || TITLES.dashboard;
  if (segmentLabel && viewId !== "dashboard") {
    title = `${HUB_NAME} [${segmentLabel}]`;
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
}

async function boot() {
  wireSidebar();
  await waitApi();
  await showView("dashboard");
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
