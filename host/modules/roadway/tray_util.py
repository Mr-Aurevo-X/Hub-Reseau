"""System tray + Windows startup shortcut helpers."""
from __future__ import annotations

import os
import sys
import threading
from pathlib import Path
from typing import Any, Callable


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    # hub/host/modules/roadway/tray_util.py -> hub root
    return Path(__file__).resolve().parents[3]


def startup_dir() -> Path:
    appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def startup_lnk_path() -> Path:
    return startup_dir() / "RoadWay-X.lnk"


def is_startup_enabled() -> bool:
    return startup_lnk_path().is_file()


def set_startup(enabled: bool = True) -> dict[str, Any]:
    lnk = startup_lnk_path()
    if not enabled:
        try:
            if lnk.is_file():
                lnk.unlink()
            return {"ok": True, "enabled": False}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}
    try:
        target = Path(sys.executable)
        args = ""
        work = app_dir()
        if getattr(sys, "frozen", False):
            args = "--minimized"
        else:
            # python host\host.py --minimized
            host_py = app_dir() / "host" / "host.py"
            target = Path(sys.executable)
            args = f'"{host_py}" --minimized'
            work = app_dir()
        # Use PowerShell to create shortcut
        ps = f"""
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('{str(lnk).replace("'", "''")}')
$s.TargetPath = '{str(target).replace("'", "''")}'
$s.Arguments = '{args.replace("'", "''")}'
$s.WorkingDirectory = '{str(work).replace("'", "''")}'
$s.Description = 'RoadWay-X'
$s.Save()
"""
        import subprocess

        subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            capture_output=True,
            timeout=15,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return {"ok": lnk.is_file(), "enabled": lnk.is_file(), "path": str(lnk)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


class TrayController:
    def __init__(
        self,
        *,
        on_show: Callable[[], None],
        on_pause: Callable[[], None],
        on_resume: Callable[[], None],
        on_quit: Callable[[], None],
    ) -> None:
        self._on_show = on_show
        self._on_pause = on_pause
        self._on_resume = on_resume
        self._on_quit = on_quit
        self._icon = None
        self._thread: threading.Thread | None = None
        self._paused = False

    def start(self) -> bool:
        try:
            import pystray
            from PIL import Image, ImageDraw
        except ImportError:
            return False

        def make_image() -> Any:
            img = Image.new("RGB", (64, 64), color=(14, 14, 18))
            d = ImageDraw.Draw(img)
            d.ellipse((8, 8, 56, 56), fill=(224, 53, 69))
            return img

        def on_show(icon: Any, item: Any) -> None:
            self._on_show()

        def on_toggle(icon: Any, item: Any) -> None:
            if self._paused:
                self._paused = False
                self._on_resume()
            else:
                self._paused = True
                self._on_pause()

        def on_quit(icon: Any, item: Any) -> None:
            icon.stop()
            self._on_quit()

        menu = pystray.Menu(
            pystray.MenuItem("Afficher", on_show, default=True),
            pystray.MenuItem("Pause / Reprendre monitoring", on_toggle),
            pystray.MenuItem("Quitter", on_quit),
        )
        self._icon = pystray.Icon("RoadWay-X", make_image(), "RoadWay-X", menu)

        def run() -> None:
            assert self._icon is not None
            self._icon.run()

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()
        return True

    def notify(self, title: str, message: str) -> None:
        if self._icon is None:
            return
        try:
            self._icon.notify(message[:180], title[:60])
        except Exception:
            pass

    def stop(self) -> None:
        if self._icon is not None:
            try:
                self._icon.stop()
            except Exception:
                pass
