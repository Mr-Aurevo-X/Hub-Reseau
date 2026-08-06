"""Hub-Reseau namespace APIs — Couche B (in-process)."""
from __future__ import annotations

import socket
import time
from typing import Any

import psutil

from modules.netadmin import adapter_reset as mod_adapter
from modules.netadmin import firewall_rules as mod_firewall
from modules.netadmin import hosts_editor as mod_hosts
from modules.netmap import pingtrace as mod_ping
from modules.netmap import proxycheck as mod_proxy
from modules.netmap import shareview as mod_share
from modules.netmap.sitecheck import SiteCheckService
from modules.wifikey import service as mod_wifi
from security import ConfirmGate


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
        from suite_launch import launch_suite_app

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
        from suite_launch import launch_suite_app

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
        from suite_launch import launch_suite_app

        return launch_suite_app("NetMap")
