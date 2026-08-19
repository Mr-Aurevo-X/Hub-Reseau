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

function dismissUpdateBanner() {
  const el = document.getElementById("hubUpdateBanner");
  if (el) el.remove();
}

function showUpdateBanner(info, opts) {
  dismissUpdateBanner();
  if (!info) return;
  const silent = !!(opts && opts.silent);
  const applying = !!(opts && opts.applying);
  const failed = !!(opts && opts.failed);
  const done = !!(opts && opts.done);
  if (!info.updateAvailable && !applying && !failed && !done && !info.needsAuth) return;
  const main = document.getElementById("hubMain");
  if (!main) return;
  const bar = document.createElement("div");
  bar.id = "hubUpdateBanner";
  bar.className = "hub-update-banner";
  bar.setAttribute("role", "status");
  let headline = "Mise à jour disponible";
  if (applying) headline = "Mise à jour…";
  else if (done) headline = "À jour";
  else if (failed || info.needsAuth) headline = "Échec de la mise à jour";
  const msg =
    info.message ||
    (applying
      ? `Téléchargement ${info.local || "?"} → ${info.remote || "?"}`
      : `Mise à jour disponible : ${info.local || "?"} → ${info.remote || "?"}`);
  const showManual = (!silent && !applying && !done) || failed || info.needsAuth;
  let actions = "";
  if (showManual) {
    actions = '<div class="hub-update-actions">';
    if (!info.needsAuth) {
      actions +=
        '<button type="button" class="hub-update-btn" id="hubUpdateApply">' +
        (failed ? "Réessayer" : "Mettre à jour maintenant") +
        "</button>";
    }
    actions +=
      '<button type="button" class="hub-update-btn hub-update-btn-secondary" id="hubUpdateOpen">Ouvrir Install-Easy</button>';
    if (!failed && !info.needsAuth && !silent) {
      actions +=
        '<button type="button" class="hub-update-dismiss" id="hubUpdateDismiss" aria-label="Fermer">×</button>';
    }
    actions += "</div>";
  }
  bar.innerHTML =
    '<div class="hub-update-text"><strong></strong><span></span></div>' + actions;
  bar.querySelector("strong").textContent = headline;
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
    await runHubApply(true);
  });
}

async function runHubApply(force) {
  const a = apiRoot();
  if (!a || typeof a.apply_update !== "function") return;
  showUpdateBanner(
    { updateAvailable: true, message: "Téléchargement…" },
    { silent: !force, applying: true }
  );
  try {
    const r = await a.apply_update(!!force);
    if (r?.skipped) {
      dismissUpdateBanner();
      return;
    }
    if (r?.ok) {
      const restart = !!r.restartRequired;
      showUpdateBanner(
        {
          updateAvailable: true,
          message: r.message || (restart ? "Redémarrage…" : "À jour"),
        },
        { silent: true, applying: restart, done: !restart }
      );
      if (restart) {
        try {
          window.close();
        } catch (_) {}
      }
    } else {
      showUpdateBanner(
        {
          updateAvailable: true,
          message: r?.error || "Échec",
          needsAuth: r?.action === "install_easy",
        },
        { failed: true }
      );
    }
  } catch (e) {
    showUpdateBanner(
      { updateAvailable: true, message: String(e && e.message ? e.message : e) },
      { failed: true }
    );
  }
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
      if (u?.fromSourceTree) return;
      if (u?.needsAuth) {
        showUpdateBanner(
          {
            updateAvailable: true,
            needsAuth: true,
            message: u.error || "Connexion GitHub requise",
          },
          { failed: true }
        );
        return;
      }
      if (u?.ok && u.updateAvailable) {
        const silent = !!(
          u.canSelfUpdate &&
          u.autoUpdate !== false &&
          typeof a.apply_update === "function"
        );
        if (silent) void runHubApply(false);
        else showUpdateBanner(u, { silent: false });
      }
    }
  } catch (_) {}
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
    void loadVersionAndUpdates();
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
