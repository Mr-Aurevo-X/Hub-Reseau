# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

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


def _as_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    s = str(val).strip().lower()
    return s in {"1", "true", "enabled", "yes"}


def _str_field(row: dict[str, Any], *keys: str) -> str:
    for k in keys:
        if k in row and row[k] is not None:
            return str(row[k]).strip()
    return ""


def _normalize_rule(row: dict[str, Any]) -> dict[str, Any]:
    """Map PowerShell PascalCase / enum JSON → stable lowercase keys for the UI."""
    name = _str_field(row, "name", "Name")
    display = _str_field(row, "displayName", "DisplayName") or name
    return {
        "name": name,
        "displayName": display,
        "enabled": _as_bool(row.get("enabled", row.get("Enabled"))),
        "direction": _str_field(row, "direction", "Direction"),
        "action": _str_field(row, "action", "Action"),
        "protocol": _str_field(row, "protocol", "Protocol") or "—",
        "profile": _str_field(row, "profile", "Profile"),
    }


def list_rules() -> dict:
    try:
        # Emit lowercase keys + .ToString() on enums so ConvertTo-Json is not numeric / PascalCase-only.
        # Protocol via PortFilter would be ~1 call/rule (too slow for 800); leave "—" unless present.
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
Get-NetFirewallRule |
  Sort-Object DisplayName |
  Select-Object -First 800 |
  ForEach-Object {
    [pscustomobject]@{
      name        = [string]$_.Name
      displayName = $(
        $dn = [string]$_.DisplayName
        if ($dn -like '@{*') { [string]$_.Name } else { $dn }
      )
      enabled     = ($_.Enabled.ToString() -eq 'True')
      direction   = $_.Direction.ToString()
      action      = $_.Action.ToString()
      protocol    = ''
      profile     = $_.Profile.ToString()
    }
  } | ConvertTo-Json -Compress -Depth 3
"""
        data = _ps_json(script, timeout=120)
        if data is None:
            rows_raw: list = []
        elif isinstance(data, dict):
            rows_raw = [data]
        else:
            rows_raw = list(data)
        rows = [_normalize_rule(r if isinstance(r, dict) else {}) for r in rows_raw]
        rows = [r for r in rows if r.get("name")]
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
