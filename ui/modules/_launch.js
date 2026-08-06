/**
 * Lazy module factory — Couche A (launch sibling apps).
 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function apiNs(ns) {
  const a = window.pywebview && window.pywebview.api;
  return a && a[ns];
}

export function createLaunchModule({ id, title, blurb }) {
  return {
    async mount(root) {
      root.innerHTML = `
        <div class="hub-module-panel">
          <header class="hub-page-header">
            <h1>${esc(title)}</h1>
            <p>${esc(blurb)} · Couche A (lance l’app Atelier)</p>
          </header>
          <div class="hub-module-apps" id="modApps">
            <div class="hub-skel kpi" style="width:160px;height:2.4rem"></div>
          </div>
          <p class="hub-note">Aucun mutator in-process dans ce stub H1. Les actions restent dans l’app ouverte.</p>
          <p class="hub-status" id="modStatus"></p>
        </div>
      `;

      const ns = apiNs(id);
      const status = root.querySelector("#modStatus");
      const box = root.querySelector("#modApps");
      let apps = [];
      try {
        if (ns?.list_apps) {
          const res = await ns.list_apps();
          apps = (res && res.apps) || [];
        }
      } catch (e) {
        status.textContent = String(e && e.message ? e.message : e);
      }

      if (!apps.length) {
        box.innerHTML = `<p class="hub-note">Aucune app listée (bridge API).</p>`;
        return;
      }

      box.innerHTML = apps
        .map(
          (name) =>
            `<button type="button" class="hub-btn accent" data-app="${esc(name)}">Ouvrir ${esc(name)}</button>`
        )
        .join("");

      box.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("[data-app]");
        if (!btn) return;
        const name = btn.getAttribute("data-app");
        status.textContent = `Lancement ${name}…`;
        try {
          const res = ns?.open_app ? await ns.open_app(name) : { ok: false, error: "API indisponible" };
          status.textContent = res && res.ok ? `Ouvert : ${name}` : (res && res.error) || "Échec lancement";
        } catch (e) {
          status.textContent = String(e && e.message ? e.message : e);
        }
      });
    },
  };
}
