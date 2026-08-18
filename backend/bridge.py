"""Hub-Reseau namespace APIs — flatten bridge (host.py + backend/)."""
from __future__ import annotations

import ctypes

import subprocess

from pathlib import Path
import sys

_BACKEND = Path(__file__).resolve().parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


import csv
import io
import os
import socket
import time
from typing import Any

import psutil

from tools.netadmin import adapter_reset as mod_adapter
from tools.netadmin import firewall_rules as mod_firewall
from tools.netadmin import hosts_editor as mod_hosts
from tools.netmap import pingtrace as mod_ping
from tools.netmap import proxycheck as mod_proxy
from tools.netmap import shareview as mod_share
from tools.netmap.sitecheck import SiteCheckService
from tools.wifikey import service as mod_wifi
from security import ConfirmGate
from suite_launch import launch_suite_app, resolve_suite_accent, resolve_suite_language


class NetAdminApi:
    """NetAdmin in-process — ConfirmGate on mutators."""

    ACTIONS = ("write_hosts", "set_rule_enabled", "reset_ip", "reset_winsock", "flush_dns")

    def __init__(self, gate: ConfirmGate) -> None:
        self._confirm = gate

    def prepare_action(self, action: str, payload: dict | None = None) -> dict:
        act = str(action or "").strip()
        if act not in self.ACTIONS:
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

    def reset_ip(self, token: str | None = None) -> dict:
        denied = self._consume("reset_ip", {}, token)
        return denied if denied is not None else mod_adapter.reset_ip()

    def reset_winsock(self, token: str | None = None) -> dict:
        denied = self._consume("reset_winsock", {}, token)
        return denied if denied is not None else mod_adapter.reset_winsock()

    def hosts_path(self) -> dict:
        return mod_hosts.hosts_path()

    def read_hosts(self) -> dict:
        return mod_hosts.read_hosts()

    def write_hosts(self, text: str, token: str | None = None) -> dict:
        payload = {"text": str(text or "")}
        denied = self._consume("write_hosts", payload, token)
        return denied if denied is not None else mod_hosts.write_hosts(text)

    def list_profiles(self) -> dict:
        return mod_hosts.list_profiles()

    def save_profile(self, name: str, text: str) -> dict:
        return mod_hosts.save_profile(name, text)

    def load_profile(self, name: str) -> dict:
        return mod_hosts.load_profile(name)

    def flush_dns(self, token: str | None = None) -> dict:
        denied = self._consume("flush_dns", {}, token)
        return denied if denied is not None else mod_hosts.flush_dns()

    def resolve_host(self, hostname: str) -> dict:
        return mod_hosts.resolve_host(hostname)

    def list_rules(self) -> dict:
        return mod_firewall.list_rules()

    def set_rule_enabled(self, name: str, enabled: bool, token: str | None = None) -> dict:
        payload = {"name": str(name or ""), "enabled": bool(enabled)}
        denied = self._consume("set_rule_enabled", payload, token)
        return denied if denied is not None else mod_firewall.set_rule_enabled(name, enabled)

    def open_dedicated(self) -> dict:
        return launch_suite_app("NetAdmin")


class WifiKeyApi:
    def __init__(self, gate: ConfirmGate) -> None:
        self._confirm = gate

    def list_profiles(self) -> dict:
        return mod_wifi.list_profiles()

    def prepare_get_key(self, profile: str) -> dict:
        name = mod_wifi.normalize_profile(profile)
        if not name:
            return {"ok": False, "error": "Profil invalide"}
        try:
            token = self._confirm.prepare("get_key", name)
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "token": token, "profile": name}

    def get_key(self, profile: str, confirm_token: str = "") -> dict:
        name = mod_wifi.normalize_profile(profile)
        if not name:
            return {"ok": False, "error": "Profil invalide"}
        if not self._confirm.consume(str(confirm_token or ""), "get_key", name):
            return {"ok": False, "error": "Confirmation requise ou expirée"}
        return mod_wifi.get_key(name)

    def open_dedicated(self) -> dict:
        return launch_suite_app("WifiKey")


def _fmt_addr(addr: Any) -> str:
    if not addr:
        return ""
    try:
        ip, port = addr.ip, addr.port
        if ip is None:
            return ""
        return f"{ip}:{port}" if port is not None else str(ip)
    except (AttributeError, TypeError):
        return str(addr)


def _proto_label(conn: Any) -> str:
    try:
        t = conn.type
        if t == getattr(psutil, "SOCK_STREAM", 1):
            return "TCP"
        if t == getattr(psutil, "SOCK_DGRAM", 2):
            return "UDP"
    except (AttributeError, TypeError):
        pass
    return "?"


