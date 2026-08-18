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

function dismissUpdateBanner() {
  const el = document.getElementById("hubUpdateBanner");
  if (el) el.remove();
}

function showUpdateBanner(info) {
  dismissUpdateBanner();
  if (!info || !info.updateAvailable) return;
  const main = document.getElementById("hubMain");
  if (!main) return;
  const bar = document.createElement("div");
  bar.id = "hubUpdateBanner";
  bar.className = "hub-update-banner";
  bar.setAttribute("role", "status");
  const msg =
    info.message ||
    `Mise à jour disponible : ${info.local || "?"} → ${info.remote || "?"}`;
  bar.innerHTML =
    `<div class="hub-update-text"><strong>Mise à jour disponible</strong><span></span></div>` +
    `<div class="hub-update-actions">` +
    `<button type="button" class="hub-update-btn" id="hubUpdateApply">Mettre à jour maintenant</button>` +
    `<button type="button" class="hub-update-btn hub-update-btn-secondary" id="hubUpdateOpen">Ouvrir Install-Easy</button>` +
    `<button type="button" class="hub-update-dismiss" id="hubUpdateDismiss" aria-label="Fermer">×</button>` +
    `</div>`;
  bar.querySelector(".hub-update-text span").textContent = msg;
  main.insertBefore(bar, main.firstChild);
  document.getElementById("hubUpdateDismiss")?.addEventListener("click", dismissUpdateBanner);
  document.getElementById("hubUpdateOpen")?.addEventListener("click", async () => {
    const a = apiRoot();
    try {
      if (a && typeof a.open_update === "function") await a.open_update();
    } catch (_) {}
  });

  document.getElementById("hubUpdateApply")?.addEventListener("click", async () => {
    const a = apiRoot();
    const btn = document.getElementById("hubUpdateApply");
    if (btn) { btn.disabled = true; btn.textContent = "Téléchargement…"; }
    try {
      if (a && typeof a.apply_update === "function") {
        const r = await a.apply_update();
        if (r?.ok) {
          if (btn) btn.textContent = r.restartRequired ? "Redémarrage…" : "OK — relance le hub";
          if (r.restartRequired) {
            try { window.close(); } catch (_) {}
          }
        } else if (btn) {
          btn.disabled = false;
          btn.textContent = "Réessayer";
          alert(r?.error || "Mise à jour échouée");
        }
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Réessayer"; }
    }
  });

}

async function loadVersionAndUpdates() {
  const a = apiRoot();
  if (!a) return;
  try {
    if (typeof a.get_app_version === "function") {
      const v = await a.get_app_version();
      if (v?.version) appVersion = String(v.version);
    }
  } catch (_) {}
  try {
    if (typeof a.check_for_update === "function") {
      const u = await a.check_for_update();
      if (u?.ok && u.updateAvailable) {
        showUpdateBanner(u);
        if (u.canSelfUpdate && u.autoUpdate !== false && typeof a.apply_update === "function") {
          const btn = document.getElementById("hubUpdateApply");
          if (btn) { btn.disabled = true; btn.textContent = "Téléchargement…"; }
          const r = await a.apply_update();
          if (r?.ok) {
            if (btn) btn.textContent = r.restartRequired ? "Redémarrage…" : "OK — relance le hub";
            if (r.restartRequired) {
              try { window.close(); } catch (_) {}
            }
          } else if (btn) {
            btn.disabled = false;
            btn.textContent = "Réessayer";
          }
        }
      }
    }
  } catch (_) {}
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
  await loadVersionAndUpdates();
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
