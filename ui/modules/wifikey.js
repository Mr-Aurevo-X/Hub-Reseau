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
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

export async function mount(root) {
  const { body, setStatus, askConfirm, setSegment } = mountModuleShell(root, {
    title: "WifiKey",
    subtitle: "Profils WLAN et clés de sécurité — ConfirmGate",
    segments: [
      { id: "profiles", label: "Profils Wi-Fi" },
    ],
    onSegment,
  });

  const api = await waitNs("wifikey", "list_profiles");

  // ─── PROFILS ─────────────────────────────────────────────────────────────────

  let profilesData = [];

  async function buildProfiles() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" id="wkSearch" placeholder="Filtrer profils Wi-Fi…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="wkRefresh">Actualiser</button>
        </div>
        <p class="meta" id="wkMeta"></p>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="wkEmpty">Chargement des profils Wi-Fi…</div>
        <div class="table-wrap" id="wkWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>Nom du profil (SSID)</th>
              <th>Authentification</th>
              <th>Chiffrement</th>
              <th>Mode</th>
              <th>Clé</th>
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
          <button type="button" class="btn ghost" id="wkKeyClose" title="Masquer la clé">✕</button>
        </div>
      </div>`;

    const searchEl = body.querySelector("#wkSearch");
    const metaEl   = body.querySelector("#wkMeta");
    const emptyEl  = body.querySelector("#wkEmpty");
    const wrapEl   = body.querySelector("#wkWrap");
    const bodyEl   = body.querySelector("#wkBody");
    const keyPanel = body.querySelector("#wkKeyPanel");
    const keyLabel = body.querySelector("#wkKeyLabel");
    const keyValue = body.querySelector("#wkKeyValue");

    body.querySelector("#wkKeyClose").addEventListener("click", () => {
      keyPanel.style.display = "none";
      keyValue.textContent = "";
    });

    function getFiltered() {
      const q = (searchEl.value || "").toLowerCase().trim();
      return q ? profilesData.filter(p => (p.name || "").toLowerCase().includes(q)) : profilesData;
    }

    function renderProfiles() {
      const rows = getFiltered();
      if (!rows.length) {
        emptyEl.hidden = false; wrapEl.hidden = true;
        metaEl.textContent = profilesData.length ? "Aucun profil correspondant." : "Aucun profil Wi-Fi.";
        return;
      }
      emptyEl.hidden = true; wrapEl.hidden = false;
      metaEl.textContent = `${rows.length} / ${profilesData.length} profil(s)`;
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
          `Afficher la clé</button></td>`;
        frag.appendChild(tr);
      }
      bodyEl.appendChild(frag);
    }

    bodyEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-profile]");
      if (!btn || !api?.prepare_get_key) return;
      const profile = btn.dataset.profile;
      const ok = await askConfirm(
        `Révéler la clé de sécurité du profil Wi-Fi « ${profile} » ? ` +
        "Cette information est sensible — ne la partagez pas.",
        "Afficher la clé Wi-Fi"
      );
      if (!ok) return;
      setStatus("Récupération de la clé…");
      keyPanel.style.display = "none";
      try {
        const prep = await api.prepare_get_key(profile);
        if (!prep?.ok || !prep.token) {
          setStatus("Erreur préparation : " + (prep?.error || "refus"), "error");
          return;
        }
        const res = await api.get_key(profile, prep.token);
        if (res?.ok) {
          keyLabel.textContent = `Clé du profil « ${profile} » :`;
          keyValue.textContent = res.key || "(vide)";
          keyPanel.style.display = "";
          setStatus("");
        } else {
          setStatus("Erreur récupération clé : " + (res?.error || "?"), "error");
        }
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    searchEl.addEventListener("input", renderProfiles);
    body.querySelector("#wkRefresh").addEventListener("click", loadProfiles);

    async function loadProfiles() {
      if (!api?.list_profiles) { setStatus("API wifikey indisponible.", "error"); return; }
      setStatus("Chargement profils Wi-Fi…");
      emptyEl.hidden = false; wrapEl.hidden = true; emptyEl.textContent = "Chargement…";
      keyPanel.style.display = "none";
      try {
        const res = await api.list_profiles();
        if (!res?.ok) {
          emptyEl.textContent = res?.error || "Erreur";
          setStatus("Erreur : " + (res?.error || "?"), "error");
          return;
        }
        profilesData = Array.isArray(res.profiles) ? res.profiles : [];
        emptyEl.textContent = "Aucun profil Wi-Fi trouvé.";
        renderProfiles();
        setStatus(`${profilesData.length} profil(s) chargé(s).`);
      } catch (err) {
        emptyEl.textContent = String(err);
        setStatus("Erreur : " + String(err), "error");
      }
    }

    await loadProfiles();
  }

  // ─── SEGMENT ROUTER ──────────────────────────────────────────────────────────

  async function onSegment(seg) {
    setStatus("");
    if (seg === "profiles") await buildProfiles();
  }

  await setSegment("profiles");
}
