
(function () {
  "use strict";
  function api() { return window.pywebview && window.pywebview.api; }
  async function call(method, ...args) {
    const a = api();
    if (!a || typeof a[method] !== "function") throw new Error("API indisponible");
    return a[method](...args);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function switchTab(id) {
    document.querySelectorAll(".hub-tab").forEach((btn) => {
      const on = btn.dataset.tab === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".hub-panel").forEach((panel) => {
      const on = panel.dataset.panel === id;
      panel.classList.toggle("active", on);
      panel.hidden = !on;
    });
  }
  document.querySelectorAll(".hub-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("btnPingGo")?.addEventListener("click", async () => {
    const st = document.getElementById("pingStatus");
    const out = document.getElementById("pingOut");
    try {
      st.textContent = "Ping/trace...";
      const res = await call("run_ping_trace", document.getElementById("pingHost").value);
      out.textContent = res.ok ? (res.output || JSON.stringify(res, null, 2)) : (res.error || "Erreur");
      st.textContent = res.ok ? ("OK " + (res.host || "")) : (res.error || "Echec");
    } catch (e) { st.textContent = String(e.message || e); }
  });
  document.getElementById("btnSiteCheck")?.addEventListener("click", async () => {
    const st = document.getElementById("siteStatus");
    const out = document.getElementById("siteOut");
    try {
      st.textContent = "Check...";
      const res = await call("check_site", document.getElementById("siteUrl").value);
      out.textContent = JSON.stringify(res, null, 2);
      st.textContent = res.ok ? ((res.verdict && res.verdict.label) || "OK") : (res.error || "Echec");
    } catch (e) { st.textContent = String(e.message || e); }
  });
  document.getElementById("btnSiteFavs")?.addEventListener("click", async () => {
    const out = document.getElementById("siteOut");
    const res = await call("get_favorites");
    out.textContent = JSON.stringify(res, null, 2);
  });
  document.getElementById("btnSiteHist")?.addEventListener("click", async () => {
    const out = document.getElementById("siteOut");
    const res = await call("get_history", 20);
    out.textContent = JSON.stringify(res, null, 2);
  });
  document.getElementById("btnProxyRead")?.addEventListener("click", async () => {
    const st = document.getElementById("proxyStatus");
    const out = document.getElementById("proxyOut");
    try {
      const res = await call("read_proxies");
      out.textContent = JSON.stringify(res, null, 2);
      st.textContent = res.ok ? "OK" : (res.error || "Echec");
      const env = (res.env || {});
      const hp = env.HTTP_PROXY || env.http_proxy || {};
      document.getElementById("proxyHttp").value = (hp.user || hp.process || "") || "";
      const hs = env.HTTPS_PROXY || env.https_proxy || {};
      document.getElementById("proxyHttps").value = (hs.user || hs.process || "") || "";
      const np = env.NO_PROXY || env.no_proxy || {};
      document.getElementById("proxyNo").value = (np.user || np.process || "") || "";
    } catch (e) { st.textContent = String(e.message || e); }
  });
  document.getElementById("btnProxySet")?.addEventListener("click", async () => {
    if (!window.confirm("Appliquer HTTP_PROXY / HTTPS_PROXY / NO_PROXY pour l'utilisateur Windows ?")) return;
    const st = document.getElementById("proxyStatus");
    const res = await call(
      "set_user_env_proxy",
      document.getElementById("proxyHttp").value,
      document.getElementById("proxyHttps").value,
      document.getElementById("proxyNo").value
    );
    st.textContent = res.ok ? "Env user mis a jour" : (res.error || "Echec");
  });
  document.getElementById("btnProxyClear")?.addEventListener("click", async () => {
    if (!window.confirm("Effacer les variables proxy utilisateur (HTTP_PROXY / HTTPS_PROXY / NO_PROXY) ?")) return;
    const st = document.getElementById("proxyStatus");
    const res = await call("clear_user_env_proxy");
    st.textContent = res.ok ? "Env user efface" : (res.error || "Echec");
  });
  document.getElementById("btnSharesRefresh")?.addEventListener("click", async () => {
    const st = document.getElementById("sharesStatus");
    const body = document.getElementById("sharesBody");
    try {
      const res = await call("list_shares");
      body.innerHTML = "";
      (res.shares || []).forEach((s) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(s.name)}</td><td>${esc(s.path)}</td><td>${esc(s.description)}</td><td>${esc(s.state)}</td>`;
        body.appendChild(tr);
      });
      st.textContent = res.ok ? ((res.count || 0) + " partage(s)") : (res.error || "Echec");
    } catch (e) { st.textContent = String(e.message || e); }
  });

})();
