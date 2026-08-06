/** Shared ConfirmGate helper for Hub-Reseau modules. */
export function apiNs(ns) {
  const a = window.pywebview && window.pywebview.api;
  return a && a[ns];
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
