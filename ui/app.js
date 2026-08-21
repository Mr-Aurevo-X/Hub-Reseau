/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * Hub-Reseau shell — Dashboard boot + lazy modules + sidebar collapsible + FR/EN.
 */
import {
  applyDom,
  getLang,
  legalFile,
  pathHintFor,
  pathLabelFor,
  setLang,
  t,
} from "./i18n.js";

const HUB_NAME = "PC Command | Network";

const TITLES = {
  dashboard: HUB_NAME,
  netadmin: `${HUB_NAME} [NetAdmin]`,
  netmap: `${HUB_NAME} [NetMap]`,
  roadway: `${HUB_NAME} [Traffic]`,
  wifikey: `${HUB_NAME} [WifiKey]`,
};

const cache = Object.create(null);
let currentView = "dashboard";
let currentDash = null;
let currentSegment = "";
let appVersion = "";
let remountingLang = false;

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

function syncNavTooltips() {
  document.querySelectorAll(".hub-nav-item[data-view]").forEach((btn) => {
    const label = btn.querySelector(".hub-nav-label");
    const text = (label && label.textContent) || btn.getAttribute("title") || "";
    if (text) {
      btn.setAttribute("data-tooltip", text);
      btn.setAttribute("title", text);
    }
  });
}

function syncCollapseLabels() {
  const shell = document.getElementById("hubShell");
  const btn = document.getElementById("btnCollapse");
  if (!btn || !shell) return;
  const collapsed = shell.classList.contains("is-collapsed");
  btn.title = collapsed ? t("expandTitle") : t("collapseTitle");
  btn.setAttribute("data-i18n-title", collapsed ? "expandTitle" : "collapseTitle");
  const label = btn.querySelector(".hub-nav-label");
  if (label) {
    label.textContent = collapsed ? t("expand") : t("collapse");
    label.setAttribute("data-i18n", collapsed ? "expand" : "collapse");
  }
}

