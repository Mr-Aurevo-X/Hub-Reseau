# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Hub-Reseau — entry WebView2 (flatten: host.py + backend/)."""

from __future__ import annotations

__author__ = "Mr-Aurevo-X"

import argparse
import ctypes
import os
import sys
from pathlib import Path

import webview

_HUB_ROOT = Path(__file__).resolve().parent
_BACKEND = _HUB_ROOT / "backend"
for _p in (_HUB_ROOT, _BACKEND):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from backend.bridge import HUB_TITLE, Api  # noqa: E402
from window_chrome import create_tool_window  # noqa: E402

DEFAULT_WIDTH = 1180
DEFAULT_HEIGHT = 780


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return _HUB_ROOT


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


def _relaunch_as_admin() -> bool:
    """Relaunch elevated via UAC. True if elevated process started."""
    try:
        frozen = bool(getattr(sys, "frozen", False))
        executable = sys.executable
        if frozen:
            params = " ".join(f'"{a}"' for a in sys.argv[1:])
        else:
            script = str(Path(sys.argv[0]).resolve())
            rest = " ".join(f'"{a}"' for a in sys.argv[1:])
            params = f'"{script}"' + (f" {rest}" if rest else "")
        rc = ctypes.windll.shell32.ShellExecuteW(None, "runas", executable, params, None, 1)
        return int(rc) > 32
    except Exception:
        return False



def _start_hub_metrics(api: Api) -> None:
    """Embedded localhost metrics for Accueil live dashboard."""
    try:
        from backend.metrics_server import start_metrics_server
    except Exception as exc:  # noqa: BLE001
        print(f"[metrics] import failed: {exc}")
        return
    host, port = "127.0.0.1", 8765
    try:
        host, port = start_metrics_server(host, port)
    except OSError:
        try:
            host, port = start_metrics_server("127.0.0.1", 0)
        except Exception as exc:  # noqa: BLE001
            print(f"[metrics] bind failed: {exc}")
            return
    except Exception as exc:  # noqa: BLE001
        print(f"[metrics] start failed: {exc}")
        return
    if hasattr(api, "set_metrics_endpoint"):
        api.set_metrics_endpoint(host, port)
    else:
        api._metrics_host = host
        api._metrics_port = int(port)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--view", default="", help="Boot module view id (hash deep-link)")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    capture_mode = os.environ.get("HUB_CAPTURE", "").strip() == "1"
    if not capture_mode and not is_admin():
        if _relaunch_as_admin():
            raise SystemExit(0)
        raise SystemExit(f"{HUB_TITLE} nécessite les droits administrateur.")
    index = ui_dir() / "index.html"
    if not index.is_file():
        raise SystemExit(f"UI introuvable: {index}")
    url = index.as_uri()
    view = (args.view or "").strip().lstrip("#")
    if view:
        url = f"{url}#{view}"
    api = Api()
    _start_hub_metrics(api)
    create_tool_window(
        title=HUB_TITLE,
        url=url,
        js_api=api,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        background_color="#06070c",
    )
    webview.start()


if __name__ == "__main__":
    main()
