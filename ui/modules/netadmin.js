/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * NetAdmin — native in-hub (no iframe).
 * Bridge: pywebview.api.netadmin.*
 * Segments: Adaptateurs | Fichier Hosts | Pare-feu | DNS
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";
import { t } from "../i18n.js";

export async function mount(root) {
  const { body, setStatus, askConfirm, setSegment } = mountModuleShell(root, {
    title: t("naTitle"),
    subtitle: t("naSubtitle"),
    segments: [
      { id: "adapters", label: t("naSegAdapters") },
      { id: "hosts", label: t("naSegHosts") },
      { id: "firewall", label: t("naSegFirewall") },
      { id: "dns", label: t("naSegDns") },
    ],
    onSegment,
  });

  const api = await waitNs("netadmin", "read_hosts");

  // ─── ADAPTATEURS ─────────────────────────────────────────────────────────────

  async function buildAdapters() {
    body.innerHTML = `
      <div class="panel">
        <p style="font-size:.82rem;color:var(--muted);margin-bottom:12px">
          ${esc(t("naAdaptersHint"))}
        </p>
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="naResetIp">${esc(t("naResetIp"))}</button>
          <button type="button" class="btn" id="naResetWinsock">${esc(t("naResetWinsock"))}</button>
          <button type="button" class="btn" id="naFlushDns">${esc(t("naFlushDns"))}</button>
        </div>
      </div>`;

    async function doNetAction(action, label, msg) {
      if (!api?.prepare_action) {
        setStatus(t("naApiUnavailable"), "error");
        return;
      }
      const ok = await askConfirm(msg, label);
      if (!ok) return;
      setStatus(t("naInProgress", { label }));
      try {
        const prep = await api.prepare_action(action, {});
        if (!prep?.ok || !prep.token) {
          setStatus(t("naPrepError", { err: prep?.error || "refus" }), "error");
          return;
        }
        const res =
          action === "reset_ip"
            ? await api.reset_ip(prep.token)
            : action === "reset_winsock"
              ? await api.reset_winsock(prep.token)
              : await api.flush_dns(prep.token);
        if (res?.ok) setStatus(t("naSuccess", { label }), "ok");
        else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    body.querySelector("#naResetIp").addEventListener("click", () =>
      doNetAction("reset_ip", t("naResetIp"), t("naConfirmResetIp"))
    );
    body.querySelector("#naResetWinsock").addEventListener("click", () =>
      doNetAction("reset_winsock", t("naResetWinsock"), t("naConfirmWinsock"))
    );
    body.querySelector("#naFlushDns").addEventListener("click", () =>
      doNetAction("flush_dns", t("naFlushDns"), t("naConfirmFlushDns"))
    );
  }

  // ─── FICHIER HOSTS ───────────────────────────────────────────────────────────

  let hostsProfiles = [];

  async function buildHosts() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="text" id="naResolveInput" placeholder="${esc(t("naResolvePh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn" id="naResolveBtn">${esc(t("naResolve"))}</button>
          <span class="meta" id="naResolveResult" style="min-width:160px"></span>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:14px 16px 10px">
        <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
          <select id="naProfileSel" style="width:auto;flex:1;min-width:120px;max-width:200px">
            <option value="">${esc(t("naProfileOpt"))}</option>
          </select>
          <button type="button" class="btn ghost" id="naLoadProfile">${esc(t("naLoadProfile"))}</button>
          <input type="text" id="naProfileName" placeholder="${esc(t("naProfileNamePh"))}" autocomplete="off"
            style="flex:1;max-width:180px" />
          <button type="button" class="btn ghost" id="naSaveProfile">${esc(t("naSaveProfile"))}</button>
          <button type="button" class="btn" id="naFlushDns2" title="${esc(t("naConfirmFlushDns"))}">${esc(t("naFlushDnsShort"))}</button>
        </div>
        <textarea id="naHostsText" spellcheck="false"
          style="flex:1;min-height:0;width:100%;resize:none;border-radius:10px;
                 border:1px solid var(--border);background:var(--bg1);color:var(--text);
                 font:13px/1.6 var(--mono,ui-monospace,monospace);padding:10px 12px;outline:none"></textarea>
        <div class="toolbar-row" style="flex-shrink:0;margin-top:8px">
          <button type="button" class="btn accent" id="naWriteHosts">${esc(t("naWriteHosts"))}</button>
          <button type="button" class="btn ghost" id="naReloadHosts">${esc(t("naReloadHosts"))}</button>
        </div>
      </div>`;

    const textarea = body.querySelector("#naHostsText");
    const resolveInput = body.querySelector("#naResolveInput");
    const resolveBtn = body.querySelector("#naResolveBtn");
    const resolveResult = body.querySelector("#naResolveResult");
    const profileSel = body.querySelector("#naProfileSel");
    const profileName = body.querySelector("#naProfileName");

    async function refreshProfiles() {
      if (!api?.list_profiles) return;
      try {
        const res = await api.list_profiles();
        hostsProfiles = Array.isArray(res?.profiles) ? res.profiles : [];
        profileSel.innerHTML =
          `<option value="">${esc(t("naProfileOpt"))}</option>` +
          hostsProfiles.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
      } catch (_) {}
    }

    async function loadHosts() {
      if (!api?.read_hosts) {
        setStatus(t("naApiUnavailable"), "error");
        return;
      }
      setStatus(t("naReadingHosts"));
      try {
        const res = await api.read_hosts();
        if (res?.ok) {
          textarea.value = res.text || "";
          setStatus("");
        } else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    body.querySelector("#naReloadHosts").addEventListener("click", loadHosts);

    body.querySelector("#naWriteHosts").addEventListener("click", async () => {
      if (!api?.prepare_action) {
        setStatus(t("commonApiUnavailable"), "error");
        return;
      }
      const ok = await askConfirm(t("naWriteConfirm"), t("naWriteHosts"));
      if (!ok) return;
      setStatus(t("naWriting"));
      try {
        const prep = await api.prepare_action("write_hosts", { text: textarea.value });
        if (!prep?.ok || !prep.token) {
          setStatus(t("naPrepError", { err: prep?.error || "refus" }), "error");
          return;
        }
        const res = await api.write_hosts(textarea.value, prep.token);
        if (res?.ok) setStatus(t("naHostsWritten"), "ok");
        else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#naFlushDns2").addEventListener("click", async () => {
      const ok = await askConfirm(t("naConfirmFlushDns"), t("naFlushDns"));
      if (!ok) return;
      setStatus(t("naFlushingDns"));
      try {
        const prep = await api.prepare_action("flush_dns", {});
        if (!prep?.ok || !prep.token) {
          setStatus(t("naPrepError", { err: prep?.error || "refus" }), "error");
          return;
        }
        const res = await api.flush_dns(prep.token);
        if (res?.ok) setStatus(t("naDnsFlushed"), "ok");
        else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#naLoadProfile").addEventListener("click", async () => {
      const name = profileSel.value;
      if (!name || !api?.load_profile) return;
      setStatus(t("naLoadingProfile"));
      try {
        const res = await api.load_profile(name);
        if (res?.ok) {
          textarea.value = res.text || "";
          setStatus(t("naProfileLoaded", { name }), "ok");
        } else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#naSaveProfile").addEventListener("click", async () => {
      const name = (profileName.value || "").trim();
      if (!name || !api?.save_profile) {
        setStatus(t("naProfileNameRequired"), "error");
        return;
      }
      setStatus(t("naSavingProfile"));
      try {
        const res = await api.save_profile(name, textarea.value);
        if (res?.ok) {
          await refreshProfiles();
          setStatus(t("naProfileSaved", { name }), "ok");
        } else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    resolveBtn.addEventListener("click", async () => {
      const h = (resolveInput.value || "").trim();
      if (!h || !api?.resolve_host) return;
      resolveResult.textContent = "…";
      try {
        const res = await api.resolve_host(h);
        if (res?.ok)
          resolveResult.textContent =
            (res.addrs || []).join(", ") || res.addr || t("commonNoResult");
        else resolveResult.textContent = t("commonError", { err: res?.error || "?" });
      } catch (err) {
        resolveResult.textContent = String(err);
      }
    });

    resolveInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") resolveBtn.click();
    });

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
            <input type="search" id="naFwSearch" placeholder="${esc(t("naFwSearchPh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="naFwRefresh">${esc(t("commonRefresh"))}</button>
        </div>
        <p class="meta" id="naFwMeta"></p>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="naFwEmpty">${esc(t("naFwEmptyHint"))}</div>
        <div class="table-wrap" id="naFwWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>${esc(t("naFwColName"))}</th>
              <th>${esc(t("naFwColDir"))}</th>
              <th>${esc(t("naFwColAction"))}</th>
              <th>${esc(t("naFwColProto"))}</th>
              <th>${esc(t("naFwColState"))}</th>
              <th>${esc(t("naFwColToggle"))}</th>
            </tr></thead>
            <tbody id="naFwBody"></tbody>
          </table>
        </div>
      </div>`;

    const searchEl = body.querySelector("#naFwSearch");
    const metaEl = body.querySelector("#naFwMeta");
    const emptyEl = body.querySelector("#naFwEmpty");
    const wrapEl = body.querySelector("#naFwWrap");
    const bodyEl = body.querySelector("#naFwBody");

    function renderRules() {
      const q = rulesFilter.toLowerCase();
      const rows = q ? rulesData.filter((r) => (r.name || "").toLowerCase().includes(q)) : rulesData;
      if (!rows.length) {
        emptyEl.hidden = false;
        wrapEl.hidden = true;
        metaEl.textContent = q ? t("naFwNoMatch") : t("naFwNone");
        return;
      }
      emptyEl.hidden = true;
      wrapEl.hidden = false;
      metaEl.textContent = t("naFwCount", { shown: rows.length, total: rulesData.length });
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
          `<td><span style="color:${on ? "var(--ok,#3dd68c)" : "var(--muted)"}">${on ? t("naFwEnabled") : t("naFwDisabled")}</span></td>` +
          `<td><button type="button" class="action-btn${on ? "" : " danger"}" data-rule="${esc(r.name)}" data-enabled="${on}">` +
          `${on ? t("naFwDisable") : t("naFwEnable")}</button></td>`;
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
      const action = next ? t("naFwEnable") : t("naFwDisable");
      const ok = await askConfirm(t("naFwConfirm", { action, name }), t("naFwConfirmTitle"));
      if (!ok) return;
      setStatus(t("naFwModifying"));
      try {
        const prep = await api.prepare_action("set_rule_enabled", { name, enabled: next });
        if (!prep?.ok || !prep.token) {
          setStatus(t("naPrepError", { err: prep?.error || "?" }), "error");
          return;
        }
        const res = await api.set_rule_enabled(name, next, prep.token);
        if (res?.ok) {
          const rule = rulesData.find((r) => r.name === name);
          if (rule) rule.enabled = next;
          renderRules();
          setStatus(
            t("naFwDone", { name, state: next ? t("naFwEnabled").toLowerCase() : t("naFwDisabled").toLowerCase() }),
            "ok"
          );
        } else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    searchEl.addEventListener("input", () => {
      rulesFilter = searchEl.value || "";
      renderRules();
    });
    body.querySelector("#naFwRefresh").addEventListener("click", loadRules);

    async function loadRules() {
      if (!api?.list_rules) {
        setStatus(t("naApiUnavailable"), "error");
        return;
      }
      setStatus(t("naFwLoading"));
      emptyEl.hidden = false;
      wrapEl.hidden = true;
      emptyEl.textContent = t("commonLoading");
      try {
        const res = await api.list_rules();
        if (!res?.ok) {
          emptyEl.textContent = t("commonError", { err: res?.error || "?" });
          setStatus(t("commonError", { err: res?.error || "?" }), "error");
          return;
        }
        rulesData = Array.isArray(res.rules) ? res.rules : [];
        emptyEl.textContent = t("naFwNoneFound");
        renderRules();
        setStatus("");
      } catch (err) {
        emptyEl.textContent = String(err);
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    await loadRules();
  }

  // ─── DNS PRESETS ─────────────────────────────────────────────────────────────

  async function buildDns() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <p style="font-size:.82rem;color:var(--muted);margin-bottom:12px">
          ${esc(t("naDnsHint"))}
        </p>
        <div class="toolbar-row" id="naDnsPresets" style="flex-wrap:wrap;gap:8px"></div>
        <div class="toolbar-row" style="margin-top:12px;flex-wrap:wrap;gap:8px;align-items:center">
          <label class="meta" for="naDnsPrimary" style="margin:0">${esc(t("naDnsCustomLabel"))}</label>
          <input type="text" id="naDnsPrimary" placeholder="${esc(t("naDnsPrimaryPh"))}" autocomplete="off"
            style="min-width:160px;max-width:220px" spellcheck="false" />
          <input type="text" id="naDnsSecondary" placeholder="${esc(t("naDnsSecondaryPh"))}" autocomplete="off"
            style="min-width:160px;max-width:220px" spellcheck="false" />
          <button type="button" class="btn accent" id="naDnsCustomApply">${esc(t("naDnsCustomApply"))}</button>
        </div>
        <div class="toolbar-row" style="margin-top:10px">
          <button type="button" class="btn ghost" id="naDnsRefresh">${esc(t("naDnsRefresh"))}</button>
          <button type="button" class="btn" id="naDnsFlush">${esc(t("naFlushDns"))}</button>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div class="empty-state" id="naDnsEmpty">${esc(t("commonLoading"))}</div>
        <div class="table-wrap" id="naDnsWrap" hidden>
          <table class="data">
            <thead><tr><th>${esc(t("naDnsColAdapter"))}</th><th>${esc(t("naDnsColServers"))}</th></tr></thead>
            <tbody id="naDnsBody"></tbody>
          </table>
        </div>
      </div>`;

    const presetsEl = body.querySelector("#naDnsPresets");
    const emptyEl = body.querySelector("#naDnsEmpty");
    const wrapEl = body.querySelector("#naDnsWrap");
    const tbody = body.querySelector("#naDnsBody");
    const primaryEl = body.querySelector("#naDnsPrimary");
    const secondaryEl = body.querySelector("#naDnsSecondary");

    function isDnsIp(value) {
      const s = String(value || "").trim();
      if (!s) return false;
      if (/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(s)) {
        return true;
      }
      if (s.includes(":") && /^[0-9a-fA-F:.]+$/.test(s) && s.length <= 45) {
        return true;
      }
      return false;
    }

    async function loadCurrent() {
      if (!api?.get_current_dns) {
        emptyEl.hidden = false;
        wrapEl.hidden = true;
        emptyEl.textContent = t("naDnsUnavailable");
        return;
      }
      setStatus(t("naDnsReading"));
      try {
        const res = await api.get_current_dns();
        const rows = Array.isArray(res?.adapters) ? res.adapters : [];
        if (!rows.length) {
          emptyEl.hidden = false;
          wrapEl.hidden = true;
          emptyEl.textContent =
            res?.ok === false ? res.error || t("commonError", { err: "?" }) : t("naDnsNoAdapters");
          setStatus(res?.ok === false ? t("commonError", { err: "DNS" }) : "", res?.ok === false ? "error" : "");
          return;
        }
        emptyEl.hidden = true;
        wrapEl.hidden = false;
        tbody.innerHTML = rows
          .map(
            (r) =>
              `<tr><td>${esc(r.InterfaceAlias || r.alias || "—")}</td>` +
              `<td class="meta">${esc(
                r.servers ||
                  (Array.isArray(r.ServerAddresses) ? r.ServerAddresses.join(", ") : "—")
              )}</td></tr>`
          )
          .join("");
        setStatus("");
      } catch (err) {
        emptyEl.hidden = false;
        wrapEl.hidden = true;
        emptyEl.textContent = String(err);
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    async function applyPreset(id, name) {
      if (!api?.prepare_action || !api?.set_dns_preset) {
        setStatus(t("naDnsUnavailable"), "error");
        return;
      }
      const ok = await askConfirm(t("naDnsPresetConfirm", { name }), t("naDnsPresetTitle", { name }));
      if (!ok) return;
      setStatus(t("naDnsApplying", { name }));
      try {
        const payload = { preset_id: id };
        const prep = await api.prepare_action("set_dns_preset", payload);
        if (!prep?.ok || !prep.token) {
          setStatus(t("naDnsGateError", { err: prep?.error || "refus" }), "error");
          return;
        }
        const res = await api.set_dns_preset(id, prep.token);
        if (res?.ok) {
          setStatus(res.message || t("naDnsApplied", { name }), "ok");
          await loadCurrent();
        } else {
          setStatus(t("commonError", { err: res?.error || "?" }), "error");
        }
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    async function applyCustom() {
      if (!api?.prepare_action || !api?.set_dns_custom) {
        setStatus(t("naDnsCustomUnavailable"), "error");
        return;
      }
      const primary = String(primaryEl?.value || "").trim();
      const secondary = String(secondaryEl?.value || "").trim();
      if (!primary) {
        setStatus(t("naDnsNeedPrimary"), "error");
        primaryEl?.focus();
        return;
      }
      if (!isDnsIp(primary)) {
        setStatus(t("naDnsBadPrimary"), "error");
        primaryEl?.focus();
        return;
      }
      if (secondary && !isDnsIp(secondary)) {
        setStatus(t("naDnsBadSecondary"), "error");
        secondaryEl?.focus();
        return;
      }
      const label = secondary ? `${primary} / ${secondary}` : primary;
      const ok = await askConfirm(t("naDnsCustomConfirm", { label }), t("naDnsCustomTitle"));
      if (!ok) return;
      setStatus(t("naDnsCustomApplying"));
      try {
        const payload = { primary, secondary };
        const prep = await api.prepare_action("set_dns_custom", payload);
        if (!prep?.ok || !prep.token) {
          setStatus(t("naDnsGateError", { err: prep?.error || "refus" }), "error");
          return;
        }
        const res = await api.set_dns_custom(primary, secondary, prep.token);
        if (res?.ok) {
          setStatus(res.message || t("naDnsCustomApplied", { label }), "ok");
          await loadCurrent();
        } else {
          setStatus(t("commonError", { err: res?.error || "?" }), "error");
        }
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    if (api?.list_dns_presets) {
      try {
        const res = await api.list_dns_presets();
        const presets = Array.isArray(res?.presets) ? res.presets : [];
        presetsEl.innerHTML = presets
          .map((p) => {
            const label = p.id === "dhcp" ? t("naDnsPresetDhcp") : p.name || p.id;
            return `<button type="button" class="btn ${p.id === "cloudflare" ? "accent" : ""}" data-dns="${esc(p.id)}" data-name="${esc(label)}">${esc(label)}${
              p.servers?.length ? ` · ${esc(p.servers.join(" / "))}` : ""
            }</button>`;
          })
          .join("");
        presetsEl.addEventListener("click", (ev) => {
          const btn = ev.target.closest("[data-dns]");
          if (!btn) return;
          applyPreset(btn.dataset.dns, btn.dataset.name || btn.dataset.dns);
        });
      } catch (_) {
        presetsEl.innerHTML = `<span class="meta">${esc(t("naDnsPresetsUnavailable"))}</span>`;
      }
    }

    body.querySelector("#naDnsCustomApply")?.addEventListener("click", () => {
      void applyCustom();
    });
    primaryEl?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        void applyCustom();
      }
    });
    secondaryEl?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        void applyCustom();
      }
    });

    body.querySelector("#naDnsRefresh")?.addEventListener("click", loadCurrent);
    body.querySelector("#naDnsFlush")?.addEventListener("click", () =>
      (async () => {
        const ok = await askConfirm(t("naConfirmFlushDns"), t("naFlushDns"));
        if (!ok || !api?.prepare_action) return;
        setStatus(t("naFlushingDns"));
        try {
          const prep = await api.prepare_action("flush_dns", {});
          if (!prep?.ok || !prep.token) {
            setStatus(t("naDnsGateError", { err: "refus" }), "error");
            return;
          }
          const res = await api.flush_dns(prep.token);
          setStatus(
            res?.ok ? t("naDnsFlushed") : t("commonError", { err: res?.error || "?" }),
            res?.ok ? "ok" : "error"
          );
        } catch (err) {
          setStatus(t("commonError", { err: String(err) }), "error");
        }
      })()
    );

    await loadCurrent();
  }

  // ─── SEGMENT ROUTER ──────────────────────────────────────────────────────────

  async function onSegment(seg) {
    setStatus("");
    if (seg === "adapters") await buildAdapters();
    else if (seg === "hosts") await buildHosts();
    else if (seg === "firewall") await buildFirewall();
    else if (seg === "dns") await buildDns();
  }

  await setSegment("adapters");
}