class NetMapApi:
    """NetMap in-process + ConfirmGate on proxy env mutators."""

    ACTIONS = ("set_user_env_proxy", "clear_user_env_proxy")

    def __init__(self, gate: ConfirmGate) -> None:
        self._confirm = gate
        self._sitecheck = SiteCheckService()
        self._window: Any = None

    def prepare_action(self, action: str, payload: dict | None = None) -> dict:
        act = str(action or "").strip()
        if act not in self.ACTIONS:
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

    def run_ping_trace(self, host: str = "") -> dict:
        return mod_ping.run_ping_trace(host)

    def read_proxies(self) -> dict:
        return mod_proxy.read_proxies()

    def set_user_env_proxy(
        self, http: str = "", https: str = "", no_proxy: str = "", token: str | None = None
    ) -> dict:
        payload = {"http": http, "https": https, "no_proxy": no_proxy}
        denied = self._consume("set_user_env_proxy", payload, token)
        return denied if denied is not None else mod_proxy.set_user_env_proxy(http, https, no_proxy)

    def clear_user_env_proxy(self, token: str | None = None) -> dict:
        denied = self._consume("clear_user_env_proxy", {}, token)
        return denied if denied is not None else mod_proxy.clear_user_env_proxy()

    def list_shares(self) -> dict:
        return mod_share.list_shares()

    def get_favorites(self) -> dict:
        return self._sitecheck.get_favorites()

    def add_favorite(self, url: str, label: str = "", interval_minutes: int = 0) -> dict:
        return self._sitecheck.add_favorite(url, label, interval_minutes)

    def remove_favorite(self, item_id: str) -> dict:
        return self._sitecheck.remove_favorite(item_id)

    def get_history(self, limit: int = 40) -> dict:
        return self._sitecheck.get_history(limit)

    def check_site(self, url: str) -> dict:
        return self._sitecheck.check_site(url)

    def check_all_favorites(self) -> dict:
        return self._sitecheck.check_all_favorites()

    def get_watch_status(self) -> dict:
        return self._sitecheck.get_watch_status()

    def start_watch(self, interval_minutes: int = 5) -> dict:
        return self._sitecheck.start_watch(interval_minutes)

    def stop_watch(self) -> dict:
        return self._sitecheck.stop_watch()

    def tcp_probe(self, host: str = "127.0.0.1", port: int = 80, timeout: float = 2.0) -> dict:
        host_n = (host or "").strip() or "127.0.0.1"
        try:
            port_n = int(port)
        except (TypeError, ValueError):
            return {"ok": False, "error": "Port invalide (1–65535)"}
        if port_n < 1 or port_n > 65535:
            return {"ok": False, "error": "Port invalide (1–65535)"}
        try:
            timeout_n = float(timeout) if timeout is not None else 2.0
        except (TypeError, ValueError):
            timeout_n = 2.0
        timeout_n = max(0.2, min(timeout_n, 30.0))
        started = time.perf_counter()
        status = "closed"
        err = ""
        try:
            with socket.create_connection((host_n, port_n), timeout=timeout_n):
                status = "open"
        except socket.timeout:
            status = "timeout"
        except OSError as exc:
            status = "closed"
            err = str(exc)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "host": host_n, "port": port_n}
        ms = int((time.perf_counter() - started) * 1000)
        return {"ok": True, "host": host_n, "port": port_n, "status": status, "ms": ms, "error": err or None}

    def check_port(self, port: int = 0) -> dict:
        """Find listeners / connections on a local port (PID + process) — SoT NetMap."""
        try:
            port_n = int(port)
        except (TypeError, ValueError):
            return {"ok": False, "error": "Port invalide (1–65535)", "connections": [], "count": 0}
        if port_n < 1 or port_n > 65535:
            return {"ok": False, "error": "Port invalide (1–65535)", "connections": [], "count": 0}

        proc_cache: dict[int, dict[str, str]] = {}

        def proc_info(pid: int | None) -> dict[str, str]:
            if not pid or pid <= 0:
                return {"name": "", "path": ""}
            if pid in proc_cache:
                return proc_cache[pid]
            name, path = "", ""
            try:
                p = psutil.Process(pid)
                name = p.name() or ""
                try:
                    path = p.exe() or ""
                except (psutil.Error, OSError):
                    path = ""
            except (psutil.Error, OSError):
                pass
            info = {"name": name, "path": path}
            proc_cache[pid] = info
            return info

        rows: list[dict[str, Any]] = []
        try:
            conns = psutil.net_connections(kind="inet")
        except (psutil.Error, OSError, PermissionError) as exc:
            return {"ok": False, "error": str(exc), "connections": [], "count": 0}

        for c in conns:
            try:
                laddr = c.laddr
                if not laddr or getattr(laddr, "port", None) != port_n:
                    continue
                pid = c.pid
                meta = proc_info(pid)
                status = (c.status or "") if hasattr(c, "status") else ""
                rows.append(
                    {
                        "proto": _proto_label(c),
                        "laddr": _fmt_addr(c.laddr),
                        "raddr": _fmt_addr(c.raddr),
                        "status": status,
                        "pid": pid or 0,
                        "name": meta["name"],
                        "path": meta["path"],
                    }
                )
            except (AttributeError, TypeError, ValueError):
                continue

        rows.sort(key=lambda r: ((r.get("status") or ""), r.get("pid") or 0))
        return {"ok": True, "port": port_n, "connections": rows, "count": len(rows)}

    def export_csv(self, rows: list | None = None) -> dict:
        """Export connection rows to CSV (save dialog or temp fallback) — SoT NetMap."""
        items = rows if isinstance(rows, list) else []
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["proto", "laddr", "raddr", "status", "pid", "name", "path"])
        for raw in items:
            if not isinstance(raw, dict):
                continue
            writer.writerow(
                [
                    raw.get("proto") or "",
                    raw.get("laddr") or "",
                    raw.get("raddr") or "",
                    raw.get("status") or "",
                    raw.get("pid") or "",
                    raw.get("name") or "",
                    raw.get("path") or "",
                ]
            )
        content = buf.getvalue()

        if self._window is not None and hasattr(self._window, "create_file_dialog"):
            try:
                import webview

                result = self._window.create_file_dialog(
                    webview.SAVE_DIALOG,
                    save_filename="netmap-connections.csv",
                    file_types=("CSV Files (*.csv)", "All files (*.*)"),
                )
                if result:
                    path = result if isinstance(result, str) else (result[0] if result else None)
                    if path:
                        Path(path).write_text(content, encoding="utf-8-sig")
                        return {"ok": True, "path": str(path), "count": len(items)}
                    return {"ok": True, "cancelled": True}
            except Exception as exc:  # noqa: BLE001
                return {"ok": False, "error": str(exc)}

        try:
            import tempfile

            tmp = Path(tempfile.gettempdir()) / "netmap-connections.csv"
            tmp.write_text(content, encoding="utf-8-sig")
            os.startfile(str(tmp))  # type: ignore[attr-defined]
            return {"ok": True, "path": str(tmp), "count": len(items), "opened": True}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    def open_path(self, path: str = "") -> dict:
        """Open process folder in Explorer — SoT NetMap."""
        path_n = (path or "").strip()
        if not path_n:
            return {"ok": False, "error": "Chemin vide"}
        p = Path(path_n)
        folder = p if p.is_dir() else p.parent
        if not folder.is_dir():
            return {"ok": False, "error": "Dossier introuvable"}
        try:
            os.startfile(str(folder))  # type: ignore[attr-defined]
            return {"ok": True, "path": str(folder)}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    def list_connections(self) -> dict:
        rows: list[dict[str, Any]] = []
        proc_cache: dict[int, dict[str, str]] = {}

        def proc_info(pid: int | None) -> dict[str, str]:
            if not pid or pid <= 0:
                return {"name": "", "path": ""}
            if pid in proc_cache:
                return proc_cache[pid]
            name, path = "", ""
            try:
                p = psutil.Process(pid)
                name = p.name() or ""
                try:
                    path = p.exe() or ""
                except (psutil.Error, OSError):
                    path = ""
            except (psutil.Error, OSError):
                pass
            info = {"name": name, "path": path}
            proc_cache[pid] = info
            return info

        try:
            conns = psutil.net_connections(kind="inet")
        except (psutil.Error, OSError, PermissionError) as exc:
            return {"ok": False, "error": str(exc), "connections": [], "count": 0}

        for c in conns:
            try:
                pid = c.pid
                meta = proc_info(pid)
                rows.append(
                    {
                        "proto": _proto_label(c),
                        "laddr": _fmt_addr(c.laddr),
                        "raddr": _fmt_addr(c.raddr),
                        "status": (c.status or "") if hasattr(c, "status") else "",
                        "pid": pid or 0,
                        "name": meta["name"],
                        "path": meta["path"],
                    }
                )
            except (AttributeError, TypeError, ValueError):
                continue
        return {"ok": True, "connections": rows, "count": len(rows)}

    def open_dedicated(self) -> dict:
        return launch_suite_app("NetMap")


