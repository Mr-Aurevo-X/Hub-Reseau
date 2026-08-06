/**
 * Hub-Reseau shell — Dashboard boot + lazy modules + sidebar collapsible.
 */
const TITLES = {
  dashboard: "L'Atelier PC — Réseau",
  netadmin: "L'Atelier PC — Réseau [NetAdmin]",
  netmap: "L'Atelier PC — Réseau [NetMap]",
  roadway: "L'Atelier PC — Réseau [RoadWay-X]",
  wifikey: "L'Atelier PC — Réseau [WifiKey]",
};

const cache = Object.create(null);

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

async function setTitle(viewId) {
  const title = TITLES[viewId] || TITLES.dashboard;
  document.title = title;
  const a = apiRoot();
  try {
    if (a && typeof a.set_window_title === "function") {
      await a.set_window_title(title);
    }
  } catch (_) {}
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

  setActiveNav(id);
  await setTitle(id);
  root.dataset.view = id;
  root.innerHTML = "";

  if (id === "dashboard") {
    const mod = await import("./dashboard.js");
    await mod.mount(root);
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

window.HubShell = { showView };
