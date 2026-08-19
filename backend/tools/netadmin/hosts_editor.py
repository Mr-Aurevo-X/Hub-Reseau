# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""HostsEditor logic — system hosts file + local profiles + DNS helpers."""
from __future__ import annotations

import ctypes
import ipaddress
import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

from security import sanitize_domains

HOSTS_PATH = Path(r"C:\Windows\System32\drivers\etc\hosts")
_SAFE_PROFILE = re.compile(r"^[A-Za-z0-9._\- ]{1,64}$")


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _local_appdata() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(local) / "Mr-Aurevo-X"


def backups_dir() -> Path:
    d = _local_appdata() / "hosts-backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def profiles_dir() -> Path:
    d = _local_appdata() / "hosts-profiles"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _profile_path(name: str) -> Path | None:
    name = (name or "").strip()
    if not _SAFE_PROFILE.match(name):
        return None
    return profiles_dir() / f"{name}.hosts"


def hosts_path() -> dict:
    return {"ok": True, "path": str(HOSTS_PATH)}


def read_hosts() -> dict:
    try:
        text = HOSTS_PATH.read_text(encoding="utf-8", errors="replace")
        return {"ok": True, "text": text, "path": str(HOSTS_PATH)}
    except PermissionError:
        return {
            "ok": False,
            "error": "Access denied — lancez NetAdmin en administrateur pour lire le hosts.",
            "needAdmin": True,
        }
    except OSError as exc:
        msg = str(exc)
        if "denied" in msg.lower() or getattr(exc, "winerror", None) == 5:
            return {"ok": False, "error": msg, "needAdmin": True}
        return {"ok": False, "error": msg}


def _sanitize_hosts_text(text: str) -> tuple[str | None, str]:
    """Validate hosts entries while preserving comments and formatting."""
    if len(text.encode("utf-8", errors="replace")) > 1024 * 1024:
        return None, "Fichier hosts trop volumineux"
    for line_no, line in enumerate(text.splitlines(), 1):
        content = line.split("#", 1)[0].strip()
        if not content:
            continue
        fields = content.split()
        if len(fields) < 2:
            return None, f"Ligne {line_no}: adresse et domaine requis"
        try:
            address = ipaddress.ip_address(fields[0])
        except ValueError:
            return None, f"Ligne {line_no}: adresse IP invalide"
        if len(fields) > 51:
            return None, f"Ligne {line_no}: trop de domaines"
        for domain in fields[1:]:
            normalized = domain.strip().lower().rstrip(".")
            if normalized == "localhost" and address.is_loopback:
                continue
            accepted, rejected = sanitize_domains([domain], max_count=1)
            if not accepted:
                reason = rejected[0] if rejected else "domaine invalide"
                return None, f"Ligne {line_no}: {reason}"
    return text, ""


def write_hosts(text: str) -> dict:
    text = text if isinstance(text, str) else str(text or "")
    text, error = _sanitize_hosts_text(text)
    if text is None:
        return {"ok": False, "error": error}
    try:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = backups_dir() / f"hosts-{stamp}.bak"
        if HOSTS_PATH.is_file():
            backup.write_bytes(HOSTS_PATH.read_bytes())
        HOSTS_PATH.write_text(text, encoding="utf-8", newline="\n")
        return {"ok": True, "backup": str(backup), "path": str(HOSTS_PATH)}
    except PermissionError:
        return {
            "ok": False,
            "error": "Access denied — l'écriture du hosts nécessite des droits administrateur.",
            "needAdmin": True,
        }
    except OSError as exc:
        msg = str(exc)
        if "denied" in msg.lower() or getattr(exc, "winerror", None) == 5:
            return {
                "ok": False,
                "error": "Access denied — l'écriture du hosts nécessite des droits administrateur.",
                "needAdmin": True,
            }
        return {"ok": False, "error": msg}


def list_profiles() -> dict:
    names: list[str] = []
    for p in sorted(profiles_dir().glob("*.hosts")):
        names.append(p.stem)
    return {"ok": True, "profiles": names, "dir": str(profiles_dir())}


def save_profile(name: str, text: str) -> dict:
    path = _profile_path(name)
    if path is None:
        return {"ok": False, "error": "Nom de profil invalide (lettres, chiffres, . _ - espace, max 64)."}
    try:
        path.write_text(text if isinstance(text, str) else str(text or ""), encoding="utf-8")
        return {"ok": True, "name": path.stem, "path": str(path)}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}


def load_profile(name: str) -> dict:
    path = _profile_path(name)
    if path is None:
        return {"ok": False, "error": "Nom de profil invalide"}
    if not path.is_file():
        return {"ok": False, "error": "Profil introuvable"}
    try:
        return {"ok": True, "name": path.stem, "text": path.read_text(encoding="utf-8", errors="replace")}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}


def flush_dns() -> dict:
    try:
        proc = subprocess.run(
            ["ipconfig", "/flushdns"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
        return {
            "ok": proc.returncode == 0,
            "output": out,
            "returncode": proc.returncode,
            "admin": is_admin(),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def resolve_host(hostname: str) -> dict:
    try:
        accepted, rejected = sanitize_domains([hostname], max_count=1)
        if not accepted:
            return {"ok": False, "error": rejected[0] if rejected else "Hostname invalide"}
        host = accepted[0]
        script = f"""
$ErrorActionPreference = 'Stop'
try {{
  $r = Resolve-DnsName -Name '{host.replace("'", "''")}' -ErrorAction Stop |
    Select-Object Name, Type, TTL, IPAddress, NameHost
  $r | ConvertTo-Json -Compress -Depth 4
}} catch {{
  @{{ error = $_.Exception.Message }} | ConvertTo-Json -Compress
}}
"""
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = (proc.stdout or "").strip()
        if not out:
            err = (proc.stderr or "").strip()
            return {"ok": False, "error": err or f"PowerShell exit {proc.returncode}"}
        try:
            data = json.loads(out)
        except json.JSONDecodeError:
            return {"ok": False, "error": out}
        if isinstance(data, dict) and data.get("error"):
            return {"ok": False, "error": data["error"]}
        if data is None:
            rows: list = []
        elif isinstance(data, dict):
            rows = [data]
        else:
            rows = list(data)
        return {"ok": True, "hostname": host, "records": rows, "count": len(rows)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
