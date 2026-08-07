"""RoadWay-X — host WebView2 (trafic + quiz + actions manuelles)."""
from __future__ import annotations

import csv
import io
import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any


_HOST_DIR = Path(__file__).resolve().parent
if str(_HOST_DIR) not in sys.path:
    sys.path.insert(0, str(_HOST_DIR))

from tools.roadway import actions as mod_actions  # noqa: E402
from tools.roadway import capture as mod_capture  # noqa: E402
from tools.roadway import dns_watch as mod_dns  # noqa: E402
from tools.roadway import geoip as mod_geo  # noqa: E402
from tools.roadway import net_rates as mod_rates  # noqa: E402
from tools.roadway import tray_util  # noqa: E402
from tools.roadway.alerts import AlertStore  # noqa: E402
from tools.roadway.collector import TrafficCollector  # noqa: E402
from tools.roadway.heuristics import HeuristicsEngine  # noqa: E402
from tools.roadway.reputation import ReputationService  # noqa: E402
from tools.roadway.trust import TrustStore  # noqa: E402
from security import ConfirmGate  # noqa: E402

DEFAULT_ACCENT = "#e03545"
ENV_ACCENT = "MRAUREVOX_ACCENT"
ENV_LANG = "MRAUREVOX_LANG"


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def ui_dir() -> Path:
    external = app_dir() / "ui"
    if (external / "index.html").is_file():
        return external
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", app_dir()))
        nested = base / "ui"
        return nested if nested.is_dir() else base
    return app_dir() / "ui"


def resolve_suite_accent(default: str = DEFAULT_ACCENT) -> str:
    env = (os.environ.get(ENV_ACCENT) or "").strip()
    if env.startswith("#") and len(env) in (4, 7):
        return env
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "user-settings.json"
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            accent = str((loaded or {}).get("accent") or "").strip()
            if accent.startswith("#") and len(accent) in (4, 7):
                return accent
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return default


def resolve_suite_language(default: str = "fr") -> str:
    env = (os.environ.get(ENV_LANG) or "").strip().lower()
    if env in ("fr", "en"):
        return env
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "user-settings.json"
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            lang = str((loaded or {}).get("language") or "").strip().lower()
            if lang in ("fr", "en"):
                return lang
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return default if default in ("fr", "en") else "fr"


def resolve_suite_theme(default: str = "dark") -> str:
    env = (os.environ.get("MRAUREVOX_THEME") or "").strip().lower()
    if env in ("dark", "light"):
        return env
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "user-settings.json"
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            theme = str((loaded or {}).get("theme") or "").strip().lower()
            if theme in ("dark", "light"):
                return theme
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return default if default in ("dark", "light") else "dark"


DEFAULT_ATELIER_THEME = {
    "preset": "pc-command",
    "bg": "#06070c",
    "panel": "#0e1118",
    "panel2": "#12161f",
    "text": "#eef2f8",
    "muted": "#8490a6",
    "accent": "#e03545",
    "cyan": "#3ec7ff",
    "ok": "#3dd68c",
    "warn": "#f0a33a",
    "glowAccent": "0 0 18px rgba(224, 53, 69, .28)",
    "glowCyan": "0 0 16px rgba(62, 199, 255, .22)",
}


def atelier_theme_path() -> Path:
    appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return Path(appdata) / "Mr-Aurevo-X" / "atelier-theme.json"


def _win_hwnd(window: Any) -> int:
    if sys.platform != "win32":
        return 0
    try:
        import ctypes

        user32 = ctypes.windll.user32
        hwnd = 0
        native = getattr(window, "native", None) if window is not None else None
        if native is not None:
            handle = getattr(native, "Handle", None)
            if handle is not None:
                try:
                    hwnd = int(handle.ToInt32())
                except Exception:  # noqa: BLE001
                    try:
                        hwnd = int(handle)
                    except Exception:  # noqa: BLE001
                        hwnd = 0
        if not hwnd:
            hwnd = int(user32.GetForegroundWindow())
        return hwnd
    except Exception:  # noqa: BLE001
        return 0