HUB_TITLE = "PC Command | Network"
HUB_ID = "reseau"
_HUB_ROOT = _BACKEND.parent
from window_chrome import WindowChromeMixin  # noqa: E402
import hub_update  # noqa: E402
from api_roadway import RoadwayApi  # noqa: E402

def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False

def _ps_json(script: str, timeout: int = 20) -> Any:
    cmd = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]
    flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
    proc = subprocess.run(cmd, capture_output=True, timeout=timeout, creationflags=flags, text=True)
    out = (proc.stdout or "").strip()
    if not out:
        return None
    import json

    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"raw": out, "returncode": proc.returncode}

class DashboardApi:
    def __init__(self, hub: "Api") -> None:
        self._hub = hub

    def get_metrics_url(self) -> dict:
        """URL of embedded localhost metrics API for Accueil live UI."""
        host = getattr(self._hub, "_metrics_host", "127.0.0.1") or "127.0.0.1"
        port = int(getattr(self._hub, "_metrics_port", 0) or 0)
        if port <= 0:
            return {"ok": False, "url": "", "error": "metrics offline"}
        return {"ok": True, "url": f"http://{host}:{port}/api/metrics"}


    def get_kpis(self) -> dict:
        base: dict[str, Any] = {"ok": True, "admin": is_admin(), "partial": False}
        try:
            data = _ps_json(
                r"""
$ErrorActionPreference='SilentlyContinue'
$nics = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')
$tcp = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue)
[pscustomobject]@{
  nicUp = $nics.Count
  nicNames = @($nics | Select-Object -First 3 -ExpandProperty Name) -join ', '
  tcpEstablished = $tcp.Count
} | ConvertTo-Json -Compress
"""
            )
            if isinstance(data, dict):
                base.update(data)
        except Exception as exc:  # noqa: BLE001
            base["partial"] = True
            base["error"] = str(exc)
        return base

    def list_modules(self) -> dict:
        return {"ok": True, "modules": self._hub.module_catalog()}


