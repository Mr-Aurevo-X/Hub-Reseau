"""Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.

SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

Local suite version for HWND titles, allowlisted support URLs,
and a read-only GitHub Latest check (notification + browser link, no download).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
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

HUB_GITHUB_REPOS: dict[str, str] = {
    "systeme": "Mr-Aurevo-X/Hub-Systeme",
    "reseau": "Mr-Aurevo-X/Hub-Reseau",
    "securite": "Mr-Aurevo-X/Hub-Securite",
    "utilitaires": "Mr-Aurevo-X/Hub-Utilitaires",
}

HUB_ZIP_ASSETS: dict[str, str] = {
    "systeme": "Launch-Hub-Systeme.zip",
    "reseau": "Launch-Hub-Reseau.zip",
    "securite": "Launch-Hub-Securite.zip",
    "utilitaires": "Launch-Hub-Utilitaires.zip",
}

_HUB_ALIASES = {
    "system": "systeme",
    "systeme": "systeme",
    "network": "reseau",
    "reseau": "reseau",
    "security": "securite",
    "securite": "securite",
    "utilities": "utilitaires",
    "utilitaires": "utilitaires",
}

_ALLOWED_API_HOSTS = frozenset({"api.github.com"})
_ALLOWED_RELEASE_HOSTS = frozenset({"github.com", "www.github.com"})
_ALLOWED_RELEASE_ORGS = frozenset({"mr-aurevo-x"})


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


def normalize_hub_id(hub_id: str) -> str:
    hub_key = (hub_id or "").strip().lower().replace("hub-", "").replace("_", "-")
    return _HUB_ALIASES.get(hub_key, hub_key)


def _version_tuple(raw: str | None) -> tuple[int, ...]:
    s = normalize_version(raw)
    if s.lower().startswith("v"):
        s = s[1:]
    parts: list[int] = []
    for piece in s.replace("-", ".").split("."):
        if not piece:
            continue
        digits = ""
        for ch in piece:
            if ch.isdigit():
                digits += ch
            else:
                break
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts) if parts else (0,)


def is_remote_newer(remote: str | None, local: str | None) -> bool:
    return _version_tuple(remote) > _version_tuple(local)


def _assert_api_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"non-HTTPS URL rejected: {url!r}")
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_API_HOSTS:
        raise ValueError(f"host not allowlisted: {host!r}")


def _api_latest_release(repo: str) -> dict[str, Any]:
    if repo not in set(HUB_GITHUB_REPOS.values()):
        raise ValueError(f"release repo not allowlisted: {repo!r}")
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    _assert_api_url(url)
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "PC-Command-HubReleaseNotice",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=8) as resp:  # nosec B310
        return json.loads(resp.read().decode("utf-8"))


def _release_payload(
    repo: str, release: dict[str, Any], asset_name: str | None
) -> dict[str, Any]:
    tag = str(release.get("tag_name") or "").strip()
    html = str(release.get("html_url") or "").strip()
    if not html:
        html = f"https://github.com/{repo}/releases/latest"
    names = [str(a.get("name") or "") for a in (release.get("assets") or [])]
    has_zip = bool(asset_name and asset_name in names)
    return {
        "repo": repo,
        "tag": tag,
        "remote": normalize_version(tag) or tag,
        "releaseUrl": html,
        "hasZip": has_zip,
        "asset": asset_name,
    }


def check_hub_release(hub_id: str, app_dir: Path) -> dict[str, Any]:
    """Compare local version.json to GitHub Latest on this hub's own repo. Never downloads."""
    hub_key = normalize_hub_id(hub_id)
    local = get_local_suite_version(app_dir)
    zip_name = HUB_ZIP_ASSETS.get(hub_key)
    hub_repo = HUB_GITHUB_REPOS.get(hub_key)
    if not hub_repo:
        return {
            "ok": False,
            "updateAvailable": False,
            "error": f"hub inconnu: {hub_id!r}",
            "local": local,
        }

    last_err = None
    try:
        raw = _api_latest_release(hub_repo)
        chosen = _release_payload(hub_repo, raw, zip_name)
        if not chosen.get("remote"):
            chosen = None
    except urllib.error.HTTPError as exc:
        last_err = f"HTTP {exc.code}"
        chosen = None
    except Exception as exc:  # noqa: BLE001
        last_err = str(exc)
        chosen = None

    if not chosen:
        return {
            "ok": False,
            "updateAvailable": False,
            "error": last_err or "no release",
            "local": local,
            "hubId": hub_key,
        }

    remote = str(chosen.get("remote") or "")
    available = bool(remote) and is_remote_newer(remote, local)
    return {
        "ok": True,
        "error": None,
        "updateAvailable": available,
        "local": local,
        "remote": remote,
        "hubId": hub_key,
        "repo": chosen.get("repo"),
        "asset": chosen.get("asset"),
        "hasZip": chosen.get("hasZip"),
        "releaseUrl": chosen.get("releaseUrl"),
        "message": (
            f"Nouvelle version {remote} (installée : {local or '?'})"
            if available
            else None
        ),
    }


def open_release_url(url: str) -> dict[str, Any]:
    """Open an allowlisted Mr-Aurevo-X GitHub release page in the default browser."""
    raw = (url or "").strip()
    parsed = urllib.parse.urlparse(raw)
    host = (parsed.hostname or "").lower()
    parts = [p for p in (parsed.path or "").split("/") if p]
    org = (parts[0].lower() if parts else "")
    if (
        parsed.scheme != "https"
        or host not in _ALLOWED_RELEASE_HOSTS
        or org not in _ALLOWED_RELEASE_ORGS
        or "/releases" not in (parsed.path or "").lower()
    ):
        return {"ok": False, "error": "release URL rejected"}
    try:
        os.startfile(raw)  # type: ignore[attr-defined]
        return {"ok": True, "url": raw}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "url": raw}


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
