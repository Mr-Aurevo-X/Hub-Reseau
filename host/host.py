"""Hub-Reseau — host WebView2 (Vague H1 / Couche A)."""

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

from suite_launch import (  # noqa: E402
    launch_suite_app,
    resolve_suite_accent,
    resolve_suite_language,
)
from window_chrome import WindowChromeMixin, create_tool_window  # noqa: E402

HUB_TITLE = "L'Atelier PC — Réseau"
DEFAULT_WIDTH = 1120
DEFAULT_HEIGHT = 740


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
    import json as _json

    try:
        return _json.loads(out)
    except _json.JSONDecodeError:
        return {"raw": out, "returncode": proc.returncode}


class DashboardApi:
    """Lecture seule — aucun mutator."""

    def __init__(self, hub: "Api") -> None:
        self._hub = hub

    def get_kpis(self) -> dict:
        base = {"ok": True, "admin": is_admin(), "partial": False}
        try:
            data = _ps_json("$ErrorActionPreference='SilentlyContinue'\n$nics = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')\n$tcp = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue)\n[pscustomobject]@{\n  nicUp = $nics.Count\n  nicNames = @($nics | Select-Object -First 3 -ExpandProperty Name) -join ', '\n  tcpEstablished = $tcp.Count\n} | ConvertTo-Json -Compress\n")
            if isinstance(data, dict):
                base.update(data)
        except Exception as exc:  # noqa: BLE001
            base["partial"] = True
            base["error"] = str(exc)
        return base

    def list_modules(self) -> dict:
        return {"ok": True, "modules": self._hub.module_catalog()}


class LaunchModuleApi:
    """Couche A — lance les apps Atelier/Lab siblings."""

    def __init__(self, hub: "Api", module_id: str, apps: list[str]) -> None:
        self._hub = hub
        self.module_id = module_id
        self.apps = list(apps)

    def list_apps(self) -> dict:
        return {"ok": True, "module": self.module_id, "apps": self.apps}

    def open_app(self, name: str = "") -> dict:
        name = (name or "").strip()
        if name not in self.apps:
            return {"ok": False, "error": f"App hors module {self.module_id}: {name}"}
        return launch_suite_app(name)


class Api(WindowChromeMixin):
    def __init__(self) -> None:
        self._window: Any = None
        self._maximized = False
        self.dashboard = DashboardApi(self)
        self.netadmin = LaunchModuleApi(self, "netadmin", ["NetAdmin"])
        self.netmap = LaunchModuleApi(self, "netmap", ["NetMap"])
        self.roadway = LaunchModuleApi(self, "roadway", ["RoadWay-X"])
        self.wifikey = LaunchModuleApi(self, "wifikey", ["WifiKey"])

    def set_window(self, window: Any) -> None:
        WindowChromeMixin.set_window(self, window)

    def module_catalog(self) -> list[dict]:
        return [
{
    "id": "netadmin",
    "label": "NetAdmin",
    "desc": "Adaptateurs, hosts, firewall",
    "apps": self.netadmin.apps,
},
{
    "id": "netmap",
    "label": "NetMap",
    "desc": "Connexions TCP/UDP ↔ PID",
    "apps": self.netmap.apps,
},
{
    "id": "roadway",
    "label": "RoadWay-X",
    "desc": "Trafic live NIC / alertes",
    "apps": self.roadway.apps,
},
{
    "id": "wifikey",
    "label": "WifiKey",
    "desc": "Profils et clés Wi-Fi",
    "apps": self.wifikey.apps,
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
