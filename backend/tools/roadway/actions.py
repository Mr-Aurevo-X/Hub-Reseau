# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Manual-only destructive actions — never called automatically."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import psutil

_PROTECTED_PIDS = frozenset({0, 4})
_PROTECTED_NAMES = frozenset(
    {
        "system",
        "smss.exe",
        "csrss.exe",
        "wininit.exe",
        "winlogon.exe",
        "services.exe",
        "lsass.exe",
        "svchost.exe",
        "lsm.exe",
        "fontdrvhost.exe",
        "dwm.exe",
        "memory compression",
        "registry",
        "secure system",
        "explorer.exe",
    }
)


def open_process_folder(pid: int = 0, path: str = "") -> dict[str, Any]:
    target = (path or "").strip()
    if not target and pid:
        try:
            p = psutil.Process(int(pid))
            target = p.exe() or ""
        except (psutil.Error, OSError, TypeError, ValueError):
            return {"ok": False, "error": "Processus introuvable"}
    if not target:
        return {"ok": False, "error": "Chemin vide"}
    folder = Path(target)
    folder = folder if folder.is_dir() else folder.parent
    if not folder.is_dir():
        return {"ok": False, "error": "Dossier introuvable"}
    try:
        os.startfile(str(folder))  # type: ignore[attr-defined]
        return {"ok": True, "path": str(folder)}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}


def kill_process(pid: int, confirmed: bool = False) -> dict[str, Any]:
    """Requires confirmed=True from UI. Never auto-invoked."""
    if not confirmed:
        return {"ok": False, "error": "Confirmation requise", "needs_confirm": True}
    try:
        pid_n = int(pid)
    except (TypeError, ValueError):
        return {"ok": False, "error": "PID invalide"}
    if pid_n in _PROTECTED_PIDS:
        return {"ok": False, "error": "PID protégé"}
    try:
        p = psutil.Process(pid_n)
        name = (p.name() or "").lower()
        if name in _PROTECTED_NAMES:
            return {"ok": False, "error": f"Processus protégé: {name}"}
        p.terminate()
        try:
            p.wait(timeout=2)
        except psutil.TimeoutExpired:
            p.kill()
        return {"ok": True, "pid": pid_n, "name": name}
    except psutil.NoSuchProcess:
        return {"ok": False, "error": "Déjà terminé"}
    except (psutil.Error, OSError) as exc:
        return {"ok": False, "error": str(exc)}


def block_remote(
    ip: str = "",
    port: int = 0,
    confirmed: bool = False,
    rule_name: str = "",
) -> dict[str, Any]:
    """Outbound firewall block via netsh. Requires confirmed=True. Never auto."""
    if not confirmed:
        return {"ok": False, "error": "Confirmation requise", "needs_confirm": True}
    ip_n = (ip or "").strip()
    # strip host:port if passed as raddr
    if ":" in ip_n and not ip_n.count(":") > 1:
        # IPv4:port
        host, _, prt = ip_n.rpartition(":")
        if host and prt.isdigit():
            ip_n = host
            if not port:
                try:
                    port = int(prt)
                except ValueError:
                    pass
    if not ip_n or ip_n in ("0.0.0.0", "::", "*"):
        return {"ok": False, "error": "IP invalide"}
    try:
        port_n = int(port or 0)
    except (TypeError, ValueError):
        port_n = 0
    name = (rule_name or "").strip() or f"RoadWay-X block {ip_n}" + (f":{port_n}" if port_n else "")
    # Sanitize rule name for netsh
    name = "".join(c if c.isalnum() or c in " ._-" else "_" for c in name)[:60]
    remote = f"{ip_n},{port_n}" if port_n > 0 else ip_n
    cmd = [
        "netsh",
        "advfirewall",
        "firewall",
        "add",
        "rule",
        f"name={name}",
        "dir=out",
        "action=block",
        f"remoteip={ip_n}",
        "enable=yes",
    ]
    if port_n > 0:
        cmd.extend(["protocol=TCP", f"remoteport={port_n}"])
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=20,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "netsh failed").strip()
            return {
                "ok": False,
                "error": err,
                "hint": "Droits administrateur souvent requis",
                "remote": remote,
            }
        return {"ok": True, "rule": name, "remote": remote}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": str(exc)}
