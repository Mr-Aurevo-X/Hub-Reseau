# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""WifiKey logic (ported into Hub-Reseau)."""
from __future__ import annotations

import ctypes
import subprocess


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _decode_cli(data: bytes | str | None) -> str:
    if data is None:
        return ""
    if isinstance(data, str):
        return data
    if not data:
        return ""
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16", errors="replace")
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig", errors="replace")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("oem", errors="replace")


def normalize_profile(profile: str) -> str | None:
    name = (profile or "").strip()
    if not name or any(c in name for c in ';|&<>`"'):
        return None
    return name


def list_profiles() -> dict:
    try:
        proc = subprocess.run(
            ["netsh", "wlan", "show", "profiles"],
            capture_output=True,
            timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = _decode_cli(proc.stdout)
        names: list[str] = []
        for line in out.splitlines():
            if ":" in line and ("Profil" in line or "Profile" in line):
                name = line.split(":", 1)[1].strip()
                if name:
                    names.append(name)
        return {
            "ok": True,
            "profiles": [{"name": n} for n in names],
            "count": len(names),
            "admin": is_admin(),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def get_key(profile: str) -> dict:
    name = normalize_profile(profile)
    if not name:
        return {"ok": False, "error": "Profil invalide"}
    try:
        proc = subprocess.run(
            ["netsh", "wlan", "show", "profile", f"name={name}", "key=clear"],
            capture_output=True,
            timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = _decode_cli(proc.stdout)
        key = ""
        for line in out.splitlines():
            low = line.lower()
            if "key content" in low or "contenu de la clé" in low or "contenu de la cle" in low:
                if ":" in line:
                    key = line.split(":", 1)[1].strip()
        return {"ok": True, "profile": name, "key": key, "admin": is_admin()}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
