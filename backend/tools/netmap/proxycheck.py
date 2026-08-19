# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""ProxyCheck — WinHTTP / WinINET / env proxies."""
from __future__ import annotations
from typing import Any

def _ps_json(script: str, timeout: int = 90):
    import json, subprocess
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
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

def _normalize_rows(data):
    if data is None:
        return []
    if isinstance(data, dict):
        return [data]
    return list(data)

def _run_cmd_text(args, timeout=120):
    import subprocess
    proc = subprocess.run(
        args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return out.strip(), int(proc.returncode)


def read_proxies() -> dict[str, Any]:
    try:
        winhttp, _rc = _run_cmd_text(["netsh", "winhttp", "show", "proxy"])
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
)
$inet = @{}
foreach ($p in $paths) {
  $key = if ($p -like 'HKCU:*') { 'user' } else { 'machine' }
  try {
    $props = Get-ItemProperty -Path $p -ErrorAction Stop
    $inet[$key] = @{
      enabled = [bool]$props.ProxyEnable
      server = [string]$props.ProxyServer
      override = [string]$props.ProxyOverride
      autoConfigURL = [string]$props.AutoConfigURL
    }
  } catch {
    $inet[$key] = @{ enabled = $false; server = ''; override = ''; autoConfigURL = '' }
  }
}
function Get-EnvVal([string]$n) {
  $u = [Environment]::GetEnvironmentVariable($n, 'User')
  $p = [Environment]::GetEnvironmentVariable($n, 'Process')
  $m = [Environment]::GetEnvironmentVariable($n, 'Machine')
  return @{ user = [string]$u; process = [string]$p; machine = [string]$m }
}
[pscustomobject]@{
  wininet = $inet
  env = @{
    HTTP_PROXY = Get-EnvVal 'HTTP_PROXY'
    HTTPS_PROXY = Get-EnvVal 'HTTPS_PROXY'
    NO_PROXY = Get-EnvVal 'NO_PROXY'
  }
} | ConvertTo-Json -Compress -Depth 6
"""
        extra = _ps_json(script) or {}
        env = dict((extra or {}).get("env") or {})
        # PS hashtables are case-insensitive; mirror lowercase aliases for UI
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"):
            if k in env:
                env[k.lower()] = env[k]
        out = {"ok": True, "winhttp": winhttp, **(extra or {}), "env": env}
        return out
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def set_user_env_proxy(http: str = "", https: str = "", no_proxy: str = "") -> dict[str, Any]:
    try:
        http_v = (http or "").strip()
        https_v = (https or "").strip()
        no_v = (no_proxy or "").strip()
        script = f"""
$ErrorActionPreference = 'Stop'
function Set-UserEnv([string]$name, [string]$val) {{
  if ($val) {{ [Environment]::SetEnvironmentVariable($name, $val, 'User') }}
  else {{ [Environment]::SetEnvironmentVariable($name, $null, 'User') }}
}}
Set-UserEnv 'HTTP_PROXY' '{http_v.replace("'", "''")}'
Set-UserEnv 'HTTPS_PROXY' '{https_v.replace("'", "''")}'
Set-UserEnv 'NO_PROXY' '{no_v.replace("'", "''")}'
Set-UserEnv 'http_proxy' '{http_v.replace("'", "''")}'
Set-UserEnv 'https_proxy' '{https_v.replace("'", "''")}'
Set-UserEnv 'no_proxy' '{no_v.replace("'", "''")}'
'{{"ok":true}}'
"""
        _ps_json(script)
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def clear_user_env_proxy() -> dict[str, Any]:
    return set_user_env_proxy("", "", "")