function syncLangSwitch() {
  const root = document.getElementById("langSwitch");
  if (!root) return;
  const cur = getLang();
  root.querySelectorAll("[data-lang]").forEach((btn) => {
    const on = btn.dataset.lang === cur;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function applyShellI18n() {
  applyDom();
  syncNavTooltips();
  syncCollapseLabels();
  syncLangSwitch();
  const hint = document.getElementById("aboutUpdateHint");
  const chk = document.getElementById("chkGithubUpdates");
  if (hint && chk) {
    hint.textContent = chk.checked ? t("aboutHintOn") : t("aboutHintOff");
  }
}

async function persistLanguage(lang) {
  const a = apiRoot();
  try {
    if (a && typeof a.set_suite_language === "function") {
      await a.set_suite_language(lang);
    }
  } catch (_) {}
}

async function resolveBootLanguage() {
  const a = apiRoot();
  try {
    if (a && typeof a.get_suite_settings === "function") {
      const res = await a.get_suite_settings();
      if (res && (res.language === "en" || res.language === "fr")) return res.language;
    }
    if (a && typeof a.get_suite_language === "function") {
      const res = await a.get_suite_language();
      if (res && (res.language === "en" || res.language === "fr")) return res.language;
    }
  } catch (_) {}
  try {
    if (window.MrAurevoXSuite && typeof window.MrAurevoXSuite.loadSuiteSettings === "function") {
      const s = await window.MrAurevoXSuite.loadSuiteSettings(a);
      if (s && (s.language === "en" || s.language === "fr")) return s.language;
    }
  } catch (_) {}
  return "fr";
}

async function setLanguage(next) {
  const lang = next === "en" ? "en" : "fr";
  if (lang === getLang()) {
    syncLangSwitch();
    return;
  }
  setLang(lang, { silent: true });
  applyShellI18n();
  await persistLanguage(lang);
  remountingLang = true;
  try {
    await showView(currentView || "dashboard");
  } finally {
    remountingLang = false;
  }
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
  /* Prefer i18n — backend message is FR-only */
  const msg = t("releaseMsg", { ver: info.remote || "" });
  bar.innerHTML =
    `<div class="hub-release-text"><strong>${t("releaseNew")}</strong><span></span></div>` +
    '<div class="hub-release-actions">' +
    `<button type="button" class="hub-release-btn" id="hubReleaseOpen">${t("releaseOpen")}</button>` +
    `<button type="button" class="hub-release-dismiss" id="hubReleaseDismiss" aria-label="${t("releaseClose")}">×</button>` +
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

  currentView = id;
  currentSegment = "";
  setActiveNav(id);
  await setTitle(id);
  root.dataset.view = id;

  if (currentDash && typeof currentDash.unmount === "function") {
    try {
      currentDash.unmount();
    } catch (_) {}
    currentDash = null;
  }
  root.innerHTML = "";

  if (id === "dashboard") {
    currentDash = await import("./dashboard.js");
    await currentDash.mount(root);
  } else {
    if (!cache[id] || remountingLang) {
      cache[id] = await import(`./modules/${id}.js`);
    }
    await cache[id].mount(root, { openModule: showView });
  }
  replayEnter(root);
  applyDom(root);
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
    syncCollapseLabels();
    const ico = btn.querySelector(".hub-nav-ico");
    if (ico) ico.textContent = collapsed ? "▸" : "◂";
  });

  document.getElementById("langSwitch")?.addEventListener("click", (ev) => {
    const seg = ev.target.closest("[data-lang]");
    if (!seg || !document.getElementById("langSwitch")?.contains(seg)) return;
    void setLanguage(seg.dataset.lang);
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

  wireAboutDialog();
}

function wireAboutDialog() {
  const btn = document.getElementById("btnAbout");
  const dlg = document.getElementById("aboutDialog");
  const chk = document.getElementById("chkGithubUpdates");
  const hint = document.getElementById("aboutUpdateHint");
  const body = document.getElementById("aboutLegalBody");
  if (!btn || !dlg) return;

  async function copyText(value, hintEl, okMsg) {
    const text = (value || "").trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const tmp = document.createElement("textarea");
        tmp.value = text;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand("copy");
        tmp.remove();
      }
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = okMsg || t("aboutCopied");
        setTimeout(() => {
          hintEl.hidden = true;
        }, 1800);
      }
    } catch (_) {
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = t("aboutCopyFallback");
      }
    }
  }

  async function refreshPref() {
    const a = apiRoot();
    try {
      if (a?.get_update_check_pref) {
        const r = await a.get_update_check_pref();
        if (chk) chk.checked = r?.checkGithubUpdates !== false;
      }
    } catch (_) {}
    if (hint && chk) {
      hint.textContent = chk.checked ? t("aboutHintOn") : t("aboutHintOff");
    }
  }

  async function refreshLocalPaths() {
    const list = document.getElementById("aboutPathsList");
    const pathHint = document.getElementById("aboutPathCopyHint");
    if (!list) return;
    list.replaceChildren();
    const a = apiRoot();
    let paths = [];
    try {
      if (a?.get_about_local_paths) {
        const r = await a.get_about_local_paths();
        if (Array.isArray(r?.paths)) paths = r.paths;
      }
    } catch (_) {}
    if (!paths.length) {
      paths = [
        {
          id: "version",
          path: "%LOCALAPPDATA%\\PCCommand",
        },
        {
          id: "settings",
          path: "%LOCALAPPDATA%\\Mr-Aurevo-X\\user-settings.json",
        },
        {
          id: "data-roadway",
          path: "%LOCALAPPDATA%\\Mr-Aurevo-X\\RoadWay-X",
          optional: true,
        },
      ];
    }
    for (const entry of paths) {
      const item = document.createElement("div");
      item.className = "about-path-item";
      const label = document.createElement("div");
      label.className = "about-path-label";
      const hintText = pathHintFor(entry);
      label.textContent =
        pathLabelFor(entry) + (entry.optional ? ` ${t("aboutOptional")}` : "");
      const row = document.createElement("div");
      row.className = "about-repo-row";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "about-repo-input";
      input.readOnly = true;
      input.spellcheck = false;
      input.value = entry.path || "";
      input.title = hintText;
      input.addEventListener("focus", () => input.select());
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn accent";
      copyBtn.title = t("aboutCopyPathTitle");
      copyBtn.textContent = t("aboutCopy");
      copyBtn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await copyText(input.value, pathHint, t("aboutCopiedPath"));
      });
      row.append(input, copyBtn);
      item.appendChild(label);
      if (hintText) {
        const note = document.createElement("p");
        note.className = "about-note";
        note.textContent = hintText;
        item.appendChild(note);
      }
      item.appendChild(row);
      list.appendChild(item);
    }
  }

  btn.addEventListener("click", async () => {
    applyShellI18n();
    await refreshPref();
    await refreshLocalPaths();
    if (typeof dlg.showModal === "function") dlg.showModal();
  });

  chk?.addEventListener("change", async () => {
    const a = apiRoot();
    const enabled = !!chk.checked;
    try {
      if (a?.set_update_check_pref) await a.set_update_check_pref(enabled);
    } catch (_) {}
    if (hint) {
      hint.textContent = enabled ? t("aboutHintOn") : t("aboutHintOff");
    }
    if (!enabled) dismissReleaseBanner();
  });

  const repoInput = document.getElementById("aboutRepoUrl");
  const btnCopy = document.getElementById("btnCopyRepo");
  const copyHint = document.getElementById("aboutCopyHint");
  btnCopy?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const url = (repoInput?.value || "https://github.com/Mr-Aurevo-X/Hub-Reseau").trim();
    await copyText(url, copyHint, t("aboutCopiedLink"));
  });
  repoInput?.addEventListener("focus", () => repoInput.select());

  dlg.querySelectorAll("[data-legal]").forEach((el) => {
    el.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const base = el.getAttribute("data-legal");
      if (!base || !body) return;
      const file = legalFile(base);
      try {
        const res = await fetch(`legal/${file}`, { cache: "no-store" });
        body.textContent = res.ok ? await res.text() : t("aboutLegalLoadFail", { file });
        body.hidden = false;
      } catch (err) {
        body.textContent = String(err);
        body.hidden = false;
      }
    });
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
    `<strong>${t("bootError")}</strong>` +
    `<p style="margin-top:0.5rem;opacity:0.85">${msg}</p></div>`;
}

async function boot() {
  try {
    wireSidebar();
    await waitPywebviewReady();
    await waitApi();
    const bootLang = await resolveBootLanguage();
    setLang(bootLang, { silent: true });
    applyShellI18n();
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

window.HubShell = { showView };
window.HubReseau = {
  showView,
  setSegmentTitle(label) {
    setTitle(currentView, label);
  },
};
