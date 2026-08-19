# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""AdapterReset logic — ipconfig release/renew and winsock reset."""
from __future__ import annotations

import ctypes
import subprocess


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _run_cmd(args: list[str], timeout: int = 120) -> tuple[str, int]:
    proc = subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return out.strip(), int(proc.returncode)


def reset_ip() -> dict:
    if not is_admin():
        return {"ok": False, "error": "Administrateur requis", "needsAdmin": True}
    try:
        release_out, release_rc = _run_cmd(["ipconfig", "/release"], timeout=60)
        renew_out, renew_rc = _run_cmd(["ipconfig", "/renew"], timeout=120)
        output = f"=== ipconfig /release ===\n{release_out}\n\n=== ipconfig /renew ===\n{renew_out}"
        ok = renew_rc == 0 or release_rc == 0
        return {
            "ok": ok,
            "output": output,
            "admin": True,
            "error": None if ok else "ipconfig a échoué",
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Délai dépassé", "needsAdmin": False}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def reset_winsock() -> dict:
    if not is_admin():
        return {"ok": False, "error": "Administrateur requis", "needsAdmin": True}
    try:
        out, rc = _run_cmd(["netsh", "winsock", "reset"], timeout=60)
        return {
            "ok": rc == 0,
            "output": out,
            "rebootRecommended": True,
            "admin": True,
            "error": None if rc == 0 else out or "netsh winsock reset failed",
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Délai dépassé"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