class Api(WindowChromeMixin):
    def __init__(self) -> None:
        self._window: Any = None
        self._maximized = False
        self._confirm = ConfirmGate(ttl_seconds=90.0)
        self._metrics_host = "127.0.0.1"
        self._metrics_port = 0
        self.dashboard = DashboardApi(self)
        self.netadmin = NetAdminApi(self._confirm)
        self.netmap = NetMapApi(self._confirm)
        self.wifikey = WifiKeyApi(self._confirm)
        self.roadway = RoadwayApi()

    def set_window(self, window: Any) -> None:
        WindowChromeMixin.set_window(self, window)
        # RoadWay / NetMap export dialogs need the HWND
        try:
            self.roadway._window = window  # noqa: SLF001
        except Exception:  # noqa: BLE001
            pass
        try:
            self.netmap._window = window  # noqa: SLF001
        except Exception:  # noqa: BLE001
            pass

    def module_catalog(self) -> list[dict]:
        return [
            {
                "id": "netadmin",
                "label": "NetAdmin",
                "desc": "Adaptateurs, hosts, firewall (in-process)",
            },
            {
                "id": "netmap",
                "label": "NetMap",
                "desc": "Connexions TCP/UDP · ping · proxy · partages",
            },
            {
                "id": "roadway",
                "label": "RoadWay-X",
                "desc": "Trafic live · alertes · règles",
            },
            {
                "id": "wifikey",
                "label": "WifiKey",
                "desc": "Profils Wi-Fi et clés (ConfirmGate)",
            },
        ]

    def get_suite_accent(self) -> dict:
        return {"ok": True, "accent": resolve_suite_accent()}

    def get_suite_settings(self) -> dict:
        return {
            "ok": True,
            "accent": resolve_suite_accent(),
            "language": resolve_suite_language(),
        }

    def get_suite_language(self) -> dict:
        return {"ok": True, "language": resolve_suite_language()}

    def is_admin(self) -> dict:
        return {"ok": True, "admin": is_admin()}


    def set_metrics_endpoint(self, host: str = "127.0.0.1", port: int = 0) -> dict:
        self._metrics_host = host or "127.0.0.1"
        self._metrics_port = int(port or 0)
        return {"ok": True, "host": self._metrics_host, "port": self._metrics_port}

    def set_window_title(self, title: str = "") -> dict:
        title = (title or "").strip() or HUB_TITLE
        try:
            if self._window is not None:
                self._window.set_title(title)
            return {"ok": True, "title": title}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def get_app_version(self) -> dict:
        ver = hub_update.get_local_suite_version(_HUB_ROOT)
        return {
            "ok": True,
            "version": ver,
            "hubId": HUB_ID,
            "title": hub_update.title_with_version(HUB_TITLE, ver),
        }

    def check_for_update(self) -> dict:
        return hub_update.check_hub_update(HUB_ID, _HUB_ROOT)

    def open_update(self) -> dict:
        info = hub_update.check_hub_update(HUB_ID, _HUB_ROOT)
        return hub_update.open_update_action(
            _HUB_ROOT, release_url=info.get("releaseUrl")
        )

    def apply_update(self, force: bool = False) -> dict:
        """Download + replace Launch-Hub zip in-place (LOCALAPPDATA install)."""
        return hub_update.apply_hub_update(HUB_ID, _HUB_ROOT, force=bool(force))

    def open_suite_app(self, name: str) -> dict:
        return launch_suite_app(name)