class RoadwayApi:
    def __init__(self) -> None:
        self._window: Any = None
        self._maximized = False
        self._confirm = ConfirmGate(ttl_seconds=90.0)
        self._collector = TrafficCollector()
        self._heuristics = HeuristicsEngine()
        self._alerts = AlertStore()
        self._trust = TrustStore()
        self._reputation = ReputationService()
        self._tray: tray_util.TrayController | None = None
        self._monitor = False
        self._interval = 1.0
        self._lock = threading.Lock()
        self._last_snapshot: dict[str, Any] | None = None
        self._thread: threading.Thread | None = None
        self._dns_tick = 0
        mod_rates.try_init_etw()

    MUTATORS = ("kill_process", "block_remote", "set_startup")

    def prepare_action(self, action: str, payload: dict | None = None) -> dict:
        act = str(action or "").strip()
        if act not in self.MUTATORS:
            return {"ok": False, "error": f"action inconnue: {act}", "token": None}
        try:
            token = self._confirm.prepare(act, payload if payload is not None else {})
            return {"ok": True, "token": token}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def _consume(self, action: str, payload: dict | None, token: str | None) -> dict | None:
        pl = payload if payload is not None else {}
        if not self._confirm.consume(str(token or ""), action, pl):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return None


    def get_theme(self) -> dict:
        path = atelier_theme_path()
        data = dict(DEFAULT_ATELIER_THEME)
        if path.is_file():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8-sig"))
                if isinstance(loaded, dict):
                    data.update({k: v for k, v in loaded.items() if v is not None})
            except (OSError, json.JSONDecodeError):
                pass
        return {"ok": True, "error": None, "data": data, "path": str(path)}

    def get_suite_accent(self) -> dict:
        return {"ok": True, "accent": resolve_suite_accent()}

    def get_suite_language(self) -> dict:
        return {"ok": True, "language": resolve_suite_language()}

    def get_suite_settings(self) -> dict:
        return {
            "ok": True,
            "accent": resolve_suite_accent(),
            "language": resolve_suite_language(),
            "theme": resolve_suite_theme(),
        }

    def open_dedicated(self) -> dict:
        from suite_launch import launch_suite_app
        return launch_suite_app("RoadWay-X")


    def start_monitor(self, interval: float = 1.0) -> dict:
        try:
            self._interval = max(0.5, min(float(interval or 1.0), 10.0))
        except (TypeError, ValueError):
            self._interval = 1.0
        with self._lock:
            self._monitor = True
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._loop, daemon=True)
                self._thread.start()
        return {"ok": True, "monitoring": True, "interval": self._interval}

    def stop_monitor(self) -> dict:
        with self._lock:
            self._monitor = False
        return {"ok": True, "monitoring": False}

    def get_monitor_status(self) -> dict:
        with self._lock:
            return {
                "ok": True,
                "monitoring": self._monitor,
                "interval": self._interval,
                "has_snapshot": self._last_snapshot is not None,
            }

    def _loop(self) -> None:
        while True:
            with self._lock:
                if not self._monitor:
                    break
                interval = self._interval
            try:
                self._tick()
            except Exception:
                pass
            time.sleep(interval)

    def _tick(self) -> dict[str, Any]:
        snap = self._collector.poll()
        payload = self._collector.to_dict(snap)
        # DNS cache refresh every ~15 ticks
        self._dns_tick += 1
        if self._dns_tick % 15 == 1:
            try:
                mod_dns.refresh_cache()
            except Exception:
                pass
        # Blocklist vs DNS
        try:
            bl = self._heuristics.get_blocklist().get("items") or []
            dns_hits = mod_dns.match_blocklist(bl)
            payload["dns_block_hits"] = dns_hits[:20]
        except Exception:
            payload["dns_block_hits"] = []

        new_alerts = self._heuristics.evaluate(
            payload,
            self._collector,
            trust_check=self._trust.is_trusted,
        )
        # DNS blocklist hits as alerts
        for hit in payload.get("dns_block_hits") or []:
            new_alerts.append(
                {
                    "id": f"dnsbl-{hit.get('query')}-{int(time.time())}",
                    "rule": "blocklist_hit",
                    "severity": "high",
                    "label_fr": "Blocklist DNS",
                    "label_en": "DNS blocklist",
                    "detail": f"DNS « {hit.get('match')} » → {hit.get('query')}",
                    "pid": 0,
                    "name": "",
                    "path": "",
                    "remote": hit.get("result") or "",
                    "ts": time.time(),
                }
            )
        accepted = self._alerts.ingest(new_alerts)
        # Quiz / learn — never blocks
        queued = self._trust.observe_snapshot(payload)
        payload["new_alerts"] = accepted
        payload["new_questions"] = queued
        payload["questions"] = self._trust.list_questions().get("questions") or []
        payload["trust_status"] = self._trust.status()
        payload["rate_meta"] = mod_rates.meta()
        payload["dns_recent"] = mod_dns.list_recent(40).get("items") or []
        # Async reputation enrich for new host questions when enabled
        if self._reputation.get_settings().get("enabled") and queued:
            for q in queued:
                if q.get("kind") == "new_host":
                    threading.Thread(
                        target=self._enrich_question,
                        args=(q.get("id"), q.get("hostname") or q.get("remote")),
                        daemon=True,
                    ).start()
        with self._lock:
            self._last_snapshot = payload
        if accepted and self._tray:
            high = [a for a in accepted if a.get("severity") == "high"]
            if high:
                self._tray.notify("RoadWay-X", high[0].get("detail") or "Alerte")
        return payload

    def _enrich_question(self, qid: str, target: str) -> None:
        try:
            rep = self._reputation.lookup(target or "")
            self._trust.set_question_reputation(qid, rep)
        except Exception:
            pass

    def poll_once(self) -> dict:
        try:
            return self._tick()
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_snapshot(self) -> dict:
        with self._lock:
            if self._last_snapshot is not None:
                return dict(self._last_snapshot)
        return self.poll_once()

    def list_alerts(self, limit: int = 100) -> dict:
        return self._alerts.list_alerts(limit)

    def clear_alerts(self) -> dict:
        return self._alerts.clear()

    def mute_rule(self, rule: str = "", muted: bool = True) -> dict:
        return self._alerts.mute_rule(rule, muted)

    def set_toasts(self, enabled: bool = True) -> dict:
        return self._alerts.set_toasts(enabled)

    def get_alert_settings(self) -> dict:
        return self._alerts.get_settings()

    def get_rules(self) -> dict:
        return self._heuristics.get_rules()

    def save_rules(self, patch: dict | None = None) -> dict:
        return self._heuristics.save_rules(patch if isinstance(patch, dict) else None)

    def get_blocklist(self) -> dict:
        return self._heuristics.get_blocklist()

    def set_blocklist(self, items: list | None = None) -> dict:
        return self._heuristics.set_blocklist(items if isinstance(items, list) else [])

    def reload_blocklist(self) -> dict:
        return self._heuristics.reload_blocklist()

    def open_data_dir(self) -> dict:
        from tools.roadway.heuristics import data_dir

        path = data_dir()
        try:
            os.startfile(str(path))  # type: ignore[attr-defined]
            return {"ok": True, "path": str(path)}
        except OSError as exc:
            return {"ok": False, "error": str(exc), "path": str(path)}

    # —— Trust / quiz ——
    def trust_status(self) -> dict:
        return self._trust.status()

    def start_learn(self, minutes: float = 10.0) -> dict:
        res = self._trust.start_learn(minutes)
        # Seed immediately from latest snapshot so the queue is not empty
        with self._lock:
            snap = dict(self._last_snapshot) if self._last_snapshot else None
        if snap is None:
            try:
                snap = self._tick()
            except Exception:
                snap = None
        seeded = []
        if snap:
            seeded = self._trust.observe_snapshot(snap)
            with self._lock:
                if self._last_snapshot is not None:
                    self._last_snapshot["questions"] = self._trust.list_questions().get("questions") or []
                    self._last_snapshot["trust_status"] = self._trust.status()
                    self._last_snapshot["new_questions"] = seeded
        res["seeded"] = len(seeded)
        res["queue_count"] = self._trust.status().get("queue_count", 0)
        return res

    def stop_learn(self) -> dict:
        return self._trust.stop_learn()

    def list_trust(self) -> dict:
        return self._trust.list_trust()

    def add_trust(self, path: str = "", name: str = "") -> dict:
        return self._trust.add_trust(path, name)

    def remove_trust(self, path: str = "", name: str = "") -> dict:
        return self._trust.remove_trust(path, name)

    def list_questions(self) -> dict:
        return self._trust.list_questions()

    def answer_question(self, question_id: str = "", action: str = "") -> dict:
        """trust | ignore | propose_block — never applies firewall itself."""
        return self._trust.answer(question_id, action)

    # —— Manual actions (confirmed flag required) ——
    def open_process_folder(self, pid: int = 0, path: str = "") -> dict:
        return mod_actions.open_process_folder(pid, path)

    def kill_process(self, pid: int = 0, token: str | None = None, confirmed: bool = False) -> dict:
        payload = {"pid": int(pid or 0)}
        denied = self._consume("kill_process", payload, token)
        if denied is not None:
            return denied
        return mod_actions.kill_process(pid, confirmed=True)

    def block_remote(
        self,
        ip: str = "",
        port: int = 0,
        token: str | None = None,
        confirmed: bool = False,
        rule_name: str = "",
    ) -> dict:
        payload = {"ip": str(ip or ""), "port": int(port or 0), "rule_name": str(rule_name or "")}
        denied = self._consume("block_remote", payload, token)
        if denied is not None:
            return denied
        return mod_actions.block_remote(ip, port, confirmed=True, rule_name=rule_name)

    # —— Export ——
    def export_snapshot(self, format: str = "json") -> dict:
        snap = self.get_snapshot()
        fmt = (format or "json").lower()
        flows = snap.get("flows") or snap.get("connections") or []
        if fmt == "csv":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["proto", "laddr", "raddr", "status", "pid", "name", "path", "country", "bps_up", "bps_down"])
            for r in flows:
                if not isinstance(r, dict):
                    continue
                w.writerow(
                    [
                        r.get("proto"),
                        r.get("laddr"),
                        r.get("raddr"),
                        r.get("status"),
                        r.get("pid"),
                        r.get("name"),
                        r.get("path"),
                        r.get("country"),
                        r.get("bps_up"),
                        r.get("bps_down"),
                    ]
                )
            content = buf.getvalue()
            filename = "roadway-flows.csv"
        else:
            content = json.dumps(snap, indent=2, ensure_ascii=False, default=str)
            filename = "roadway-snapshot.json"
        return self._save_dialog(content, filename)

    def export_alerts(self, format: str = "json") -> dict:
        data = self._alerts.list_alerts(500)
        fmt = (format or "json").lower()
        alerts = data.get("alerts") or []
        if fmt == "csv":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["ts", "severity", "rule", "detail", "pid", "name", "remote"])
            for a in alerts:
                w.writerow(
                    [a.get("ts"), a.get("severity"), a.get("rule"), a.get("detail"), a.get("pid"), a.get("name"), a.get("remote")]
                )
            content = buf.getvalue()
            filename = "roadway-alerts.csv"
        else:
            content = json.dumps(alerts, indent=2, ensure_ascii=False, default=str)
            filename = "roadway-alerts.json"
        return self._save_dialog(content, filename)

    def _save_dialog(self, content: str, filename: str) -> dict:
        if self._window is not None and hasattr(self._window, "create_file_dialog"):
            try:
                result = self._window.create_file_dialog(
                    webview.SAVE_DIALOG,
                    save_filename=filename,
                    file_types=("All files (*.*)",),
                )
                if result:
                    path = result if isinstance(result, str) else (result[0] if result else None)
                    if path:
                        Path(path).write_text(content, encoding="utf-8-sig")
                        return {"ok": True, "path": str(path)}
                    return {"ok": True, "cancelled": True}
            except Exception as exc:
                return {"ok": False, "error": str(exc)}
        try:
            import tempfile

            tmp = Path(tempfile.gettempdir()) / filename
            tmp.write_text(content, encoding="utf-8-sig")
            os.startfile(str(tmp))  # type: ignore[attr-defined]
            return {"ok": True, "path": str(tmp), "opened": True}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    # —— Reputation / geo / dns / capture / tray ——
    def get_reputation_settings(self) -> dict:
        return self._reputation.get_settings()

    def set_reputation_enabled(self, enabled: bool = False) -> dict:
        return self._reputation.set_enabled(bool(enabled))

    def set_abuseipdb_key(self, key: str = "") -> dict:
        return self._reputation.set_abuseipdb_key(key)

    def lookup_reputation(self, host_or_ip: str = "") -> dict:
        return self._reputation.lookup(host_or_ip)

    def geo_status(self) -> dict:
        return mod_geo.status()

    def list_dns(self, limit: int = 60) -> dict:
        return mod_dns.list_recent(limit)

    def refresh_dns(self) -> dict:
        items = mod_dns.refresh_cache()
        return {"ok": True, "items": items[:60], "count": len(items)}

    def capture_status(self) -> dict:
        return mod_capture.status()

    def capture_for_ip(self, ip: str = "", seconds: float = 10.0) -> dict:
        return mod_capture.capture_for_ip(ip, seconds)

    def get_startup(self) -> dict:
        return {"ok": True, "enabled": tray_util.is_startup_enabled()}

    def set_startup(self, enabled: bool = False, token: str | None = None) -> dict:
        payload = {"enabled": bool(enabled)}
        denied = self._consume("set_startup", payload, token)
        if denied is not None:
            return denied
        return tray_util.set_startup(bool(enabled))

    def show_window(self) -> dict:
        if self._window is not None:
            try:
                self._window.show()
                self._window.restore()
            except Exception:
                pass
        return {"ok": True}

    def hide_window(self) -> dict:
        if self._window is not None:
            try:
                self._window.hide()
            except Exception:
                pass
        return {"ok": True}


