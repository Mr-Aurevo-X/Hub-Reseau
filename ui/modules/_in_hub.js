/**
 * Shared UninstX-grade in-hub helpers — native DOM only (no iframe).
 * Adapted for Hub-Reseau (window.HubReseau).
 */
import { apiNs, esc } from "./_hub_util.js";

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

/**
 * Mount standard module shell: header + sticky segments + body mount point.
 * @returns {{ shell, body, setStatus, setSegment, getSegment, askConfirm, esc }}
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
    if (window.HubReseau?.setSegmentTitle) {
      const label = segments.find((s) => s.id === current)?.label || current;
      window.HubReseau.setSegmentTitle(label);
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
    setSegment,
    getSegment: () => current,
    askConfirm,
    esc,
  };
}

/** Poll async job until done. getter() → { ok, done?, running?, result?, error?, percent? } */
export async function pollUntil(getter, { intervalMs = 400, timeoutMs = 180000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await getter();
    if (!res) return { ok: false, error: "No response" };
    if (res.error && res.done) return res;
    if (res.done || res.result != null || (res.ok && res.running === false && res.result !== undefined)) {
      return res;
    }
    if (res.ok === false && !res.running) return res;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, error: "Timeout" };
}
