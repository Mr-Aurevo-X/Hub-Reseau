/**
 * Shared UninstX-grade in-hub helpers — native DOM only (no iframe).
 */
import { apiNs, esc } from "../_hub_util.js";

export { apiNs, esc };

export function ensureInHubCss() {
  const id = "hub-inhub-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "./modules/_in_hub.css";
  document.head.appendChild(link);
}

export async function waitNs(ns, method, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = apiNs(ns);
    if (api && (!method || typeof api[method] === "function")) return api;
    await new Promise((r) => setTimeout(r, 40));
  }
  return apiNs(ns);
}

/** Unwrap pywebview envelopes `{ ok, data: {...} }` into a flat progress/result object. */
export function unwrapData(res) {
  if (!res || typeof res !== "object") return res;
  if (res.data != null && typeof res.data === "object" && !Array.isArray(res.data)) {
    return {
      ...res,
      ...res.data,
      ok: res.ok !== false && res.data.ok !== false,
      error: res.error || res.data.error || null,
    };
  }
  return res;
}

function hubTitleApi() {
  return (
    window.HubSysteme ||
    window.HubReseau ||
    window.HubSecurite ||
    window.HubDev ||
    window.HubUtilitaires ||
    null
  );
}

/**
 * Mount standard module shell: header + sticky segments + body + progress.
 */
export function mountModuleShell(root, opts) {
  ensureInHubCss();
  const {
    title,
    subtitle = "",
    segments = [],
    initialSegment = segments[0]?.id || "",
    onSegment = null,
    fill = true,
  } = opts || {};

  root.innerHTML = `
    <div class="hub-inhub">
      <header class="hub-page-header">
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
      </header>
      ${
        segments.length
          ? `<div class="hub-seg sticky" role="tablist" data-role="seg"></div>`
          : ""
      }
      <div class="hub-progress" data-role="progress" hidden>
        <div class="progress-bar"><i data-role="progress-bar"></i></div>
        <p class="meta" data-role="progress-label"></p>
      </div>
      <div class="hub-inhub-body ${fill ? "" : "hub-inhub-scroll"}" data-role="body"></div>
      <p class="status" data-role="status"></p>
      <div class="confirm-overlay" data-role="confirm" hidden>
        <div class="confirm-box" role="dialog" aria-modal="true">
          <h3 data-role="confirm-title">Confirmer</h3>
          <p data-role="confirm-msg"></p>
          <div class="btn-row">
            <button type="button" class="btn" data-role="confirm-cancel">Annuler</button>
            <button type="button" class="btn danger" data-role="confirm-ok">Confirmer</button>
          </div>
        </div>
      </div>
    </div>`;

  const shell = root.querySelector(".hub-inhub");
  const body = shell.querySelector('[data-role="body"]');
  const statusEl = shell.querySelector('[data-role="status"]');
  const segEl = shell.querySelector('[data-role="seg"]');
  const progressWrap = shell.querySelector('[data-role="progress"]');
  const progressBar = shell.querySelector('[data-role="progress-bar"]');
  const progressLabel = shell.querySelector('[data-role="progress-label"]');
  const confirmOverlay = shell.querySelector('[data-role="confirm"]');
  const confirmTitle = shell.querySelector('[data-role="confirm-title"]');
  const confirmMsg = shell.querySelector('[data-role="confirm-msg"]');
  const confirmOk = shell.querySelector('[data-role="confirm-ok"]');
  const confirmCancel = shell.querySelector('[data-role="confirm-cancel"]');

  let current = initialSegment;
  let confirmResolver = null;

  function setStatus(msg, cls) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function setProgress(percent, label = "") {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    if (!label && pct <= 0) {
      progressWrap.hidden = true;
      progressBar.style.width = "0%";
      progressLabel.textContent = "";
      return;
    }
    progressWrap.hidden = false;
    progressBar.style.width = pct + "%";
    progressLabel.textContent = label || `${pct}%`;
  }

  function renderSeg() {
    if (!segEl) return;
    segEl.innerHTML = segments
      .map(
        (s) =>
          `<button type="button" class="hub-seg-btn${s.id === current ? " is-active" : ""}" data-seg="${esc(
            s.id
          )}" role="tab" aria-selected="${s.id === current ? "true" : "false"}">${esc(s.label)}</button>`
      )
      .join("");
  }

  async function setSegment(id, { silent = false } = {}) {
    const next = segments.find((s) => s.id === id)?.id || segments[0]?.id || "";
    current = next;
    renderSeg();
    const hub = hubTitleApi();
    if (hub?.setSegmentTitle) {
      const label = segments.find((s) => s.id === current)?.label || current;
      hub.setSegmentTitle(label);
    }
    if (!silent && typeof onSegment === "function") {
      await onSegment(current, body);
    }
  }

  if (segEl) {
    renderSeg();
    segEl.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-seg]");
      if (!btn) return;
      setSegment(btn.getAttribute("data-seg"));
    });
  }

  function askConfirm(message, titleText = "Confirmer") {
    confirmTitle.textContent = titleText;
    confirmMsg.textContent = message;
    confirmOverlay.hidden = false;
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function closeConfirm(ok) {
    confirmOverlay.hidden = true;
    if (confirmResolver) {
      const r = confirmResolver;
      confirmResolver = null;
      r(ok);
    }
  }

  confirmOk.addEventListener("click", () => closeConfirm(true));
  confirmCancel.addEventListener("click", () => closeConfirm(false));

  return {
    shell,
    body,
    setStatus,
    setProgress,
    setSegment,
    getSegment: () => current,
    askConfirm,
    esc,
  };
}

/**
 * Poll async job until done.
 * getter may return raw API envelopes; unwrapData is applied automatically.
 * onTick({percent, phase, detail, running}) optional for UI progress.
 */
export async function pollUntil(getter, { intervalMs = 400, timeoutMs = 180000, onTick = null } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const raw = await getter();
    const res = unwrapData(raw) || {};
    const percent = Number(res.percent) || 0;
    const running = res.running === true;
    const done = res.done === true || (!running && (res.result != null || res.cancelled === true));
    if (typeof onTick === "function") {
      onTick({
        percent,
        phase: res.phase || "",
        detail: res.detail || "",
        running,
        done,
        error: res.error || null,
      });
    }
    if (res.error && (done || res.ok === false) && !running) {
      return { ...res, ok: false, done: true };
    }
    if (done) return { ...res, ok: res.ok !== false, done: true };
    if (res.ok === false && !running) return { ...res, done: true };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, error: "Timeout", done: true };
}
