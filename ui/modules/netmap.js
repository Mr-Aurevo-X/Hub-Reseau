/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * NetMap — native in-hub (no iframe). SoT: AtelierWindows/NetMap
 * Bridge: pywebview.api.netmap.*
 * Segments: Connexions | Outils réseau | Proxy | Partages
 * SoT wire: export_csv · check_port · open_path · tcp_probe
 */
import { t } from "../i18n.js";
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

function skelRows(n = 5) {
  return Array.from({ length: n }, () => `<div class="hub-skel" style="height:28px;margin:6px 10px;border-radius:6px"></div>`).join("");
}

export async function mount(root) {
  const { body, setStatus, askConfirm, setSegment } = mountModuleShell(root, {
    title: t("nmTitle"),
    subtitle: t("nmSubtitle"),
    segments: [
      { id: "connections", label: t("nmSegConns") },
      { id: "tools", label: t("nmSegTools") },
      { id: "proxy", label: t("nmSegProxy") },
      { id: "shares", label: t("nmSegShares") },
    ],
    onSegment,
  });

  const api = await waitNs("netmap", "list_connections");

  // ─── CONNEXIONS ──────────────────────────────────────────────────────────────

  let connsData = [];
  let connsFilter = "";
  let selected = null;

  async function buildConnections() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" id="nmSearch" placeholder="${esc(t("nmSearchPh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="nmRefresh">${esc(t("commonRefresh"))}</button>
          <button type="button" class="btn ghost" id="nmExport" disabled>${esc(t("nmExportCsv"))}</button>
          <button type="button" class="btn ghost" id="nmOpenPath" disabled>${esc(t("nmOpenFolder"))}</button>
        </div>
        <p class="meta" id="nmMeta"></p>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div id="nmSkel">${skelRows(6)}</div>
        <div class="empty-state" id="nmEmpty" hidden>${esc(t("nmLoadingConns"))}</div>
        <div class="table-wrap" id="nmWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>${esc(t("nmColProto"))}</th>
              <th>${esc(t("nmColLocal"))}</th>
              <th>${esc(t("nmColRemote"))}</th>
              <th>${esc(t("nmColState"))}</th>
              <th>${esc(t("nmColPid"))}</th>
              <th>${esc(t("nmColProc"))}</th>
            </tr></thead>
            <tbody id="nmBody"></tbody>
          </table>
        </div>
      </div>`;

    const searchEl = body.querySelector("#nmSearch");
    const metaEl = body.querySelector("#nmMeta");
    const emptyEl = body.querySelector("#nmEmpty");
    const wrapEl = body.querySelector("#nmWrap");
    const bodyEl = body.querySelector("#nmBody");
    const skel = body.querySelector("#nmSkel");
    const exportBtn = body.querySelector("#nmExport");
    const openBtn = body.querySelector("#nmOpenPath");

    function syncActionBtns() {
      exportBtn.disabled = !connsData.length;
      openBtn.disabled = !(selected && selected.path);
    }

    function filteredRows() {
      const q = connsFilter.toLowerCase();
      return q
        ? connsData.filter((c) =>
            (c.proto || "").toLowerCase().includes(q) ||
            (c.laddr || "").toLowerCase().includes(q) ||
            (c.raddr || "").toLowerCase().includes(q) ||
            (c.name || "").toLowerCase().includes(q) ||
            String(c.pid || "").includes(q))
        : connsData;
    }

    function renderConns() {
      skel.hidden = true;
      const rows = filteredRows();
      if (!rows.length) {
        emptyEl.hidden = false;
        wrapEl.hidden = true;
        metaEl.textContent = connsFilter ? t("nmNoMatch") : t("nmNoConns");
        syncActionBtns();
        return;
      }
      emptyEl.hidden = true;
      wrapEl.hidden = false;
      metaEl.textContent = t("nmConnCount", { shown: rows.length, total: connsData.length });
      bodyEl.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (const c of rows) {
        const tr = document.createElement("tr");
        const key = `${c.proto}|${c.laddr}|${c.raddr}|${c.pid}`;
        if (selected && `${selected.proto}|${selected.laddr}|${selected.raddr}|${selected.pid}` === key) {
          tr.classList.add("is-selected");
          tr.style.background = "color-mix(in srgb, var(--accent,#e03545) 18%, transparent)";
        }
        tr.dataset.key = key;
        tr.style.cursor = "pointer";
        tr.innerHTML =
          `<td>${esc(c.proto || "")}</td>` +
          `<td class="meta">${esc(c.laddr || "—")}</td>` +
          `<td class="meta">${esc(c.raddr || "—")}</td>` +
          `<td>${esc(c.status || "")}</td>` +
          `<td>${esc(c.pid || "")}</td>` +
          `<td title="${esc(c.path || "")}">${esc(c.name || "—")}</td>`;
        tr.addEventListener("click", () => {
          selected = c;
          renderConns();
        });
        frag.appendChild(tr);
      }
      bodyEl.appendChild(frag);
      syncActionBtns();
    }

    searchEl.addEventListener("input", () => {
      connsFilter = searchEl.value || "";
      renderConns();
    });
    body.querySelector("#nmRefresh").addEventListener("click", loadConns);

    exportBtn.addEventListener("click", async () => {
      if (!api?.export_csv) {
        setStatus(t("commonApiUnavailable"), "error");
        return;
      }
      const list = filteredRows();
      if (!list.length) return;
      setStatus(t("nmExporting"));
      skel.hidden = false;
      skel.innerHTML = skelRows(3);
      try {
        const res = await api.export_csv(list);
        skel.hidden = true;
        if (res?.ok && !res.cancelled) {
          setStatus(
            res.path
              ? t("nmExportOk", { path: res.path })
              : t("nmExportOkCount", { count: res.count || list.length }),
            "ok"
          );
        } else if (res?.cancelled) setStatus(t("nmExportCancel"));
        else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        skel.hidden = true;
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    openBtn.addEventListener("click", async () => {
      if (!selected?.path || !api?.open_path) return;
      setStatus(t("nmOpeningFolder"));
      try {
        const res = await api.open_path(selected.path);
        if (res?.ok) setStatus(t("nmFolderOpened"), "ok");
        else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    async function loadConns() {
      if (!api?.list_connections) {
        setStatus(t("nmApiUnavailable"), "error");
        return;
      }
      setStatus(t("nmLoadingConnsStatus"));
      skel.hidden = false;
      skel.innerHTML = skelRows(6);
      emptyEl.hidden = true;
      wrapEl.hidden = true;
      selected = null;
      try {
        const res = await api.list_connections();
        if (!res?.ok) {
          skel.hidden = true;
          emptyEl.hidden = false;
          emptyEl.textContent = res?.error || t("commonError", { err: "?" });
          setStatus(t("commonError", { err: res?.error || "?" }), "error");
          return;
        }
        connsData = Array.isArray(res.connections) ? res.connections : [];
        emptyEl.textContent = t("nmNoConns");
        renderConns();
        setStatus(t("nmConnsLoaded", { n: connsData.length }));
      } catch (err) {
        skel.hidden = true;
        emptyEl.hidden = false;
        emptyEl.textContent = String(err);
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    await loadConns();
  }

  // ─── OUTILS RÉSEAU ───────────────────────────────────────────────────────────

  async function buildTools() {
    body.innerHTML = `
      <div class="panel">
        <h3 style="font-size:.85rem;font-weight:600;margin-bottom:10px">${esc(t("nmPingTitle"))}</h3>
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="text" id="nmPingHost" placeholder="${esc(t("nmPingPh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="nmPingBtn">${esc(t("nmPingRun"))}</button>
        </div>
        <pre id="nmPingResult"
          style="margin-top:10px;font-size:.78rem;font-family:var(--mono,ui-monospace,monospace);
                 white-space:pre-wrap;background:var(--bg1);border:1px solid var(--border);
                 border-radius:8px;padding:10px 12px;min-height:44px;max-height:220px;overflow:auto"></pre>
      </div>
      <div class="panel">
        <h3 style="font-size:.85rem;font-weight:600;margin-bottom:10px">${esc(t("nmProbeTitle"))}</h3>
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="text" id="nmProbeHost" placeholder="${esc(t("nmProbePh"))}" autocomplete="off" value="8.8.8.8" />
          </div>
          <input type="number" id="nmProbePort" value="443" min="1" max="65535"
            style="width:88px" title="${esc(t("nmPortAttr"))}" />
          <input type="number" id="nmProbeTimeout" value="2" min="0.2" max="30" step="0.5"
            style="width:76px" title="${esc(t("nmTimeoutAttr"))}" />
          <button type="button" class="btn accent" id="nmProbeBtn">${esc(t("nmProbeBtn"))}</button>
          <span class="meta" id="nmProbeResult" style="min-width:140px"></span>
        </div>
      </div>
      <div class="panel">
        <h3 style="font-size:.85rem;font-weight:600;margin-bottom:10px">${esc(t("nmPortTitle"))}</h3>
        <div class="toolbar-row">
          <input type="number" id="nmCheckPort" value="443" min="1" max="65535"
            style="width:100px" title="${esc(t("nmPortAttr"))}" />
          <button type="button" class="btn accent" id="nmCheckPortBtn">${esc(t("nmPortCheck"))}</button>
          <span class="meta" id="nmCheckPortMeta" style="min-width:140px"></span>
        </div>
        <div id="nmPortSkel" hidden>${skelRows(3)}</div>
        <div class="table-wrap" id="nmPortWrap" style="margin-top:10px;max-height:220px" hidden>
          <table class="data">
            <thead><tr>
              <th>${esc(t("nmColProto"))}</th>
              <th>${esc(t("nmColLocal"))}</th>
              <th>${esc(t("nmColRemote"))}</th>
              <th>${esc(t("nmColState"))}</th>
              <th>${esc(t("nmColPid"))}</th>
              <th>${esc(t("nmColProc"))}</th>
              <th></th>
            </tr></thead>
            <tbody id="nmPortBody"></tbody>
          </table>
        </div>
      </div>`;

    const pingHost = body.querySelector("#nmPingHost");
    const pingBtn = body.querySelector("#nmPingBtn");
    const pingResult = body.querySelector("#nmPingResult");
    const probeBtn = body.querySelector("#nmProbeBtn");
    const probeRes = body.querySelector("#nmProbeResult");

    pingBtn.addEventListener("click", async () => {
      const h = (pingHost.value || "").trim();
      if (!h || !api?.run_ping_trace) return;
      setStatus(t("nmPingRunning"));
      pingResult.textContent = "…";
      pingBtn.disabled = true;
      try {
        const res = await api.run_ping_trace(h);
        if (res?.ok) {
          pingResult.textContent = res.output || t("nmPingNoOut");
          setStatus("");
        } else {
          pingResult.textContent = res?.error || t("commonError", { err: "?" });
          setStatus(t("nmPingErr"), "error");
        }
      } catch (err) {
        pingResult.textContent = String(err);
        setStatus(t("commonError", { err: String(err) }), "error");
      } finally {
        pingBtn.disabled = false;
      }
    });
    pingHost.addEventListener("keydown", (e) => {
      if (e.key === "Enter") pingBtn.click();
    });

    probeBtn.addEventListener("click", async () => {
      if (!api?.tcp_probe) {
        setStatus(t("commonApiUnavailable"), "error");
        return;
      }
      const host = (body.querySelector("#nmProbeHost").value || "").trim() || "127.0.0.1";
      const port = parseInt(body.querySelector("#nmProbePort").value, 10) || 80;
      const timeout = parseFloat(body.querySelector("#nmProbeTimeout").value) || 2.0;
      setStatus(t("nmProbeRunning"));
      probeRes.textContent = "…";
      try {
        const res = await api.tcp_probe(host, port, timeout);
        if (res?.ok) {
          const icon = res.status === "open" ? "✓" : res.status === "timeout" ? "⏱" : "✕";
          probeRes.textContent = `${icon} ${res.status} — ${res.ms} ms`;
          setStatus("");
        } else {
          probeRes.textContent = res?.error || t("commonError", { err: "?" });
          setStatus(t("nmProbeErr"), "error");
        }
      } catch (err) {
        probeRes.textContent = String(err);
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    const portSkel = body.querySelector("#nmPortSkel");
    const portWrap = body.querySelector("#nmPortWrap");
    const portBody = body.querySelector("#nmPortBody");
    const portMeta = body.querySelector("#nmCheckPortMeta");

    body.querySelector("#nmCheckPortBtn").addEventListener("click", async () => {
      if (!api?.check_port) {
        setStatus(t("commonApiUnavailable"), "error");
        return;
      }
      const port = parseInt(body.querySelector("#nmCheckPort").value, 10) || 0;
      if (port < 1 || port > 65535) {
        setStatus(t("nmPortInvalid"), "error");
        return;
      }
      setStatus(t("nmPortChecking", { port }));
      portSkel.hidden = false;
      portWrap.hidden = true;
      try {
        const host = (body.querySelector("#nmProbeHost").value || "").trim() || "127.0.0.1";
        if (api.tcp_probe) {
          const probe = await api.tcp_probe(host, port, 2.0).catch(() => null);
          if (probe?.ok) {
            probeRes.textContent = `${probe.status} — ${probe.ms} ms (${host})`;
          }
        }
        const res = await api.check_port(port);
        portSkel.hidden = true;
        if (!res?.ok) {
          portMeta.textContent = res?.error || t("commonError", { err: "?" });
          setStatus(t("commonError", { err: res?.error || "?" }), "error");
          return;
        }
        const rows = Array.isArray(res.connections) ? res.connections : [];
        portMeta.textContent = rows.length
          ? t("nmPortOn", { n: rows.length, port })
          : t("nmPortNone", { port });
        if (!rows.length) {
          portWrap.hidden = true;
          setStatus("");
          return;
        }
        portWrap.hidden = false;
        portBody.innerHTML = rows
          .map(
            (c) =>
              `<tr>
            <td>${esc(c.proto || "")}</td>
            <td class="meta">${esc(c.laddr || "")}</td>
            <td class="meta">${esc(c.raddr || "")}</td>
            <td>${esc(c.status || "")}</td>
            <td>${esc(c.pid || "")}</td>
            <td title="${esc(c.path || "")}">${esc(c.name || "—")}</td>
            <td>${c.path ? `<button type="button" class="action-btn" data-open="${esc(c.path)}">${esc(t("nmFolder"))}</button>` : ""}</td>
          </tr>`
          )
          .join("");
        setStatus("");
      } catch (err) {
        portSkel.hidden = true;
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    portBody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-open]");
      if (!btn || !api?.open_path) return;
      const res = await api.open_path(btn.dataset.open || "");
      if (res?.ok) setStatus(t("nmFolderOpened"), "ok");
      else setStatus(t("commonError", { err: res?.error || "?" }), "error");
    });
  }

  // ─── PROXY ───────────────────────────────────────────────────────────────────

  async function buildProxy() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row" style="margin-bottom:10px">
          <button type="button" class="btn accent" id="nmProxyRead">${esc(t("nmProxyRead"))}</button>
          <button type="button" class="btn danger" id="nmProxyClear">${esc(t("nmProxyClear"))}</button>
        </div>
        <div class="card-grid" id="nmProxyCards">
          <p class="meta">${esc(t("nmProxyHint"))}</p>
        </div>
      </div>
      <div class="panel">
        <h3 style="font-size:.85rem;font-weight:600;margin-bottom:10px">${esc(t("nmProxySetTitle"))}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div>
            <label style="font-size:.74rem;color:var(--muted);display:block;margin-bottom:4px">HTTP_PROXY</label>
            <input type="text" id="nmProxyHttp" placeholder="http://proxy:port" autocomplete="off" />
          </div>
          <div>
            <label style="font-size:.74rem;color:var(--muted);display:block;margin-bottom:4px">HTTPS_PROXY</label>
            <input type="text" id="nmProxyHttps" placeholder="http://proxy:port" autocomplete="off" />
          </div>
          <div style="grid-column:1/-1">
            <label style="font-size:.74rem;color:var(--muted);display:block;margin-bottom:4px">NO_PROXY</label>
            <input type="text" id="nmProxyNoProxy" placeholder="localhost,127.0.0.1,…" autocomplete="off" />
          </div>
        </div>
        <button type="button" class="btn accent" id="nmProxySet">${esc(t("nmProxyApply"))}</button>
      </div>`;

    async function readProxies() {
      if (!api?.read_proxies) return;
      const cards = body.querySelector("#nmProxyCards");
      try {
        const res = await api.read_proxies();
        if (!res?.ok) {
          cards.innerHTML = `<p class="meta">${esc(res?.error || t("commonError", { err: "?" }))}</p>`;
          return;
        }
        const entries = Object.entries(res.proxies || {}).filter(([, v]) => v);
        if (!entries.length) {
          cards.innerHTML = `<p class="meta">${esc(t("nmProxyNone"))}</p>`;
          return;
        }
        cards.innerHTML = entries
          .map(
            ([k, v]) =>
              `<div class="card"><span class="label">${esc(k)}</span>
            <span class="value" style="font-size:.88rem;font-family:var(--mono,monospace)">${esc(v)}</span></div>`
          )
          .join("");
      } catch (err) {
        cards.innerHTML = `<p class="meta">${esc(String(err))}</p>`;
      }
    }

    body.querySelector("#nmProxyRead").addEventListener("click", readProxies);

    body.querySelector("#nmProxyClear").addEventListener("click", async () => {
      const ok = await askConfirm(t("nmProxyClearConfirm"), t("nmProxyClearTitle"));
      if (!ok) return;
      setStatus(t("nmProxyClearing"));
      try {
        const prep = await api.prepare_action("clear_user_env_proxy", {});
        if (!prep?.ok || !prep.token) {
          setStatus(t("naPrepError", { err: prep?.error || "?" }), "error");
          return;
        }
        const res = await api.clear_user_env_proxy(prep.token);
        if (res?.ok) {
          setStatus(t("nmProxyCleared"), "ok");
          await readProxies();
        } else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#nmProxySet").addEventListener("click", async () => {
      const http = body.querySelector("#nmProxyHttp").value.trim();
      const https = body.querySelector("#nmProxyHttps").value.trim();
      const noProxy = body.querySelector("#nmProxyNoProxy").value.trim();
      const ok = await askConfirm(t("nmProxySetConfirm"), t("nmProxySetTitle"));
      if (!ok) return;
      setStatus(t("nmProxySetting"));
      try {
        const prep = await api.prepare_action("set_user_env_proxy", { http, https, no_proxy: noProxy });
        if (!prep?.ok || !prep.token) {
          setStatus(t("naPrepError", { err: prep?.error || "?" }), "error");
          return;
        }
        const res = await api.set_user_env_proxy(http, https, noProxy, prep.token);
        if (res?.ok) {
          setStatus(t("nmProxySetOk"), "ok");
          await readProxies();
        } else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    await readProxies();
  }

  // ─── PARTAGES ────────────────────────────────────────────────────────────────

  async function buildShares() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="nmSharesRefresh">${esc(t("commonRefresh"))}</button>
          <p class="meta" id="nmSharesMeta" style="margin:0"></p>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div id="nmSharesSkel">${skelRows(4)}</div>
        <div class="empty-state" id="nmSharesEmpty" hidden>${esc(t("nmSharesLoading"))}</div>
        <div class="table-wrap" id="nmSharesWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>${esc(t("nmSharesColName"))}</th>
              <th>${esc(t("nmSharesColPath"))}</th>
              <th>${esc(t("nmSharesColDesc"))}</th>
              <th></th>
            </tr></thead>
            <tbody id="nmSharesBody"></tbody>
          </table>
        </div>
      </div>`;

    const skel = body.querySelector("#nmSharesSkel");
    body.querySelector("#nmSharesRefresh").addEventListener("click", loadShares);

    async function loadShares() {
      const emptyEl = body.querySelector("#nmSharesEmpty");
      const wrapEl = body.querySelector("#nmSharesWrap");
      const bodyEl = body.querySelector("#nmSharesBody");
      const metaEl = body.querySelector("#nmSharesMeta");
      if (!api?.list_shares) {
        setStatus(t("nmApiUnavailable"), "error");
        return;
      }
      setStatus(t("nmSharesLoadingStatus"));
      skel.hidden = false;
      emptyEl.hidden = true;
      wrapEl.hidden = true;
      try {
        const res = await api.list_shares();
        skel.hidden = true;
        if (!res?.ok) {
          emptyEl.hidden = false;
          emptyEl.textContent = res?.error || t("commonError", { err: "?" });
          setStatus(t("commonError", { err: res?.error || "?" }), "error");
          return;
        }
        const shares = Array.isArray(res.shares) ? res.shares : [];
        if (!shares.length) {
          emptyEl.hidden = false;
          emptyEl.textContent = t("nmSharesNone");
          setStatus("");
          return;
        }
        emptyEl.hidden = true;
        wrapEl.hidden = false;
        metaEl.textContent = t("nmSharesCount", { n: shares.length });
        bodyEl.innerHTML = shares
          .map(
            (s) =>
              `<tr>
            <td>${esc(s.name || "")}</td>
            <td class="meta">${esc(s.path || "")}</td>
            <td>${esc(s.description || s.caption || "")}</td>
            <td>${s.path ? `<button type="button" class="action-btn" data-open="${esc(s.path)}">${esc(t("nmOpen"))}</button>` : ""}</td>
          </tr>`
          )
          .join("");
        setStatus("");
      } catch (err) {
        skel.hidden = true;
        emptyEl.hidden = false;
        emptyEl.textContent = String(err);
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    body.querySelector("#nmSharesBody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-open]");
      if (!btn || !api?.open_path) return;
      const res = await api.open_path(btn.dataset.open || "");
      if (res?.ok) setStatus(t("nmFolderOpened"), "ok");
      else setStatus(t("commonError", { err: res?.error || "?" }), "error");
    });

    await loadShares();
  }

  // ─── SEGMENT ROUTER ──────────────────────────────────────────────────────────

  async function onSegment(seg) {
    setStatus("");
    if (seg === "connections") await buildConnections();
    else if (seg === "tools") await buildTools();
    else if (seg === "proxy") await buildProxy();
    else if (seg === "shares") await buildShares();
  }

  await setSegment("connections");
}
