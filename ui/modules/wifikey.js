/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * WifiKey — native in-hub (no iframe).
 * Bridge: pywebview.api.wifikey.*
 * Segments: Profils Wi-Fi
 */
import { t } from "../i18n.js";
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

export async function mount(root) {
  const { body, setStatus, askConfirm, setSegment } = mountModuleShell(root, {
    title: t("wkTitle"),
    subtitle: t("wkSubtitle"),
    segments: [{ id: "profiles", label: t("wkSegProfiles") }],
    onSegment,
  });

  const api = await waitNs("wifikey", "list_profiles");
  let profilesData = [];

  async function buildProfiles() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" id="wkSearch" placeholder="${esc(t("wkSearchPh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="wkRefresh">${esc(t("commonRefresh"))}</button>
        </div>
        <p class="meta" id="wkMeta"></p>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="wkEmpty">${esc(t("wkLoading"))}</div>
        <div class="table-wrap" id="wkWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>${esc(t("wkColName"))}</th>
              <th>${esc(t("wkColAuth"))}</th>
              <th>${esc(t("wkColCipher"))}</th>
              <th>${esc(t("wkColMode"))}</th>
              <th>${esc(t("wkColKey"))}</th>
            </tr></thead>
            <tbody id="wkBody"></tbody>
          </table>
        </div>
      </div>
      <div id="wkKeyPanel" class="panel" style="flex-shrink:0;display:none">
        <div class="toolbar-row">
          <span class="meta" id="wkKeyLabel" style="flex:1"></span>
          <code id="wkKeyValue"
            style="font-family:var(--mono,monospace);font-size:.92rem;
                   padding:5px 10px;background:var(--bg1);border:1px solid var(--border);
                   border-radius:8px;user-select:all;word-break:break-all"></code>
          <button type="button" class="btn ghost" id="wkKeyClose" title="✕">✕</button>
        </div>
      </div>`;

    const searchEl = body.querySelector("#wkSearch");
    const metaEl = body.querySelector("#wkMeta");
    const emptyEl = body.querySelector("#wkEmpty");
    const wrapEl = body.querySelector("#wkWrap");
    const bodyEl = body.querySelector("#wkBody");
    const keyPanel = body.querySelector("#wkKeyPanel");
    const keyLabel = body.querySelector("#wkKeyLabel");
    const keyValue = body.querySelector("#wkKeyValue");

    body.querySelector("#wkKeyClose").addEventListener("click", () => {
      keyPanel.style.display = "none";
      keyValue.textContent = "";
    });

    function getFiltered() {
      const q = (searchEl.value || "").toLowerCase().trim();
      return q ? profilesData.filter((p) => (p.name || "").toLowerCase().includes(q)) : profilesData;
    }

    function renderProfiles() {
      const rows = getFiltered();
      if (!rows.length) {
        emptyEl.hidden = false;
        wrapEl.hidden = true;
        metaEl.textContent = profilesData.length ? t("wkNoMatch") : t("wkNone");
        return;
      }
      emptyEl.hidden = true;
      wrapEl.hidden = false;
      metaEl.textContent = t("wkCount", { shown: rows.length, total: profilesData.length });
      bodyEl.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (const p of rows) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td>${esc(p.name || "")}</td>` +
          `<td>${esc(p.auth || p.authentication || "")}</td>` +
          `<td>${esc(p.cipher || p.encryption || "")}</td>` +
          `<td>${esc(p.mode || "")}</td>` +
          `<td><button type="button" class="action-btn" data-profile="${esc(p.name || "")}">` +
          `${esc(t("wkShowKey"))}</button></td>`;
        frag.appendChild(tr);
      }
      bodyEl.appendChild(frag);
    }

    bodyEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-profile]");
      if (!btn || !api?.prepare_get_key) return;
      const profile = btn.dataset.profile;
      const ok = await askConfirm(t("wkConfirm", { profile }), t("wkConfirmTitle"));
      if (!ok) return;
      setStatus(t("wkFetching"));
      keyPanel.style.display = "none";
      try {
        const prep = await api.prepare_get_key(profile);
        if (!prep?.ok || !prep.token) {
          setStatus(t("naPrepError", { err: prep?.error || "refus" }), "error");
          return;
        }
        const res = await api.get_key(profile, prep.token);
        if (res?.ok) {
          keyLabel.textContent = t("wkKeyLabel", { profile });
          keyValue.textContent = res.key || t("wkKeyEmpty");
          keyPanel.style.display = "";
          setStatus("");
        } else {
          setStatus(t("commonError", { err: res?.error || "?" }), "error");
        }
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    searchEl.addEventListener("input", renderProfiles);
    body.querySelector("#wkRefresh").addEventListener("click", loadProfiles);

    async function loadProfiles() {
      if (!api?.list_profiles) {
        setStatus(t("wkApiUnavailable"), "error");
        return;
      }
      setStatus(t("wkLoadingStatus"));
      emptyEl.hidden = false;
      wrapEl.hidden = true;
      emptyEl.textContent = t("commonLoading");
      keyPanel.style.display = "none";
      try {
        const res = await api.list_profiles();
        if (!res?.ok) {
          emptyEl.textContent = res?.error || t("commonError", { err: "?" });
          setStatus(t("commonError", { err: res?.error || "?" }), "error");
          return;
        }
        profilesData = Array.isArray(res.profiles) ? res.profiles : [];
        emptyEl.textContent = t("wkNoneFound");
        renderProfiles();
        setStatus(t("wkLoaded", { n: profilesData.length }));
      } catch (err) {
        emptyEl.textContent = String(err);
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    await loadProfiles();
  }

  async function onSegment(seg) {
    setStatus("");
    if (seg === "profiles") await buildProfiles();
  }

  await setSegment("profiles");
}
