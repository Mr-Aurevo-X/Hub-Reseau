"""Hub-Reseau — host WebView2 (Vague H2 Couche B)."""

from __future__ import annotations

import ctypes
import subprocess
import sys
from pathlib import Path
from typing import Any

import webview

_HOST_DIR = Path(__file__).resolve().parent
if str(_HOST_DIR) not in sys.path:
    sys.path.insert(0, str(_HOST_DIR))

from api_modules import NetAdminApi, NetMapApi, WifiKeyApi  # noqa: E402
from api_roadway import RoadwayApi  # noqa: E402
from security import ConfirmGate  # noqa: E402
from suite_launch import (  # noqa: E402
    launch_suite_app,
    resolve_suite_accent,
    resolve_suite_language,
)
from window_chrome import WindowChromeMixin, create_tool_window  # noqa: E402

HUB_TITLE = "L'Atelier PC Command — Réseau"
DEFAULT_WIDTH = 1180
DEFAULT_HEIGHT = 780


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
        self.dashboard = DashboardApi(self)
        self.netadmin = NetAdminApi(self._confirm)
        self.netmap = NetMapApi(self._confirm)
        self.wifikey = WifiKeyApi(self._confirm)
        self.roadway = RoadwayApi()

    def set_window(self, window: Any) -> None:
        WindowChromeMixin.set_window(self, window)
        # RoadWay tray/window helpers may need the HWND
        try:
            self.roadway._window = window  # noqa: SLF001
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

    def set_window_title(self, title: str = "") -> dict:
        title = (title or "").strip() or HUB_TITLE
        try:
            if self._window is not None:
                self._window.set_title(title)
            return {"ok": True, "title": title}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def open_suite_app(self, name: str) -> dict:
        return launch_suite_app(name)


def main() -> None:
    index = ui_dir() / "index.html"
    if not index.is_file():
        raise SystemExit(f"UI introuvable: {index}")
    _ = is_admin()
    api = Api()
    create_tool_window(
        title=HUB_TITLE,
        url=index.as_uri(),
        js_api=api,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        background_color="#06070c",
    )
    webview.start()


if __name__ == "__main__":
    main()
