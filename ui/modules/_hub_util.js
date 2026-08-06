/**
 * In-hub rich UI embed: iframe + postMessage bridge to pywebview.api.<ns>.*
 * Keeps original tool HTML/CSS/JS without external "Fenêtre dédiée" windows.
 */
export function apiNs(ns) {
  const a = window.pywebview && window.pywebview.api;
  if (!ns) return a;
  const parts = String(ns).split(".");
  let cur = a;
  for (const p of parts) {
    if (!cur) return null;
    cur = cur[p];
  }
  return cur;
}

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function confirmMutator(ns, action, payload, confirmMsg) {
  if (!window.confirm(confirmMsg)) return { ok: false, error: "Annulé" };
  const api = apiNs(ns);
  if (!api?.prepare_action) return { ok: false, error: "API indisponible" };
  const prep = await api.prepare_action(action, payload || {});
  if (!prep || !prep.ok || !prep.token) {
    return { ok: false, error: (prep && prep.error) || "Confirmation refusée" };
  }
  return { ok: true, token: prep.token };
}

let bridgeInstalled = false;
const pending = new Map();
let reqId = 0;

function installParentBridge() {
  if (bridgeInstalled) return;
  bridgeInstalled = true;
  window.addEventListener("message", async (ev) => {
    const data = ev.data;
    if (!data || data.type !== "hub-api-call") return;
    const { id, ns, method, args } = data;
    try {
      const api = apiNs(ns);
      const root = window.pywebview && window.pywebview.api;
      let fn = api && typeof api[method] === "function" ? api[method].bind(api) : null;
      if (!fn && root && typeof root[method] === "function") {
        fn = root[method].bind(root);
      }
      if (!fn) {
        ev.source?.postMessage(
          { type: "hub-api-result", id, ok: false, error: `API ${ns}.${method} indisponible` },
          "*"
        );
        return;
      }
      const res = await fn(...(args || []));
      ev.source?.postMessage({ type: "hub-api-result", id, ok: true, res }, "*");
    } catch (err) {
      ev.source?.postMessage(
        { type: "hub-api-result", id, ok: false, error: String(err && err.message ? err.message : err) },
        "*"
      );
    }
  });
}

/**
 * Mount original tool UI inside hub content via same-origin iframe + API bridge.
 * @param {HTMLElement} root
 * @param {{ ns: string, src: string, title?: string, subtitle?: string, segments?: {id:string,label:string}[] }} opts
 */
export async function mountEmbeddedApp(root, opts) {
  installParentBridge();
  const { ns, src, title, subtitle, segments } = opts;
  const segHtml =
    segments && segments.length
      ? `<div class="hub-seg" role="tablist">${segments
          .map(
            (s, i) =>
              `<button type="button" class="hub-seg-btn${i === 0 ? " is-active" : ""}" data-seg="${esc(
                s.id
              )}" role="tab">${esc(s.label)}</button>`
          )
          .join("")}</div>`
      : "";

  root.innerHTML = `
    <div class="hub-embed-shell">
      ${
        title
          ? `<header class="hub-embed-head">
        <div>
          <h1 class="hub-embed-title">${esc(title)}</h1>
          ${subtitle ? `<p class="hub-embed-sub">${esc(subtitle)}</p>` : ""}
        </div>
      </header>`
          : ""
      }
      ${segHtml}
      <div class="hub-embed-frame-wrap">
        <iframe class="hub-embed-frame" title="${esc(title || ns)}" src="${esc(
          src
        )}" data-hub-ns="${esc(ns)}"></iframe>
      </div>
    </div>`;

  const iframe = root.querySelector("iframe");
  // Optional: segment buttons can postMessage page switches if embed listens
  root.querySelectorAll("[data-seg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll("[data-seg]").forEach((b) => b.classList.toggle("is-active", b === btn));
      iframe?.contentWindow?.postMessage({ type: "hub-seg", id: btn.getAttribute("data-seg") }, "*");
    });
  });

  return { iframe };
}
