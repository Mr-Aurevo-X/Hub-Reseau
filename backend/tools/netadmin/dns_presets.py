# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""DNS presets — Cloudflare / Google / Quad9 / DHCP + custom (ConfirmGate in bridge)."""
from __future__ import annotations

import ipaddress
import json
import subprocess
from typing import Any

_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

DNS_PRESETS: list[dict[str, Any]] = [
    {"id": "cloudflare", "name": "Cloudflare", "servers": ["1.1.1.1", "1.0.0.1"]},
    {"id": "google", "name": "Google", "servers": ["8.8.8.8", "8.8.4.4"]},
    {"id": "quad9", "name": "Quad9", "servers": ["9.9.9.9", "149.112.112.112"]},
    {"id": "dhcp", "name": "Automatique (DHCP)", "servers": []},
]


def normalize_dns_server(addr: str) -> str:
    """Validate and canonicalize a DNS server IP (IPv4 or IPv6). Raises ValueError."""
    raw = str(addr or "").strip()
    if not raw:
        raise ValueError("adresse vide")
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError as exc:
        raise ValueError(f"IP invalide: {raw}") from exc


def normalize_dns_servers(primary: str, secondary: str | None = None) -> list[str]:
    """Build a 1–2 server list from primary (+ optional secondary). Dedupes identical addrs."""
    primary_n = normalize_dns_server(primary)
    servers = [primary_n]
    sec_raw = str(secondary or "").strip()
    if sec_raw:
        secondary_n = normalize_dns_server(sec_raw)
        if secondary_n != primary_n:
            servers.append(secondary_n)
    return servers


def _decode(data: bytes | str | None) -> str:
    if data is None:
        return ""
    if isinstance(data, str):
        return data
    if not data:
        return ""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("oem", errors="replace")


def _ps_json(script: str, timeout: int = 90) -> Any:
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        timeout=timeout,
        creationflags=_CREATE_NO_WINDOW,
    )
    out = _decode(proc.stdout).strip()
    err = _decode(proc.stderr).strip()
    if proc.returncode != 0 and not out:
        raise RuntimeError(err or f"PowerShell exit {proc.returncode}")
    if not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"raw": out, "stderr": err, "returncode": proc.returncode}


def list_presets() -> dict:
    return {"ok": True, "presets": DNS_PRESETS}


def get_current_dns() -> dict:
    script = r"""
$ErrorActionPreference='SilentlyContinue'
$rows = @(Get-DnsClientServerAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.ServerAddresses } |
  Select-Object InterfaceAlias, InterfaceIndex, @{n='servers';e={@($_.ServerAddresses) -join ', '}})
$rows | ConvertTo-Json -Compress -Depth 4
"""
    try:
        data = _ps_json(script, timeout=45)
        if data is None:
            rows: list = []
        elif isinstance(data, dict):
            rows = [data]
        else:
            rows = list(data)
        return {"ok": True, "adapters": rows}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "adapters": []}


def _parse_applied(data: Any) -> list:
    applied: list = []
    if isinstance(data, dict):
        raw = data.get("applied")
        if isinstance(raw, list):
            applied = raw
        elif raw:
            applied = [raw]
    return applied


def _apply_dhcp() -> dict:
    script = r"""
$ErrorActionPreference='Stop'
$applied = @()
Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Virtual|Hyper-V|VPN' } | ForEach-Object {
  Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses
  $applied += $_.Name
}
[pscustomobject]@{ applied = $applied } | ConvertTo-Json -Compress
"""
    data = _ps_json(script, timeout=90)
    return {"ok": True, "applied": _parse_applied(data)}


def _apply_servers(servers: list[str]) -> dict:
    quoted = ",".join(f"'{s}'" for s in servers)
    script = f"""
$ErrorActionPreference='Stop'
$servers = @({quoted})
$applied = @()
Get-NetAdapter | Where-Object {{ $_.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Virtual|Hyper-V|VPN' }} | ForEach-Object {{
  Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses $servers
  $applied += $_.Name
}}
[pscustomobject]@{{ applied = $applied; servers = ($servers -join ', ') }} | ConvertTo-Json -Compress
"""
    data = _ps_json(script, timeout=90)
    return {
        "ok": True,
        "applied": _parse_applied(data),
        "servers": list(servers),
    }


def apply_preset(preset_id: str) -> dict:
    pid = str(preset_id or "").strip().lower()
    if pid == "custom":
        return {
            "ok": False,
            "error": "utiliser set_dns_custom pour un DNS personnalisé",
        }
    preset = next((p for p in DNS_PRESETS if p["id"] == pid), None)
    if not preset:
        return {"ok": False, "error": f"preset inconnu: {preset_id}"}

    try:
        if pid == "dhcp" or not preset["servers"]:
            result = _apply_dhcp()
        else:
            result = _apply_servers(list(preset["servers"]))
        result["preset"] = preset
        result["message"] = f"DNS : {preset['name']}"
        return result
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "preset": preset}


def apply_custom(primary: str, secondary: str | None = None) -> dict:
    """Apply user-provided DNS servers (IPv4/IPv6) on Up adapters."""
    try:
        servers = normalize_dns_servers(primary, secondary)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    preset = {"id": "custom", "name": "Personnalisé", "servers": servers}
    try:
        result = _apply_servers(servers)
        result["preset"] = preset
        result["message"] = f"DNS : Personnalisé ({', '.join(servers)})"
        return result
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "preset": preset}
