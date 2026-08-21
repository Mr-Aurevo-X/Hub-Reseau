/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * Traffic — native in-hub (no iframe). SoT historique: Lab/RoadWay-X
 * Bridge: pywebview.api.roadway.*
 * Segments: Trafic | À trancher | Alertes | Règles | DNS
 * ConfirmGate on kill / block / startup. Skeletons on heavy ops.
 */
import { t, locale, getLang } from "../i18n.js";
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

function skelRows(n = 5) {
  return Array.from({ length: n }, () => `<div class="hub-skel" style="height:28px;margin:6px 10px;border-radius:6px"></div>`).join("");
}

function parseRemote(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ip: "", port: 0 };
  const lastColon = s.lastIndexOf(":");
  if (lastColon <= 0) return { ip: s, port: 0 };
  const maybePort = s.slice(lastColon + 1);
  if (/^\d+$/.test(maybePort)) {
    return { ip: s.slice(0, lastColon).replace(/^\[|\]$/g, ""), port: parseInt(maybePort, 10) || 0 };
  }
  return { ip: s, port: 0 };
}

export async function mount(root) {
  const { body, setStatus, askConfirm, setSegment } = mountModuleShell(root, {
    title: t("rwTitle"),
    subtitle: t("rwSubtitle"),
    segments: [
      { id: "traffic", label: t("rwSegTraffic") },
      { id: "quiz", label: t("rwSegQuiz") },
      { id: "alerts", label: t("rwSegAlerts") },
      { id: "rules", label: t("rwSegRules") },
      { id: "dns", label: t("rwSegDns") },
    ],
    onSegment,
  });

  const api = await waitNs("roadway", "get_snapshot");
  let pollTimer = null;
  let rulesCache = {};

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function withGate(action, payload, runner) {
    const prep = await api.prepare_action(action, payload || {});
    if (!prep?.ok || !prep.token) {
      setStatus(t("rwGateError", { err: prep?.error || "?" }), "error");
      return null;
    }
    return runner(prep.token);
  }

  // ─── TRAFIC ──────────────────────────────────────────────────────────────────

  async function buildTraffic() {
    stopPoll();
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwStart">${esc(t("rwStart"))}</button>
          <button type="button" class="btn" id="rwStop" disabled>${esc(t("rwStop"))}</button>
          <span class="meta" id="rwMonMeta" style="margin-left:6px"></span>
          <div style="flex:1"></div>
          <button type="button" class="btn ghost" id="rwSnap">${esc(t("rwSnap"))}</button>
          <button type="button" class="btn ghost" id="rwExpJson">${esc(t("rwExpJson"))}</button>
          <button type="button" class="btn ghost" id="rwExpCsv">${esc(t("rwExpCsv"))}</button>
        </div>
        <div class="card-grid" id="rwRateCards" style="margin-top:8px"></div>
        <div class="toolbar-row" style="margin-top:8px">
          <div class="search-wrap">
            <input type="text" id="rwRepLookup" placeholder="${esc(t("rwRepPh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn" id="rwRepBtn">${esc(t("rwRepBtn"))}</button>
          <div class="search-wrap" style="max-width:180px">
            <input type="text" id="rwPcapIp" placeholder="${esc(t("rwPcapPh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn" id="rwPcapBtn">${esc(t("rwPcapBtn"))}</button>
          <span class="meta" id="rwToolMeta" style="min-width:120px"></span>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div id="rwFlowsSkel">${skelRows(6)}</div>
        <div class="empty-state" id="rwFlowsEmpty" hidden>${esc(t("rwFlowsEmpty"))}</div>
        <div class="table-wrap" id="rwFlowsWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>${esc(t("rwColProto"))}</th>
              <th>${esc(t("rwColLocal"))}</th>
              <th>${esc(t("rwColRemote"))}</th>
              <th>${esc(t("rwColPid"))}</th>
              <th>${esc(t("rwColProc"))}</th>
              <th>${esc(t("rwColCountry"))}</th>
              <th>↑</th><th>↓</th>
              <th>${esc(t("rwColActions"))}</th>
            </tr></thead>
            <tbody id="rwFlowsBody"></tbody>
          </table>
        </div>
      </div>`;

    const startBtn = body.querySelector("#rwStart");
    const stopBtn = body.querySelector("#rwStop");
    const monMeta = body.querySelector("#rwMonMeta");
    const rateCards = body.querySelector("#rwRateCards");
    const flowsEmpty = body.querySelector("#rwFlowsEmpty");
    const flowsWrap = body.querySelector("#rwFlowsWrap");
    const flowsBody = body.querySelector("#rwFlowsBody");
    const skel = body.querySelector("#rwFlowsSkel");
    const toolMeta = body.querySelector("#rwToolMeta");

    function hideSkel() {
      if (skel) skel.hidden = true;
    }

    function renderSnapshot(snap) {
      hideSkel();
      const flows = Array.isArray(snap?.flows)
        ? snap.flows
        : Array.isArray(snap?.connections)
          ? snap.connections
          : [];
      if (!flows.length) {
        flowsEmpty.hidden = false;
        flowsWrap.hidden = true;
        flowsEmpty.textContent = t("rwNoFlows");
        return;
      }
      flowsEmpty.hidden = true;
      flowsWrap.hidden = false;
      flowsBody.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (const f of flows) {
        const { ip } = parseRemote(f.raddr || f.remote || "");
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td>${esc(f.proto || "")}</td>` +
          `<td class="meta">${esc(f.laddr || "")}</td>` +
          `<td class="meta">${esc(f.raddr || "")}</td>` +
          `<td>${esc(f.pid || "")}</td>` +
          `<td title="${esc(f.path || "")}">${esc(f.name || "—")}</td>` +
          `<td>${esc(f.country || "")}</td>` +
          `<td>${f.bps_up != null ? f.bps_up : "—"}</td>` +
          `<td>${f.bps_down != null ? f.bps_down : "—"}</td>` +
          `<td style="white-space:nowrap">` +
          `<button type="button" class="action-btn danger" data-action="kill" data-pid="${esc(String(f.pid || 0))}" ${!f.pid ? "disabled" : ""}>${esc(t("rwKill"))}</button>` +
          `<button type="button" class="action-btn" data-action="block" data-raddr="${esc(f.raddr || "")}" ${!f.raddr ? "disabled" : ""}>${esc(t("rwBlock"))}</button>` +
          `<button type="button" class="action-btn" data-action="rep" data-ip="${esc(ip)}" data-raddr="${esc(f.raddr || "")}">${esc(t("rwRepShort"))}</button>` +
          `<button type="button" class="action-btn" data-action="pcap" data-ip="${esc(ip)}" ${!ip ? "disabled" : ""}>${esc(t("rwPcapShort"))}</button>` +
          `<button type="button" class="action-btn" data-action="folder" data-pid="${esc(String(f.pid || 0))}" data-path="${esc(f.path || "")}">${esc(t("rwFolder"))}</button>` +
          `</td>`;
        frag.appendChild(tr);
      }
      flowsBody.appendChild(frag);

      const rm = snap?.rate_meta || {};
      const nic = snap?.nic || {};
      const upBps = rm.total_bps_up != null ? Number(rm.total_bps_up) : Number(nic.bps_up);
      const dnBps = rm.total_bps_down != null ? Number(rm.total_bps_down) : Number(nic.bps_down);
      const fmtRate = (bps) => {
        if (bps == null || Number.isNaN(bps)) return "—";
        if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
        if (bps >= 1024) return `${Math.round(bps / 1024)} KB/s`;
        return `${Math.round(bps)} B/s`;
      };
      rateCards.innerHTML =
        `<div class="card"><span class="label">${esc(t("rwRateUp"))}</span><span class="value">${esc(fmtRate(upBps))}</span></div>` +
        `<div class="card"><span class="label">${esc(t("rwRateDown"))}</span><span class="value">${esc(fmtRate(dnBps))}</span></div>` +
        `<div class="card"><span class="label">${esc(t("rwFlows"))}</span><span class="value">${flows.length}</span></div>`;
    }

    flowsBody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || btn.disabled || !api) return;
      const act = btn.dataset.action;
      if (act === "kill") {
        const pid = parseInt(btn.dataset.pid, 10) || 0;
        if (!pid) return;
        if (!(await askConfirm(t("rwKillConfirm", { pid }), t("rwKillTitle")))) return;
        setStatus(t("commonLoading"));
        try {
          const res = await withGate("kill_process", { pid }, (token) => api.kill_process(pid, token, true));
          if (res?.ok) setStatus(t("rwKillOk", { pid }), "ok");
          else if (res) setStatus(t("commonError", { err: res.error || "?" }), "error");
        } catch (err) {
          setStatus(t("commonError", { err: String(err) }), "error");
        }
      } else if (act === "block") {
        const { ip, port } = parseRemote(btn.dataset.raddr || "");
        if (!ip) return;
        const target = `${ip}${port ? ":" + port : ""}`;
        if (!(await askConfirm(t("rwBlockConfirm", { target }), t("rwBlockTitle")))) return;
        setStatus(t("commonLoading"));
        try {
          const res = await withGate("block_remote", { ip, port }, (token) =>
            api.block_remote(ip, port, token, true, "")
          );
          if (res?.ok) setStatus(t("rwBlockOk", { ip }), "ok");
          else if (res) setStatus(t("commonError", { err: res.error || "?" }), "error");
        } catch (err) {
          setStatus(t("commonError", { err: String(err) }), "error");
        }
      } else if (act === "rep") {
        const target = btn.dataset.ip || btn.dataset.raddr || "";
        if (!target || !api.lookup_reputation) return;
        toolMeta.textContent = "…";
        setStatus(t("rwRepBtn"));
        try {
          const r = await api.lookup_reputation(target);
          toolMeta.textContent = t("rwRepVerdict", { verdict: r?.verdict || "?" });
          setStatus(
            r?.ok !== false ? `${target}: ${r?.verdict || "?"}` : r?.error || t("commonError", { err: "?" }),
            r?.ok === false ? "error" : "ok"
          );
        } catch (err) {
          setStatus(t("commonError", { err: String(err) }), "error");
        }
      } else if (act === "pcap") {
        const ip = btn.dataset.ip || "";
        if (!ip || !api.capture_for_ip) return;
        if (!(await askConfirm(t("rwPcapConfirm", { ip }), t("rwPcapTitle")))) return;
        skel.hidden = false;
        skel.innerHTML = skelRows(3);
        setStatus(t("rwPcapBtn"));
        try {
          const r = await api.capture_for_ip(ip, 8);
          skel.hidden = true;
          if (r?.ok) setStatus(t("rwPcapOk", { path: r.path || "ok" }), "ok");
          else setStatus(t("commonError", { err: r?.error || "?" }), "error");
        } catch (err) {
          skel.hidden = true;
          setStatus(t("commonError", { err: String(err) }), "error");
        }
      } else if (act === "folder") {
        if (!api.open_process_folder) return;
        await api.open_process_folder(parseInt(btn.dataset.pid, 10) || 0, btn.dataset.path || "").catch(() => {});
      }
    });

    async function startMonitor() {
      if (!api?.start_monitor) return;
      const res = await api.start_monitor(1.0);
      if (res?.ok) {
        monMeta.textContent = t("rwMonOn");
        startBtn.disabled = true;
        stopBtn.disabled = false;
        setStatus("");
        pollTimer = setInterval(async () => {
          try {
            renderSnapshot(await api.get_snapshot());
          } catch (_) {}
        }, 1500);
        try {
          renderSnapshot(await api.get_snapshot());
        } catch (_) {}
      }
    }

    startBtn.addEventListener("click", startMonitor);
    stopBtn.addEventListener("click", async () => {
      stopPoll();
      if (api?.stop_monitor) await api.stop_monitor();
      monMeta.textContent = t("rwMonOff");
      startBtn.disabled = false;
      stopBtn.disabled = true;
      setStatus(t("rwMonOff"));
    });

    body.querySelector("#rwSnap").addEventListener("click", async () => {
      if (!api?.get_snapshot) return;
      skel.hidden = false;
      skel.innerHTML = skelRows(5);
      flowsWrap.hidden = true;
      flowsEmpty.hidden = true;
      setStatus(t("rwSnapStatus"));
      try {
        renderSnapshot(await api.get_snapshot());
        setStatus("");
      } catch (err) {
        hideSkel();
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#rwExpJson").addEventListener("click", async () => {
      if (!api?.export_snapshot) return;
      setStatus(t("rwExpJsonStatus"));
      try {
        const r = await api.export_snapshot("json");
        if (r?.cancelled) setStatus(t("nmExportCancel"));
        else if (r?.ok) setStatus(t("rwExportOk", { path: r.path || "ok" }), "ok");
        else setStatus(t("commonError", { err: r?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });
    body.querySelector("#rwExpCsv").addEventListener("click", async () => {
      if (!api?.export_snapshot) return;
      setStatus(t("nmExporting"));
      try {
        const r = await api.export_snapshot("csv");
        if (r?.cancelled) setStatus(t("nmExportCancel"));
        else if (r?.ok) setStatus(t("rwExportOk", { path: r.path || "ok" }), "ok");
        else setStatus(t("commonError", { err: r?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#rwRepBtn").addEventListener("click", async () => {
      const target = (body.querySelector("#rwRepLookup").value || "").trim();
      if (!target || !api?.lookup_reputation) return;
      setStatus(t("rwRepBtn"));
      try {
        const r = await api.lookup_reputation(target);
        toolMeta.textContent = t("rwRepVerdict", { verdict: r?.verdict || "?" });
        setStatus(
          r?.ok !== false ? `${target}: ${r?.verdict || "?"}` : r?.error || t("commonError", { err: "?" }),
          r?.ok === false ? "error" : "ok"
        );
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#rwPcapBtn").addEventListener("click", async () => {
      const ip = (body.querySelector("#rwPcapIp").value || "").trim();
      if (!ip || !api?.capture_for_ip) return;
      if (!(await askConfirm(t("rwPcapConfirm", { ip }), t("rwPcapTitle")))) return;
      setStatus(t("rwPcapBtn"));
      try {
        const r = await api.capture_for_ip(ip, 8);
        if (r?.ok) setStatus(t("rwPcapOk", { path: r.path || "ok" }), "ok");
        else setStatus(t("commonError", { err: r?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    if (api?.get_monitor_status) {
      try {
        const st = await api.get_monitor_status();
        if (st?.monitoring) {
          monMeta.textContent = t("rwMonOn");
          startBtn.disabled = true;
          stopBtn.disabled = false;
          pollTimer = setInterval(async () => {
            try {
              renderSnapshot(await api.get_snapshot());
            } catch (_) {}
          }, 1500);
          try {
            renderSnapshot(await api.get_snapshot());
          } catch (_) {
            hideSkel();
          }
        } else {
          hideSkel();
          flowsEmpty.hidden = false;
        }
      } catch (_) {
        hideSkel();
        flowsEmpty.hidden = false;
      }
    } else {
      hideSkel();
      flowsEmpty.hidden = false;
    }
  }

  // ─── À TRANCHER ──────────────────────────────────────────────────────────────

  async function buildQuiz() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwLearnStart">${esc(t("rwLearnStart"))}</button>
          <button type="button" class="btn ghost" id="rwLearnStop">${esc(t("rwLearnStop"))}</button>
          <button type="button" class="btn" id="rwQuizRefresh">${esc(t("commonRefresh"))}</button>
          <span class="meta" id="rwQuizBanner" style="min-width:160px"></span>
        </div>
        <p class="meta" style="margin:8px 0 0">${esc(t("rwQuizHint"))}</p>
      </div>
      <div class="panel flex-fill" style="padding:12px;overflow:auto" id="rwQuizFeed">
        ${skelRows(4)}
      </div>`;

    const feed = body.querySelector("#rwQuizFeed");
    const banner = body.querySelector("#rwQuizBanner");
    const learnBtn = body.querySelector("#rwLearnStart");

    async function loadQuiz() {
      if (!api?.list_questions) {
        feed.innerHTML = `<div class="empty-state">${esc(t("commonApiUnavailable"))}</div>`;
        return;
      }
      feed.innerHTML = skelRows(4);
      setStatus(t("commonLoading"));
      try {
        const [questRes, stRes] = await Promise.all([
          api.list_questions(),
          api.trust_status().catch(() => ({})),
        ]);
        const questions = Array.isArray(questRes?.questions) ? questRes.questions : [];
        const learning = !!(questRes?.learning ?? stRes?.learning);
        const remaining = Math.max(0, Math.floor(Number(questRes?.remaining_s ?? stRes?.remaining_s) || 0));
        if (learnBtn) learnBtn.disabled = learning;
        if (learning) {
          const m = Math.floor(remaining / 60);
          const s = remaining % 60;
          banner.textContent = t("rwQuizLearning", { m, s, n: questions.length });
        } else {
          banner.textContent = t("rwQuizCount", { n: questions.length });
        }
        if (!questions.length) {
          feed.innerHTML = `<div class="empty-state">${esc(t("rwQuizEmpty"))}</div>`;
          setStatus("");
          return;
        }
        feed.innerHTML = questions
          .map((q) => {
            const rep = q.reputation;
            const repLine = rep ? esc(t("rwRepVerdict", { verdict: rep.verdict || "unknown" })) : "";
            return `<div class="panel" style="margin-bottom:8px;padding:12px">
            <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
              <span class="meta" style="min-width:72px;font-weight:600">${esc(q.kind || "")}</span>
              <div style="flex:1;min-width:180px">
                <div style="font-weight:600">${esc(q.name || q.hostname || q.remote || "?")}</div>
                <div class="meta wrap">${esc(q.detail || "")}</div>
                <div class="meta wrap">${esc(q.path || "")}</div>
                ${repLine ? `<div class="meta">${repLine}</div>` : ""}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button type="button" class="btn accent action-btn" data-qid="${esc(q.id)}" data-qa="trust">${esc(t("rwTrust"))}</button>
                <button type="button" class="btn action-btn" data-qid="${esc(q.id)}" data-qa="ignore">${esc(t("rwIgnore"))}</button>
                <button type="button" class="btn danger action-btn" data-qid="${esc(q.id)}" data-qa="propose_block">${esc(t("rwBlock"))}…</button>
              </div>
            </div>
          </div>`;
          })
          .join("");
        setStatus("");
      } catch (err) {
        feed.innerHTML = `<div class="empty-state">${esc(String(err))}</div>`;
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    feed.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-qid]");
      if (!btn || !api?.answer_question) return;
      const qid = btn.dataset.qid;
      const qa = btn.dataset.qa;
      try {
        const res = await api.answer_question(qid, qa);
        if (res?.needs_confirm_block && res.block_hint) {
          const hint = res.block_hint;
          const { ip, port } = parseRemote(hint.remote || "");
          if (!(await askConfirm(t("rwQuizBlockConfirm", { target: hint.remote || ip }), t("rwBlockTitle")))) {
            await loadQuiz();
            return;
          }
          const r = await withGate(
            "block_remote",
            { ip: ip || hint.remote || "", port },
            (token) => api.block_remote(ip || hint.remote || "", port, token, true, "")
          );
          if (r?.ok) setStatus(t("rwQuizBlocked"), "ok");
          else if (r) setStatus(t("commonError", { err: r.error || "?" }), "error");
        }
        await loadQuiz();
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#rwLearnStart").addEventListener("click", async () => {
      if (!api?.start_learn) return;
      setStatus(t("rwLearnStarting"));
      try {
        const res = await api.start_learn(10.0);
        if (res?.ok) {
          setStatus(
            (res.seeded || 0) === 0 && (res.queue_count || 0) === 0
              ? t("rwLearnStartedWait")
              : t("rwLearnStarted"),
            "ok"
          );
          await loadQuiz();
        } else setStatus(t("commonError", { err: res?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#rwLearnStop").addEventListener("click", async () => {
      if (!api?.stop_learn) return;
      await api.stop_learn().catch(() => {});
      setStatus(t("rwLearnStopped"), "ok");
      await loadQuiz();
    });

    body.querySelector("#rwQuizRefresh").addEventListener("click", loadQuiz);
    await loadQuiz();
  }

  // ─── ALERTES ─────────────────────────────────────────────────────────────────

  async function buildAlerts() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwAlertRefresh">${esc(t("commonRefresh"))}</button>
          <button type="button" class="btn ghost" id="rwAlertExport">${esc(t("rwAlertExport"))}</button>
          <label class="meta" style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="rwToasts" checked /> ${esc(t("rwToasts"))}
          </label>
          <button type="button" class="btn danger" id="rwAlertClear">${esc(t("rwAlertClear"))}</button>
          <p class="meta" id="rwAlertMeta" style="margin:0"></p>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div id="rwAlertSkel">${skelRows(5)}</div>
        <div class="empty-state" id="rwAlertEmpty" hidden>${esc(t("commonLoading"))}</div>
        <div class="table-wrap" id="rwAlertWrap" hidden>
          <table class="data">
            <thead><tr>
              <th>${esc(t("rwColTime"))}</th><th>${esc(t("rwColSeverity"))}</th><th>${esc(t("rwColRule"))}</th><th>${esc(t("rwColDetail"))}</th><th>PID / ${esc(t("rwColProc"))}</th><th></th>
            </tr></thead>
            <tbody id="rwAlertBody"></tbody>
          </table>
        </div>
      </div>`;

    const skel = body.querySelector("#rwAlertSkel");
    const toastEl = body.querySelector("#rwToasts");

    if (api?.get_alert_settings) {
      try {
        const s = await api.get_alert_settings();
        if (typeof s?.toasts_enabled === "boolean") toastEl.checked = s.toasts_enabled;
      } catch (_) {}
    }

    toastEl.addEventListener("change", async () => {
      if (api?.set_toasts) await api.set_toasts(!!toastEl.checked).catch(() => {});
      setStatus(toastEl.checked ? t("rwToastsOn") : t("rwToastsOff"));
    });

    body.querySelector("#rwAlertRefresh").addEventListener("click", loadAlerts);
    body.querySelector("#rwAlertExport").addEventListener("click", async () => {
      if (!api?.export_alerts) return;
      setStatus(t("rwAlertExporting"));
      try {
        const r = await api.export_alerts("json");
        if (r?.cancelled) setStatus(t("nmExportCancel"));
        else if (r?.ok) setStatus(t("rwAlertExportOk", { path: r.path || "ok" }), "ok");
        else setStatus(t("commonError", { err: r?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });
    body.querySelector("#rwAlertClear").addEventListener("click", async () => {
      if (!(await askConfirm(t("rwAlertClearConfirm"), t("rwAlertClearTitle")))) return;
      if (api?.clear_alerts) await api.clear_alerts();
      await loadAlerts();
      setStatus(t("rwAlertCleared"), "ok");
    });

    async function loadAlerts() {
      const emptyEl = body.querySelector("#rwAlertEmpty");
      const wrapEl = body.querySelector("#rwAlertWrap");
      const bodyEl = body.querySelector("#rwAlertBody");
      const metaEl = body.querySelector("#rwAlertMeta");
      if (!api?.list_alerts) {
        emptyEl.hidden = false;
        emptyEl.textContent = t("rwApiUnavailable");
        return;
      }
      skel.hidden = false;
      skel.innerHTML = skelRows(5);
      emptyEl.hidden = true;
      wrapEl.hidden = true;
      setStatus(t("commonLoading"));
      try {
        const res = await api.list_alerts(100);
        skel.hidden = true;
        const alerts = Array.isArray(res?.alerts) ? res.alerts : [];
        if (!alerts.length) {
          emptyEl.hidden = false;
          emptyEl.textContent = t("rwAlertsEmpty");
          setStatus("");
          return;
        }
        emptyEl.hidden = true;
        wrapEl.hidden = false;
        metaEl.textContent = t("rwAlertsCount", { n: alerts.length });
        bodyEl.innerHTML = "";
        const frag = document.createDocumentFragment();
        for (const a of alerts) {
          const tr = document.createElement("tr");
          const ts = a.ts ? new Date(a.ts * 1000).toLocaleTimeString(locale()) : "—";
          const sev = (a.severity || "").toLowerCase();
          const col = sev === "high" ? "#ff8a95" : sev === "medium" ? "var(--warn,#f0a33a)" : "var(--muted)";
          tr.innerHTML =
            `<td class="meta">${esc(ts)}</td>` +
            `<td style="color:${col};font-weight:600">${esc(a.severity || "")}</td>` +
            `<td>${esc(a.rule || "")}</td>` +
            `<td class="wrap">${esc(a.detail || "")}</td>` +
            `<td title="${esc(a.path || "")}">${esc(a.pid ? String(a.pid) : "")} ${esc(a.name || "")}</td>` +
            `<td style="white-space:nowrap">` +
            `<button type="button" class="action-btn" data-act="folder" data-pid="${esc(String(a.pid || 0))}" data-path="${esc(a.path || "")}">${esc(t("rwFolder"))}</button>` +
            `<button type="button" class="action-btn danger" data-act="kill" data-pid="${esc(String(a.pid || 0))}">${esc(t("rwKill"))}</button>` +
            `<button type="button" class="action-btn" data-act="block" data-remote="${esc(a.remote || "")}">${esc(t("rwBlock"))}</button>` +
            `</td>`;
          frag.appendChild(tr);
        }
        bodyEl.appendChild(frag);
        setStatus("");
      } catch (err) {
        skel.hidden = true;
        emptyEl.hidden = false;
        emptyEl.textContent = String(err);
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    body.querySelector("#rwAlertBody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn || !api) return;
      const act = btn.dataset.act;
      if (act === "folder") {
        await api.open_process_folder?.(parseInt(btn.dataset.pid, 10) || 0, btn.dataset.path || "").catch(() => {});
      } else if (act === "kill") {
        const pid = parseInt(btn.dataset.pid, 10) || 0;
        if (!pid) return;
        if (!(await askConfirm(t("rwKillConfirm", { pid }), t("rwKillTitle")))) return;
        const res = await withGate("kill_process", { pid }, (token) => api.kill_process(pid, token, true));
        if (res?.ok) {
          setStatus("", "ok");
          await loadAlerts();
        } else if (res) setStatus(t("commonError", { err: res.error || "?" }), "error");
      } else if (act === "block") {
        const { ip, port } = parseRemote(btn.dataset.remote || "");
        if (!ip) return;
        const target = `${ip}${port ? ":" + port : ""}`;
        if (!(await askConfirm(t("rwBlockConfirm", { target }), t("rwBlockTitle")))) return;
        const res = await withGate("block_remote", { ip, port }, (token) =>
          api.block_remote(ip, port, token, true, "")
        );
        if (res?.ok) setStatus(`${ip}`, "ok");
        else if (res) setStatus(t("commonError", { err: res.error || "?" }), "error");
      }
    });

    await loadAlerts();
  }

  // ─── RÈGLES ──────────────────────────────────────────────────────────────────

  async function buildRules() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwSaveRules">${esc(t("rwSaveRules"))}</button>
          <button type="button" class="btn ghost" id="rwOpenData">${esc(t("rwOpenData"))}</button>
          <button type="button" class="btn" id="rwRulesRefresh">${esc(t("commonRefresh"))}</button>
          <span class="meta" id="rwRulesMeta"></span>
        </div>
      </div>
      <div class="panel flex-fill" style="overflow:auto;padding:12px" id="rwRulesScroll">
        ${skelRows(6)}
      </div>`;

    const scroll = body.querySelector("#rwRulesScroll");

    async function loadRules() {
      if (!api?.get_rules) {
        scroll.innerHTML = `<div class="empty-state">${esc(t("commonApiUnavailable"))}</div>`;
        return;
      }
      scroll.innerHTML = skelRows(6);
      setStatus(t("rwRulesLoading"));
      try {
        const [rulesRes, blRes, trustRes, repRes, geoRes, capRes, stRes, alertSet] = await Promise.all([
          api.get_rules(),
          api.get_blocklist?.().catch(() => ({ items: [] })),
          api.list_trust?.().catch(() => ({ entries: [] })),
          api.get_reputation_settings?.().catch(() => ({})),
          api.geo_status?.().catch(() => ({})),
          api.capture_status?.().catch(() => ({})),
          api.get_startup?.().catch(() => ({})),
          api.get_alert_settings?.().catch(() => ({})),
        ]);
        rulesCache = rulesRes?.rules || {};
        const muted = new Set(alertSet?.muted_rules || []);
        const spike = rulesCache.bandwidth_spike || {};
        const fan = rulesCache.dest_fanout || {};
        const rare = rulesCache.rare_port || {};
        const ports = Array.isArray(rare.common_ports) ? rare.common_ports.join(",") : "80,443,53";
        const trustEntries = Array.isArray(trustRes?.entries)
          ? trustRes.entries
          : Array.isArray(trustRes?.items)
            ? trustRes.items
            : [];

        const ruleRows = Object.keys(rulesCache)
          .map((id) => {
            const r = rulesCache[id] || {};
            return `<div class="toolbar-row" style="margin-bottom:6px;padding:6px 0;border-bottom:1px solid var(--border)" data-rule="${esc(id)}">
            <label style="display:flex;align-items:center;gap:6px;min-width:220px">
              <input type="checkbox" class="rule-en" ${r.enabled !== false ? "checked" : ""} />
              <span>${esc((getLang() === "en" ? (r.label_en || r.label_fr) : (r.label_fr || r.label_en)) || id)} <span class="meta">(${esc(id)})</span></span>
            </label>
            <label class="meta" style="display:flex;align-items:center;gap:4px">
              <input type="checkbox" class="rule-mute" ${muted.has(id) ? "checked" : ""} /> ${esc(t("rwMute"))}
            </label>
            <span class="meta">${esc(r.severity || "")}</span>
          </div>`;
          })
          .join("");

        scroll.innerHTML = `
          <div class="panel" style="margin-bottom:10px">
            <h3 style="font-size:.85rem;margin-bottom:8px">${esc(t("rwRulesHeuristic"))}</h3>
            <div id="rwRulesList">${ruleRows || `<p class="meta">${esc(t("rwRulesNone"))}</p>`}</div>
          </div>
          <div class="card-grid" style="margin-bottom:10px">
            <div class="card" style="align-items:stretch">
              <span class="label">${esc(t("rwThresholds"))}</span>
              <label class="meta">${esc(t("rwThrBps"))}<br/><input type="number" id="thrBps" value="${esc(String(spike.threshold_bps || 8000000))}" /></label>
              <label class="meta">${esc(t("rwThrFactor"))}<br/><input type="number" id="thrFactor" step="0.1" value="${esc(String(spike.baseline_factor || 4))}" /></label>
              <label class="meta">${esc(t("rwThrFanout"))}<br/><input type="number" id="thrFanout" value="${esc(String(fan.threshold || 25))}" /></label>
              <label class="meta">${esc(t("rwThrPorts"))}<br/><input type="text" id="thrPorts" value="${esc(ports)}" /></label>
            </div>
            <div class="card" style="align-items:stretch">
              <span class="label">${esc(t("rwBlocklist"))}</span>
              <textarea id="blocklistText" rows="7" spellcheck="false" style="width:100%;font:inherit;background:var(--bg1);color:inherit;border:1px solid var(--border);border-radius:8px;padding:8px">${esc((blRes?.items || []).join("\n"))}</textarea>
              <button type="button" class="btn accent" id="rwSaveBl" style="margin-top:8px">${esc(t("rwSaveBlocklist"))}</button>
            </div>
            <div class="card" style="align-items:stretch">
              <span class="label">${esc(t("rwRepOptIn"))}</span>
              <label class="meta" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="chkRep" ${repRes?.enabled ? "checked" : ""} /> ${esc(t("rwRepLookups"))}</label>
              <label class="meta">${esc(t("rwAbuseKey"))}<br/><input type="password" id="abuseKey" autocomplete="off" /></label>
              <button type="button" class="btn" id="rwSaveRep" style="margin-top:8px">${esc(t("rwSaveRep"))}</button>
              <p class="meta" id="geoHint">${esc(geoRes?.available ? t("rwGeoOk") : geoRes?.hint || t("rwGeoMissing"))}</p>
              <p class="meta" id="capHint">${esc(capRes?.npcap ? t("rwNpcapOk") + (capRes.scapy ? t("rwNpcapScapy") : t("rwNpcapScapyHint")) : t("rwNpcapMissing"))}</p>
            </div>
            <div class="card" style="align-items:stretch">
              <span class="label">${esc(t("rwStartup"))}</span>
              <label class="meta" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="chkStartup" ${stRes?.enabled ? "checked" : ""} /> ${esc(t("rwStartupTray"))}</label>
              <button type="button" class="btn" id="rwSaveStartup" style="margin-top:8px">${esc(t("rwApplyStartup"))}</button>
            </div>
          </div>
          <div class="panel">
            <h3 style="font-size:.85rem;margin-bottom:8px">${esc(t("rwTrustTitle"))}</h3>
            <div id="rwTrustList">${trustEntries.length ? trustEntries.map((e) =>
              `<div class="toolbar-row" style="margin-bottom:4px">
                <span style="flex:1">${esc(e.name || "")} <span class="meta">${esc(e.path || "")}</span></span>
                <button type="button" class="action-btn danger" data-rm-path="${esc(e.path || "")}" data-rm-name="${esc(e.name || "")}">${esc(t("rwTrustRemove"))}</button>
              </div>`).join("") : `<p class="meta">${esc(t("rwTrustEmpty"))}</p>`}</div>
          </div>`;

        body.querySelector("#rwSaveBl")?.addEventListener("click", async () => {
          const lines = (body.querySelector("#blocklistText").value || "")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (!(await askConfirm(t("rwBlocklistConfirm", { n: lines.length }), t("rwBlocklist")))) return;
          setStatus(t("rwBlocklistSaving"));
          try {
            const r = await api.set_blocklist(lines);
            if (r?.ok) setStatus(t("rwBlocklistOk", { n: r.count ?? lines.length }), "ok");
            else setStatus(t("commonError", { err: r?.error || "?" }), "error");
          } catch (err) {
            setStatus(t("commonError", { err: String(err) }), "error");
          }
        });

        body.querySelector("#rwSaveRep")?.addEventListener("click", async () => {
          setStatus(t("rwRepSaving"));
          try {
            await api.set_reputation_enabled?.(!!body.querySelector("#chkRep").checked);
            const key = body.querySelector("#abuseKey").value;
            if (key) await api.set_abuseipdb_key?.(key);
            setStatus(t("rwRepSaved"), "ok");
          } catch (err) {
            setStatus(t("commonError", { err: String(err) }), "error");
          }
        });

        body.querySelector("#rwSaveStartup")?.addEventListener("click", async () => {
          const enabled = !!body.querySelector("#chkStartup").checked;
          if (!(await askConfirm(
            enabled ? t("rwStartupConfirmOn") : t("rwStartupConfirmOff"),
            t("rwStartupTitle")
          ))) return;
          setStatus(t("rwStartupWorking"));
          try {
            const res = await withGate("set_startup", { enabled }, (token) => api.set_startup(enabled, token));
            if (res?.ok) setStatus(enabled ? t("rwStartupOn") : t("rwStartupOff"), "ok");
            else if (res) setStatus(t("commonError", { err: res.error || "?" }), "error");
          } catch (err) {
            setStatus(t("commonError", { err: String(err) }), "error");
          }
        });

        body.querySelector("#rwTrustList")?.addEventListener("click", async (e) => {
          const btn = e.target.closest("[data-rm-path]");
          if (!btn || !api?.remove_trust) return;
          await api.remove_trust(btn.dataset.rmPath || "", btn.dataset.rmName || "").catch(() => {});
          await loadRules();
        });

        body.querySelector("#rwRulesMeta").textContent = t("rwRulesCount", { n: Object.keys(rulesCache).length });
        setStatus("");
      } catch (err) {
        scroll.innerHTML = `<div class="empty-state">${esc(String(err))}</div>`;
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    }

    body.querySelector("#rwSaveRules").addEventListener("click", async () => {
      if (!api?.save_rules) return;
      const patch = {};
      body.querySelectorAll("[data-rule]").forEach((row) => {
        const id = row.getAttribute("data-rule");
        patch[id] = { enabled: row.querySelector(".rule-en")?.checked !== false };
        const mute = row.querySelector(".rule-mute")?.checked;
        if (api.mute_rule) api.mute_rule(id, !!mute);
      });
      patch.bandwidth_spike = {
        ...(rulesCache.bandwidth_spike || {}),
        ...(patch.bandwidth_spike || {}),
        threshold_bps: Number(body.querySelector("#thrBps")?.value) || 8000000,
        baseline_factor: Number(body.querySelector("#thrFactor")?.value) || 4,
      };
      patch.dest_fanout = {
        ...(rulesCache.dest_fanout || {}),
        ...(patch.dest_fanout || {}),
        threshold: Number(body.querySelector("#thrFanout")?.value) || 25,
      };
      const ports = (body.querySelector("#thrPorts")?.value || "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => n > 0);
      if (ports.length) {
        patch.rare_port = { ...(rulesCache.rare_port || {}), ...(patch.rare_port || {}), common_ports: ports };
      }
      setStatus(t("rwRulesSaving"));
      try {
        const r = await api.save_rules(patch);
        if (r?.ok !== false) {
          setStatus(t("rwRulesSaved"), "ok");
          await loadRules();
        } else setStatus(t("commonError", { err: r?.error || "?" }), "error");
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    body.querySelector("#rwOpenData").addEventListener("click", () => api?.open_data_dir?.());
    body.querySelector("#rwRulesRefresh").addEventListener("click", loadRules);
    await loadRules();
  }

  // ─── DNS ─────────────────────────────────────────────────────────────────────

  async function buildDns() {
    body.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="rwDnsLoad">${esc(t("rwDnsLoad"))}</button>
          <button type="button" class="btn" id="rwDnsRefresh">${esc(t("rwDnsRefreshCache"))}</button>
          <p class="meta" id="rwDnsMeta" style="margin:0"></p>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0">
        <div id="rwDnsSkel">${skelRows(5)}</div>
        <div class="empty-state" id="rwDnsEmpty" hidden>${esc(t("rwDnsEmptyHint"))}</div>
        <div class="table-wrap" id="rwDnsWrap" hidden>
          <table class="data">
            <thead><tr><th>${esc(t("rwDnsColQuery"))}</th><th>${esc(t("rwDnsColResult"))}</th><th>${esc(t("rwDnsColType"))}</th></tr></thead>
            <tbody id="rwDnsBody"></tbody>
          </table>
        </div>
      </div>`;

    const skel = body.querySelector("#rwDnsSkel");
    body.querySelector("#rwDnsLoad").addEventListener("click", loadDns);
    body.querySelector("#rwDnsRefresh").addEventListener("click", async () => {
      if (!api?.refresh_dns) return;
      setStatus(t("rwDnsRefreshing"));
      try {
        await api.refresh_dns();
        await loadDns();
      } catch (err) {
        setStatus(t("commonError", { err: String(err) }), "error");
      }
    });

    async function loadDns() {
      const emptyEl = body.querySelector("#rwDnsEmpty");
      const wrapEl = body.querySelector("#rwDnsWrap");
      const bodyEl = body.querySelector("#rwDnsBody");
      const metaEl = body.querySelector("#rwDnsMeta");
      if (!api?.list_dns) {
        emptyEl.hidden = false;
        emptyEl.textContent = t("rwApiUnavailable");
        return;
      }
      skel.hidden = false;
      emptyEl.hidden = true;
      wrapEl.hidden = true;
      setStatus(t("rwDnsLoading"));
      try {
        const res = await api.list_dns(60);
        skel.hidden = true;
        const items = Array.isArray(res?.items) ? res.items : [];
        if (!items.length) {
          emptyEl.hidden = false;
          emptyEl.textContent = t("rwDnsEmpty");
          setStatus("");
          return;
        }
        emptyEl.hidden = true;
        wrapEl.hidden = false;
        metaEl.textContent = t("rwDnsCount", { n: items.length });
        bodyEl.innerHTML = items
          .map(
            (d) =>
              `<tr>
            <td class="meta">${esc(d.query || d.name || "")}</td>
            <td class="meta">${esc(Array.isArray(d.answers) ? d.answers.join(", ") : d.result || "")}</td>
            <td>${esc(d.type || "")}</td>
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

    skel.hidden = true;
    body.querySelector("#rwDnsEmpty").hidden = false;
  }

  // ─── SEGMENT ROUTER ──────────────────────────────────────────────────────────

  async function onSegment(seg) {
    stopPoll();
    setStatus("");
    if (seg === "traffic") await buildTraffic();
    else if (seg === "quiz") await buildQuiz();
    else if (seg === "alerts") await buildAlerts();
    else if (seg === "rules") await buildRules();
    else if (seg === "dns") await buildDns();
  }

  await setSegment("traffic");
}
