"""FirewallRules logic — list and enable/disable NetFirewall rules."""
from __future__ import annotations

import ctypes
import json
import subprocess
from typing import Any


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _ps_json(script: str, timeout: int = 60) -> Any:
    cmd = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0 and not out:
        raise RuntimeError(err or f"PowerShell exit {proc.returncode}")
    if not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"raw": out, "stderr": err, "returncode": proc.returncode}


def list_rules() -> dict:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
Get-NetFirewallRule | Select-Object Name, DisplayName, Enabled, Direction, Action, Profile |
  Sort-Object DisplayName | Select-Object -First 800 | ConvertTo-Json -Compress -Depth 3
"""
        data = _ps_json(script, timeout=120)
        if data is None:
            rows: list = []
        elif isinstance(data, dict):
            rows = [data]
        else:
            rows = list(data)
        return {"ok": True, "rules": rows, "count": len(rows), "admin": is_admin()}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def set_rule_enabled(name: str, enabled: bool) -> dict:
    try:
        name = (name or "").strip()
        if not name or any(c in name for c in ';|&<>`"'):
            return {"ok": False, "error": "Nom invalide"}
        safe = name.replace("'", "''")
        en = "$true" if enabled else "$false"
        script = (
            f"$ErrorActionPreference='Stop'; "
            f"try {{ Set-NetFirewallRule -Name '{safe}' -Enabled {en}; 'OK' }} "
            f"catch {{ $_.Exception.Message }}"
        )
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = (proc.stdout or "").strip()
        if out != "OK":
            return {"ok": False, "error": out or (proc.stderr or "").strip()}
        return {"ok": True, "name": name, "enabled": enabled}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
