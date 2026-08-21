/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * NetAdmin — native in-hub (no iframe).
 * Bridge: pywebview.api.netadmin.*
 * Segments: Adaptateurs | Fichier Hosts | Pare-feu
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

export async function mount(root) {
  const { body, setStatus, askConfirm, setSegment } = mountModuleShell(root, {
    title: "NetAdmin",
    subtitle: "Adaptateurs · Hosts · Pare-feu",
    segments: [
      { id: "adapters", label: "Adaptateurs" },
      { id: "hosts",    label: "Fichier Hosts" },
      { id: "firewall", label: "Pare-feu" },
    ],
    onSegment,
  });

  const api = await waitNs("netadmin", "read_hosts");

  // ─── ADAPTATEURS ─────────────────────────────────────────────────────────────

  async function buildAdapters() {
    body.innerHTML = `
      <div class="panel">
        <p style="font-size:.82rem;color:var(--muted);margin-bottom:12px">
          Actions sur la pile réseau Windows — confirmation requise pour chaque mutateur.
        </p>
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="naResetIp">Réinitialiser IP / TCP</button>
          <button type="button" class="btn" id="naResetWinsock">Reset Winsock</button>
          <button type="button" class="btn" id="naFlushDns">Vider cache DNS</button>
        </div>
      </div>`;

    async function doNetAction(action, label, msg) {
      if (!api?.prepare_action) { setStatus("API netadmin indisponible.", "error"); return; }
      const ok = await askConfirm(msg, label);
      if (!ok) return;
      setStatus(`${label} en cours…`);
      try {
        const prep = await api.prepare_action(action, {});
        if (!prep?.ok || !prep.token) { setStatus("Erreur préparation : " + (prep?.error || "refus"), "error"); return; }
        const res = action === "reset_ip"
          ? await api.reset_ip(prep.token)
          : action === "reset_winsock"
          ? await api.reset_winsock(prep.token)
          : await api.flush_dns(prep.token);
        if (res?.ok) setStatus(`${label} : opération réussie.`, "ok");
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    }

    body.querySelector("#naResetIp").addEventListener("click", () =>
      doNetAction("reset_ip", "Réinitialiser IP / TCP",
        "Réinitialiser la configuration IP/TCP ? Cela peut interrompre brièvement toutes les connexions actives.")
    );
    body.querySelector("#naResetWinsock").addEventListener("click", () =>
      doNetAction("reset_winsock", "Reset Winsock",
        "Réinitialiser le catalogue Winsock ? Un redémarrage peut être nécessaire pour que les changements prennent effet.")
    );
    body.querySelector("#naFlushDns").addEventListener("click", () =>
      doNetAction("flush_dns", "Vider cache DNS",
        "Vider le cache DNS local du système ?")
    );
  }

  // ─── FICHIER HOSTS ───────────────────────────────────────────────────────────

  let hostsProfiles = [];

  async function buildHosts() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="text" id="naResolveInput" placeholder="Résoudre un hostname…" autocomplete="off" />
          </div>
          <button type="button" class="btn" id="naResolveBtn">Résoudre</button>
          <span class="meta" id="naResolveResult" style="min-width:160px"></span>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:14px 16px 10px">
        <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
          <select id="naProfileSel" style="width:auto;flex:1;min-width:120px;max-width:200px">
            <option value="">— Profil —</option>
          </select>
          <button type="button" class="btn ghost" id="naLoadProfile">Charger</button>
          <input type="text" id="naProfileName" placeholder="Nouveau profil" autocomplete="off"
            style="flex:1;max-width:180px" />
          <button type="button" class="btn ghost" id="naSaveProfile">Sauvegarder</button>
          <button type="button" class="btn" id="naFlushDns2" title="Vider le cache DNS">Vider DNS</button>
        </div>
        <textarea id="naHostsText" spellcheck="false"
          style="flex:1;min-height:0;width:100%;resize:none;border-radius:10px;
                 border:1px solid var(--border);background:var(--bg1);color:var(--text);
                 font:13px/1.6 var(--mono,ui-monospace,monospace);padding:10px 12px;outline:none"></textarea>
        <div class="toolbar-row" style="flex-shrink:0;margin-top:8px">
          <button type="button" class="btn accent" id="naWriteHosts">Écrire le fichier hosts</button>
          <button type="button" class="btn ghost" id="naReloadHosts">Recharger</button>
        </div>
      </div>`;

    const textarea      = body.querySelector("#naHostsText");
    const resolveInput  = body.querySelector("#naResolveInput");
    const resolveBtn    = body.querySelector("#naResolveBtn");
    const resolveResult = body.querySelector("#naResolveResult");
    const profileSel    = body.querySelector("#naProfileSel");
    const profileName   = body.querySelector("#naProfileName");

    async function refreshProfiles() {
      if (!api?.list_profiles) return;
      try {
        const res = await api.list_profiles();
        hostsProfiles = Array.isArray(res?.profiles) ? res.profiles : [];
        profileSel.innerHTML = `<option value="">— Profil —</option>` +
          hostsProfiles.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
      } catch (_) {}
    }

    async function loadHosts() {
      if (!api?.read_hosts) { setStatus("API netadmin indisponible.", "error"); return; }
      setStatus("Lecture du fichier hosts…");
      try {
        const res = await api.read_hosts();
        if (res?.ok) { textarea.value = res.text || ""; setStatus(""); }
        else setStatus("Erreur lecture : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    }

    body.querySelector("#naReloadHosts").addEventListener("click", loadHosts);

    body.querySelector("#naWriteHosts").addEventListener("click", async () => {
      if (!api?.prepare_action) { setStatus("API indisponible.", "error"); return; }
      const ok = await askConfirm(
        "Écraser le fichier hosts avec le contenu de l'éditeur ? " +
        "Cette action modifie la résolution DNS locale du système.",
        "Écrire le fichier hosts"
      );
      if (!ok) return;
      setStatus("Écriture en cours…");
      try {
        const prep = await api.prepare_action("write_hosts", { text: textarea.value });
        if (!prep?.ok || !prep.token) { setStatus("Erreur préparation : " + (prep?.error || "refus"), "error"); return; }
        const res = await api.write_hosts(textarea.value, prep.token);
        if (res?.ok) setStatus("Fichier hosts écrit avec succès.", "ok");
        else setStatus("Erreur écriture : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    body.querySelector("#naFlushDns2").addEventListener("click", async () => {
      const ok = await askConfirm("Vider le cache DNS local du système ?", "Vider le cache DNS");
      if (!ok) return;
      setStatus("Vidage DNS…");
      try {
        const prep = await api.prepare_action("flush_dns", {});
        if (!prep?.ok || !prep.token) { setStatus("Erreur préparation flush_dns.", "error"); return; }
        const res = await api.flush_dns(prep.token);
        if (res?.ok) setStatus("Cache DNS vidé.", "ok");
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    body.querySelector("#naLoadProfile").addEventListener("click", async () => {
      const name = profileSel.value;
      if (!name || !api?.load_profile) return;
      setStatus("Chargement profil…");
      try {
        const res = await api.load_profile(name);
        if (res?.ok) { textarea.value = res.text || ""; setStatus(`Profil « ${name} » chargé.`, "ok"); }
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    body.querySelector("#naSaveProfile").addEventListener("click", async () => {
      const name = (profileName.value || "").trim();
      if (!name || !api?.save_profile) { setStatus("Nom de profil requis.", "error"); return; }
      setStatus("Sauvegarde profil…");
      try {
        const res = await api.save_profile(name, textarea.value);
        if (res?.ok) { await refreshProfiles(); setStatus(`Profil « ${name} » sauvegardé.`, "ok"); }
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    resolveBtn.addEventListener("click", async () => {
      const h = (resolveInput.value || "").trim();
      if (!h || !api?.resolve_host) return;
      resolveResult.textContent = "…";
      try {
        const res = await api.resolve_host(h);
        if (res?.ok) resolveResult.textContent = (res.addrs || []).join(", ") || res.addr || "Aucun résultat";
        else resolveResult.textContent = "Erreur : " + (res?.error || "?");
      } catch (err) { resolveResult.textContent = String(err); }
    });

    resolveInput.addEventListener("keydown", (e) => { if (e.key === "Enter") resolveBtn.click(); });

    await Promise.all([loadHosts(), refreshProfiles()]);
  }

  // ─── PARE-FEU ────────────────────────────────────────────────────────────────

  let rulesData = [];
  let rulesFilter = "";

  async function buildFirewall() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" id="naFwSearch" placeholder="Filtrer par nom de règle…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="naFwRefresh">Actualiser</button>
        </div>
        <p class="meta" id="naFwMeta"></p>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="naFwEmpty">Cliquer Actualiser pour charger les règles pare-feu.</div>
        <div class="table-wrap" id="naFwWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>Nom</th>
              <th>Direction</th>
              <th>Action</th>
              <th>Proto</th>
              <th>État</th>
              <th>Toggle</th>
            </tr></thead>
            <tbody id="naFwBody"></tbody>
          </table>
        </div>
      </div>`;

    const searchEl = body.querySelector("#naFwSearch");
    const metaEl   = body.querySelector("#naFwMeta");
    const emptyEl  = body.querySelector("#naFwEmpty");
    const wrapEl   = body.querySelector("#naFwWrap");
    const bodyEl   = body.querySelector("#naFwBody");

    function renderRules() {
      const q = rulesFilter.toLowerCase();
      const rows = q ? rulesData.filter(r => (r.name || "").toLowerCase().includes(q)) : rulesData;
      if (!rows.length) {
        emptyEl.hidden = false; wrapEl.hidden = true;
        metaEl.textContent = q ? "Aucune règle correspondante." : "Aucune règle.";
        return;
      }
      emptyEl.hidden = true; wrapEl.hidden = false;
      metaEl.textContent = `${rows.length} / ${rulesData.length} règle(s)`;
      bodyEl.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (const r of rows) {
        const tr = document.createElement("tr");
        const on = r.enabled !== false;
        tr.innerHTML =
          `<td class="wrap">${esc(r.name || "")}</td>` +
          `<td>${esc(r.direction || "")}</td>` +
          `<td>${esc(r.action || "")}</td>` +
          `<td>${esc(r.protocol || "")}</td>` +
          `<td><span style="color:${on ? "var(--ok,#3dd68c)" : "var(--muted)"}">${on ? "Activée" : "Désactivée"}</span></td>` +
          `<td><button type="button" class="action-btn${on ? "" : " danger"}" data-rule="${esc(r.name)}" data-enabled="${on}">` +
          `${on ? "Désactiver" : "Activer"}</button></td>`;
        frag.appendChild(tr);
      }
      bodyEl.appendChild(frag);
    }

    bodyEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-rule]");
      if (!btn || !api?.prepare_action) return;
      const name = btn.dataset.rule;
      const curEnabled = btn.dataset.enabled === "true";
      const next = !curEnabled;
      const ok = await askConfirm(
        `${next ? "Activer" : "Désactiver"} la règle pare-feu « ${name} » ?`,
        "Modifier une règle pare-feu"
      );
      if (!ok) return;
      setStatus("Modification de la règle…");
      try {
        const prep = await api.prepare_action("set_rule_enabled", { name, enabled: next });
        if (!prep?.ok || !prep.token) { setStatus("Erreur préparation : " + (prep?.error || "?"), "error"); return; }
        const res = await api.set_rule_enabled(name, next, prep.token);
        if (res?.ok) {
          const rule = rulesData.find(r => r.name === name);
          if (rule) rule.enabled = next;
          renderRules();
          setStatus(`Règle « ${name} » ${next ? "activée" : "désactivée"}.`, "ok");
        } else setStatus("Erreur modification : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    searchEl.addEventListener("input", () => { rulesFilter = searchEl.value || ""; renderRules(); });
    body.querySelector("#naFwRefresh").addEventListener("click", loadRules);

    async function loadRules() {
      if (!api?.list_rules) { setStatus("API netadmin indisponible.", "error"); return; }
      setStatus("Chargement des règles pare-feu…");
      emptyEl.hidden = false; wrapEl.hidden = true; emptyEl.textContent = "Chargement…";
      try {
        const res = await api.list_rules();
        if (!res?.ok) {
          emptyEl.textContent = "Erreur : " + (res?.error || "?");
          setStatus("Erreur chargement règles.", "error");
          return;
        }
        rulesData = Array.isArray(res.rules) ? res.rules : [];
        emptyEl.textContent = "Aucune règle pare-feu.";
        renderRules();
        setStatus("");
      } catch (err) {
        emptyEl.textContent = String(err);
        setStatus("Erreur : " + String(err), "error");
      }
    }

    await loadRules();
  }

  // ─── SEGMENT ROUTER ──────────────────────────────────────────────────────────

  async function onSegment(seg) {
    setStatus("");
    if (seg === "adapters")  await buildAdapters();
    else if (seg === "hosts")    await buildHosts();
    else if (seg === "firewall") await buildFirewall();
  }

  await setSegment("adapters");
}
