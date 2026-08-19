"""Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.

SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

Local suite version for HWND titles + allowlisted support URLs.
In-app GitHub update check / zip replace was removed (no auto-update).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

try:
    import msvcrt
except ImportError:  # pragma: no cover — hubs are Windows-only
    msvcrt = None  # type: ignore[assignment]

_LOCK_TIMEOUT_S = 5.0

SUPPORT_URLS: dict[str, str] = {
    "discord": "https://discord.com/users/406891052516114442",
    "paypal": "https://www.paypal.com/paypalme/aurevo1",
    "revolut": "https://revolut.me/mr_aurevo_x",
}
_ALLOWED_SUPPORT_HOSTS = frozenset(
    {
        "discord.com",
        "www.paypal.com",
        "paypal.com",
        "revolut.me",
    }
)

HUB_INSTALL_DIR = "PCCommand"
_LEGACY_HUB_INSTALL_DIRS = ("MrAurevoX",)

HUB_PACK_IDS: dict[str, str] = {
    "systeme": "hub-systeme",
    "reseau": "hub-reseau",
    "securite": "hub-securite",
    "utilitaires": "hub-utilitaires",
}


def localappdata_root() -> Path:
    return Path(os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local"))


def hub_install_dir_candidates() -> list[Path]:
    root = localappdata_root()
    names = [HUB_INSTALL_DIR, *_LEGACY_HUB_INSTALL_DIRS]
    return [root / name for name in names]


def default_install_dir() -> Path:
    return hub_install_dir_candidates()[0]


def normalize_version(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    if s.lower().startswith("v") and len(s) > 1 and s[1].isdigit():
        return s
    if s and s[0].isdigit():
        return f"v{s}"
    return s


def format_version_bracket(version: str | None) -> str:
    return normalize_version(version) or ""


def read_local_version(*search_roots: Path, pack_id: str | None = None) -> str | None:
    for root in search_roots:
        if not root:
            continue
        path = Path(root) / "version.json"
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if pack_id:
            packs = data.get("packs")
            if isinstance(packs, dict):
                stamped = str(packs.get(str(pack_id).lower()) or "").strip()
                if stamped:
                    return normalize_version(stamped) or stamped
            continue
        tag = str(
            data.get("suiteVersion") or data.get("tag") or data.get("version") or ""
        ).strip()
        if tag:
            return normalize_version(tag) or tag
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", ""))
        if meipass.is_dir():
            path = meipass / "version.json"
            if path.is_file():
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    tag = str(
                        data.get("suiteVersion")
                        or data.get("tag")
                        or data.get("version")
                        or ""
                    ).strip()
                    if tag:
                        return normalize_version(tag) or tag
                except (OSError, json.JSONDecodeError):
                    pass
    return None


def version_search_roots(app_dir: Path) -> list[Path]:
    roots: list[Path] = []
    install = default_install_dir()
    if install not in roots:
        roots.append(install)
    ad = Path(app_dir)
    if ad not in roots:
        roots.append(ad)
    if getattr(sys, "frozen", False):
        exe_parent = Path(sys.executable).resolve().parent
        if exe_parent not in roots:
            roots.insert(0, exe_parent)
    return roots


def get_local_suite_version(app_dir: Path) -> str | None:
    return read_local_version(*version_search_roots(app_dir))


def open_support_url(kind: str) -> dict[str, Any]:
    """Open Discord / PayPal / Revolut in the default browser (allowlisted)."""
    key = (kind or "").strip().lower()
    url = SUPPORT_URLS.get(key)
    if not url:
        return {"ok": False, "error": f"unknown support kind: {kind!r}"}
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in _ALLOWED_SUPPORT_HOSTS:
        return {"ok": False, "error": "support URL rejected"}
    try:
        os.startfile(url)  # type: ignore[attr-defined]
        return {"ok": True, "kind": key, "url": url}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "url": url}


def title_with_version(base_title: str, version: str | None, *, module: str | None = None) -> str:
    """Build HWND / tool-chrome title.

    Accueil: ``PC Command | System [v1.4.1]``
    Module:  ``PC Command | System [WinCleaner]`` (module wins over version)
    """
    base = (base_title or "").strip() or "PC Command"
    mod = (module or "").strip()
    ver = format_version_bracket(version)
    if mod:
        return f"{base} [{mod}]"
    if ver:
        return f"{base} [{ver}]"
    return base


@contextmanager
def _version_lock(install_dir: Path) -> Iterator[None]:
    Path(install_dir).mkdir(parents=True, exist_ok=True)
    lock_path = Path(install_dir) / ".version.lock"
    fh = lock_path.open("a+b")
    if fh.seek(0, 2) == 0:
        fh.write(b"\0")
        fh.flush()
    locked = False
    deadline = time.monotonic() + _LOCK_TIMEOUT_S
    try:
        if msvcrt is None:
            yield
            return
        while True:
            try:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
                locked = True
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("Timeout verrou version.json")
                time.sleep(0.05)
        yield
    finally:
        if locked and msvcrt is not None:
            try:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
        fh.close()


def write_pack_stamp(
    install_dir: Path,
    pack_id: str | None,
    tag: str,
    catalog: dict | None = None,
) -> None:
    path = Path(install_dir) / "version.json"
    with _version_lock(install_dir):
        existing: dict = {}
        if path.is_file():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    existing = loaded
            except (OSError, json.JSONDecodeError):
                existing = {}
        suite = str((catalog or {}).get("suiteVersion") or tag or "").strip() or tag
        payload = dict(existing)
        payload["tag"] = tag
        payload["suiteVersion"] = suite
        packs = payload.get("packs")
        if not isinstance(packs, dict):
            packs = {}
        else:
            packs = dict(packs)
        if pack_id:
            packs[str(pack_id).lower()] = suite
        payload["packs"] = packs
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
