"""ShareView — SMB / net share listing."""
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


def list_shares() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$rows = @()
try {
  $rows = @(Get-SmbShare -ErrorAction Stop |
    Select-Object Name, Path, Description, ShareState, ScopeName |
    Sort-Object Name)
} catch {}
if (-not $rows -or $rows.Count -eq 0) {
  $net = net share 2>&1 | Out-String
  $lines = $net -split "`r?`n"
  $in = $false
  foreach ($line in $lines) {
    if ($line -match '^-{5,}') { $in = $true; continue }
    if (-not $in) { continue }
    if ($line -match '^\s*$') { continue }
    if ($line -match "La commande s''est termin") { break }
    if ($line -match 'The command completed successfully') { break }
    $parts = ($line -split '\s{2,}') | Where-Object { $_ }
    if ($parts.Count -ge 2) {
      $rows += [pscustomobject]@{
        Name = [string]$parts[0]
        Path = [string]$parts[1]
        Description = if ($parts.Count -ge 3) { [string]($parts[2..($parts.Count-1)] -join ' ') } else { '' }
        ShareState = ''
        ScopeName = ''
      }
    }
  }
}
$rows | ConvertTo-Json -Compress -Depth 4
"""
        data = _ps_json(script, timeout=90)
        rows = _normalize_rows(data)
        cleaned = []
        for row in rows:
            name = str(row.get("Name") or "").strip()
            if not name or name.endswith("$"):
                continue
            cleaned.append({
                "name": name,
                "path": str(row.get("Path") or ""),
                "description": str(row.get("Description") or ""),
                "state": str(row.get("ShareState") or ""),
            })
        return {"ok": True, "shares": cleaned, "count": len(cleaned)}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "shares": [], "count": 0}
