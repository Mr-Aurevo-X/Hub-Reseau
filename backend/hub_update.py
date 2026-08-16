"""Lightweight hub / suite update check against MrAurevoX-Launcher releases.

Intentional scope: version compare + CTA (Install-Easy / release page).
Does not download or extract zips into hubs (keeps hub surface small).
Allowlist matches Install-Easy release_client.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

RELEASE_REPO_DEFAULT = "Mr-Aurevo-X/MrAurevoX-Launcher"
_ALLOWED_RELEASE_REPOS = frozenset({RELEASE_REPO_DEFAULT})
_ALLOWED_API_HOSTS = frozenset(
    {
        "api.github.com",
        "github.com",
    }
)
CATALOG_ASSET = "catalog.json"

# Hub id → Launch-Hub-*.zip on the releases channel
HUB_ASSETS: dict[str, str] = {
    "systeme": "Launch-Hub-Systeme.zip",
    "reseau": "Launch-Hub-Reseau.zip",
    "securite": "Launch-Hub-Securite.zip",
    "dev": "Launch-Hub-Dev.zip",
    "utilitaires": "Launch-Hub-Utilitaires.zip",
}

HUB_PACK_IDS: dict[str, str] = {
    "systeme": "hub-systeme",
    "reseau": "hub-reseau",
    "securite": "hub-securite",
    "dev": "hub-dev",
    "utilitaires": "hub-utilitaires",
}


def resolve_release_repo(repo: str | None = None) -> str:
    r = (repo or "").strip() or RELEASE_REPO_DEFAULT
    if r not in _ALLOWED_RELEASE_REPOS:
        raise ValueError(f"release repo not allowlisted: {r!r}")
    return r


def api_latest_url(repo: str | None = None) -> str:
    return f"https://api.github.com/repos/{resolve_release_repo(repo)}/releases/latest"


def find_token(*search_roots: Path) -> str | None:
    env = (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip()
    if env:
        return env
    try:
        proc = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
        if proc.returncode == 0:
            tok = (proc.stdout or "").strip()
            if tok:
                return tok
    except (OSError, subprocess.TimeoutExpired):
        pass
    for root in search_roots:
        if not root:
            continue
        for name in ("installer.token", ".installer.token"):
            p = Path(root) / name
            if p.is_file():
                try:
                    tok = p.read_text(encoding="utf-8").strip()
                except OSError:
                    continue
                if tok:
                    return tok
    return None


def default_install_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(local) / "MrAurevoX"


def _assert_allowed_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"non-HTTPS URL rejected: {url!r}")
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_API_HOSTS:
        raise ValueError(f"host not allowlisted: {host!r}")


def _api_request(url: str, token: str | None = None) -> bytes:
    _assert_allowed_url(url)
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "PC-Command-HubUpdate",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=25) as resp:
        final = resp.geturl()
        if final and final != url:
            _assert_allowed_url(final)
        return resp.read()


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
    """Return e.g. v1.4.1 (always with leading v when numeric)."""
    return normalize_version(version) or ""


def read_local_version(*search_roots: Path) -> str | None:
    """Read suite/tag from version.json under the first matching root."""
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
        tag = str(
            data.get("suiteVersion") or data.get("tag") or data.get("version") or ""
        ).strip()
        if tag:
            return normalize_version(tag) or tag
    # Frozen: also try _MEIPASS
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
    """Prefer install dir version.json, then app dir (dev / bundled)."""
    roots: list[Path] = []
    install = default_install_dir()
    if install not in roots:
        roots.append(install)
    ad = Path(app_dir)
    if ad not in roots:
        roots.append(ad)
    # Parent of frozen exe is usually the install dir already
    if getattr(sys, "frozen", False):
        exe_parent = Path(sys.executable).resolve().parent
        if exe_parent not in roots:
            roots.insert(0, exe_parent)
    return roots


def get_local_suite_version(app_dir: Path) -> str | None:
    return read_local_version(*version_search_roots(app_dir))


def _catalog_from_release(release: dict, token: str | None) -> dict | None:
    assets = release.get("assets") or []
    catalog_asset = None
    for a in assets:
        if str(a.get("name") or "").strip().lower() == CATALOG_ASSET.lower():
            catalog_asset = a
            break
    if not catalog_asset:
        return None
    # Prefer API asset URL (needs token for private); fall back to browser URL
    url = catalog_asset.get("url") or catalog_asset.get("browser_download_url")
    if not url:
        return None
    if "api.github.com" in str(url) and not token:
        # Private asset API needs auth; try browser_download_url if public
        url = catalog_asset.get("browser_download_url")
        if not url:
            return None
    headers = {
        "Accept": "application/octet-stream",
        "User-Agent": "PC-Command-HubUpdate",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["Accept"] = "application/octet-stream"
    _assert_allowed_url(str(url))
    # browser_download may redirect to objects.githubusercontent.com — allow via follow
    # but only start from allowlisted hosts; urllib follows redirects.
    # Expand allowlist check on final URL after download via opener that validates.
    req = urllib.request.Request(str(url), headers=headers)
    with urllib.request.urlopen(req, timeout=25) as resp:
        final = resp.geturl() or str(url)
        parsed = urllib.parse.urlparse(final)
        host = (parsed.hostname or "").lower()
        allowed_dl = _ALLOWED_API_HOSTS | {
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
        }
        if parsed.scheme != "https" or host not in allowed_dl:
            raise ValueError(f"download host not allowlisted: {host!r}")
        raw = resp.read()
    return json.loads(raw.decode("utf-8"))


def check_hub_update(
    hub_id: str,
    app_dir: Path,
    *,
    token: str | None = None,
    repo: str | None = None,
) -> dict[str, Any]:
    """Compare local suiteVersion to latest release catalog for this hub's zip."""
    hub_key = (hub_id or "").strip().lower().replace("hub-", "").replace("_", "-")
    # Accept "systeme" / "Hub-Systeme" / "hub-systeme"
    aliases = {
        "system": "systeme",
        "systeme": "systeme",
        "network": "reseau",
        "reseau": "reseau",
        "security": "securite",
        "securite": "securite",
        "development": "dev",
        "dev": "dev",
        "utilities": "utilitaires",
        "utilitaires": "utilitaires",
    }
    hub_key = aliases.get(hub_key, hub_key)
    asset_name = HUB_ASSETS.get(hub_key)
    if not asset_name:
        return {
            "ok": False,
            "error": f"hub inconnu: {hub_id!r}",
            "updateAvailable": False,
            "local": get_local_suite_version(app_dir),
            "remote": None,
        }

    roots = version_search_roots(app_dir)
    local = read_local_version(*roots)
    tok = token if token is not None else find_token(*roots, default_install_dir())

    try:
        release = json.loads(_api_request(api_latest_url(repo), tok).decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return {
            "ok": False,
            "error": f"HTTP {exc.code}",
            "updateAvailable": False,
            "local": local,
            "remote": None,
            "needsAuth": exc.code in (401, 403, 404),
            "hubId": hub_key,
            "asset": asset_name,
            "action": "install_easy",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": str(exc),
            "updateAvailable": False,
            "local": local,
            "remote": None,
            "hubId": hub_key,
            "asset": asset_name,
            "action": "install_easy",
        }

    tag = str(release.get("tag_name") or "").strip()
    remote = normalize_version(tag) or tag
    catalog = None
    try:
        catalog = _catalog_from_release(release, tok)
        if catalog:
            remote = normalize_version(
                str(catalog.get("suiteVersion") or tag).strip()
            ) or remote
    except Exception:
        catalog = None

    assets = {str(a.get("name") or ""): a for a in (release.get("assets") or [])}
    has_asset = asset_name in assets
    update_available = bool(remote) and (local or "") != remote and has_asset

    return {
        "ok": True,
        "error": None,
        "updateAvailable": update_available,
        "local": local,
        "remote": remote,
        "hubId": hub_key,
        "packId": HUB_PACK_IDS.get(hub_key),
        "asset": asset_name,
        "hasAsset": has_asset,
        "tag": tag,
        "repo": resolve_release_repo(repo),
        "action": "install_easy",
        "releaseUrl": (
            f"https://github.com/{resolve_release_repo(repo)}/releases/latest"
        ),
        "message": (
            f"Mise à jour disponible : {local or '?'} → {remote}"
            if update_available
            else None
        ),
    }


def find_install_easy_exe(*search_roots: Path) -> Path | None:
    names = ("InstallEasy.exe", "Install-Easy.exe")
    candidates: list[Path] = []
    for root in search_roots:
        if not root:
            continue
        r = Path(root)
        for n in names:
            candidates.append(r / n)
            candidates.append(r / "Install-Easy-Private" / n)
    # Common ship locations
    local = default_install_dir()
    for n in names:
        candidates.append(local / n)
    desk = Path.home() / "Desktop"
    for n in names:
        candidates.append(desk / n)
    for c in candidates:
        if c.is_file():
            return c
    return None


def open_path(path: Path) -> dict[str, Any]:
    try:
        os.startfile(str(path))  # type: ignore[attr-defined]
        return {"ok": True, "path": str(path)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "path": str(path)}


def open_url(url: str) -> dict[str, Any]:
    try:
        _assert_allowed_url(url)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    try:
        os.startfile(url)  # type: ignore[attr-defined]
        return {"ok": True, "url": url}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "url": url}


def open_update_action(
    app_dir: Path,
    *,
    release_url: str | None = None,
) -> dict[str, Any]:
    """Prefer launching Install-Easy; else open the latest release page."""
    ie = find_install_easy_exe(Path(app_dir), default_install_dir())
    if ie:
        return {**open_path(ie), "action": "install_easy", "path": str(ie)}
    url = (release_url or "").strip() or (
        f"https://github.com/{RELEASE_REPO_DEFAULT}/releases/latest"
    )
    return {**open_url(url), "action": "release_page", "url": url}


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
