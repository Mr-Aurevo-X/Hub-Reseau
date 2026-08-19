"""Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.

SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

Hub / suite update check + in-place Launch-Hub zip download/replace.
Allowlist matches Install-Easy release_client (PCCommand-Releases + legacy MrAurevoX-Launcher).
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

try:
    import msvcrt
except ImportError:  # pragma: no cover — hubs are Windows-only
    msvcrt = None  # type: ignore[assignment]

_CHUNK = 1024 * 1024
_LOCK_TIMEOUT_S = 5.0

RELEASE_REPO_DEFAULT = "Mr-Aurevo-X/PCCommand-Releases"
_ALLOWED_RELEASE_REPOS = frozenset(
    {
        RELEASE_REPO_DEFAULT,
        "Mr-Aurevo-X/MrAurevoX-Launcher",  # GitHub rename redirect
    }
)
_ALLOWED_API_HOSTS = frozenset(
    {
        "api.github.com",
        "github.com",
    }
)
_ALLOWED_DOWNLOAD_HOSTS = _ALLOWED_API_HOSTS | {
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
}

# Optional Discord / donation links (user-initiated; not GitHub updates).
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
CATALOG_ASSET = "catalog.json"

HUB_INSTALL_DIR = "PCCommand"
OPTI_INSTALL_DIR = "OptiBy-Mr-Aurevo-X"
CHANGELOG_INSTALL_DIR = "ChangeLog-Central"
_LEGACY_HUB_INSTALL_DIRS = ("MrAurevoX",)

# Hub id → Launch-Hub-*.zip on the releases channel
HUB_ASSETS: dict[str, str] = {
    "systeme": "Launch-Hub-Systeme.zip",
    "reseau": "Launch-Hub-Reseau.zip",
    "securite": "Launch-Hub-Securite.zip",
    "utilitaires": "Launch-Hub-Utilitaires.zip",
}

HUB_EXES: dict[str, str] = {
    "systeme": "Launch-Hub-Systeme.exe",
    "reseau": "Launch-Hub-Reseau.exe",
    "securite": "Launch-Hub-Securite.exe",
    "utilitaires": "Launch-Hub-Utilitaires.exe",
}

HUB_PACK_IDS: dict[str, str] = {
    "systeme": "hub-systeme",
    "reseau": "hub-reseau",
    "securite": "hub-securite",
    "utilitaires": "hub-utilitaires",
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


def resolve_release_repo(repo: str | None = None) -> str:
    r = (repo or "").strip() or RELEASE_REPO_DEFAULT
    if r not in _ALLOWED_RELEASE_REPOS:
        raise ValueError(f"release repo not allowlisted: {r!r}")
    return r


def api_latest_url(repo: str | None = None) -> str:
    return f"https://api.github.com/repos/{resolve_release_repo(repo)}/releases/latest"


def normalize_hub_id(hub_id: str) -> str:
    hub_key = (hub_id or "").strip().lower().replace("hub-", "").replace("_", "-")
    return _HUB_ALIASES.get(hub_key, hub_key)


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


def localappdata_root() -> Path:
    return Path(os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local"))


def hub_install_dir_candidates() -> list[Path]:
    """Prefer PCCommand; keep legacy MrAurevoX for existing installs."""
    root = localappdata_root()
    names = [HUB_INSTALL_DIR, *_LEGACY_HUB_INSTALL_DIRS]
    return [root / name for name in names]


def default_install_dir() -> Path:
    return hub_install_dir_candidates()[0]


def read_auto_update_setting(*search_roots: Path) -> bool:
    for root in search_roots:
        if not root:
            continue
        path = Path(root) / "user-settings.json"
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict) and "autoUpdate" in data:
            return bool(data["autoUpdate"])
    return True


def _coerce_bool(val: object, default: bool = False) -> bool:
    if isinstance(val, bool):
        return val
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return bool(val)
    s = str(val).strip().lower()
    if s in ("1", "true", "yes"):
        return True
    if s in ("0", "false", "no", ""):
        return False
    return default


def expected_asset_sha256(catalog: dict | None, name: str) -> tuple[str | None, bool]:
    hashes = (catalog or {}).get("assetHashes") if catalog else None
    if not isinstance(hashes, dict):
        return None, False
    nonempty = {str(k): str(v).strip() for k, v in hashes.items() if str(v or "").strip()}
    if not nonempty:
        return None, False
    key = str(name or "").strip()
    if key.lower() == CATALOG_ASSET.lower():
        return None, False
    raw = nonempty.get(key) or nonempty.get(key.lower()) or ""
    if raw.lower().startswith("sha256:"):
        raw = raw[7:].strip()
    return (raw or None), True


def running_from_dev_central_tree(path: Path) -> bool:
    lowered = str(Path(path).resolve()).lower().replace("/", "\\")
    return "\\dev central tree\\" in lowered


def running_from_source_tree(path: Path) -> bool:
    lowered = str(Path(path).resolve()).lower().replace("/", "\\")
    if not running_from_dev_central_tree(path):
        return False
    if "\\01_hubs\\" in lowered or "\\atelierwindows\\" in lowered:
        return True
    # Launch-Hub-*.exe rebuilt at Dev Central Tree root (dev / smoke / capture)
    if getattr(sys, "frozen", False):
        exe = Path(sys.executable).resolve()
        name = exe.name.lower()
        if name.startswith("launch-hub-") and name.endswith(".exe"):
            return exe.parent.resolve() == Path(path).resolve()
    return False


def _assert_allowed_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"non-HTTPS URL rejected: {url!r}")
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_API_HOSTS:
        raise ValueError(f"host not allowlisted: {host!r}")


def _assert_allowed_download_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"non-HTTPS URL rejected: {url!r}")
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_DOWNLOAD_HOSTS:
        raise ValueError(f"download host not allowlisted: {host!r}")


def _api_request(url: str, token: str | None = None, *, accept: str | None = None) -> bytes:
    _assert_allowed_url(url)
    headers = {
        "Accept": accept or "application/vnd.github+json",
        "User-Agent": "PC-Command-HubUpdate",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:  # nosec B310
        final = resp.geturl()
        if final and final != url:
            if accept == "application/octet-stream":
                _assert_allowed_download_url(final)
            else:
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
    """True only when remote semver is strictly greater than local."""
    return _version_tuple(remote) > _version_tuple(local)


def format_version_bracket(version: str | None) -> str:
    """Return e.g. v1.4.1 (always with leading v when numeric)."""
    return normalize_version(version) or ""


def read_local_version(*search_roots: Path, pack_id: str | None = None) -> str | None:
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
        if pack_id:
            packs = data.get("packs")
            if isinstance(packs, dict):
                stamped = str(packs.get(str(pack_id).lower()) or "").strip()
                if stamped:
                    return normalize_version(stamped) or stamped
            # Pack installed but no per-pack stamp → treat as unknown (outdated)
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


def resolve_hub_install_dir(app_dir: Path) -> Path:
    """Directory that owns Launch-Hub-*.exe (frozen: exe parent; else default install)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    ad = Path(app_dir).resolve()
    # Dev: prefer LOCALAPPDATA if a hub exe already lives there (new + legacy dirs)
    for install in hub_install_dir_candidates():
        for name in HUB_EXES.values():
            if (install / name).is_file():
                return install
    return ad


def _catalog_from_release(release: dict, token: str | None) -> dict | None:
    assets = release.get("assets") or []
    catalog_asset = None
    for a in assets:
        if str(a.get("name") or "").strip().lower() == CATALOG_ASSET.lower():
            catalog_asset = a
            break
    if not catalog_asset:
        return None
    url = catalog_asset.get("url") or catalog_asset.get("browser_download_url")
    if not url:
        return None
    if "api.github.com" in str(url) and not token:
        url = catalog_asset.get("browser_download_url")
        if not url:
            return None
    headers = {
        "Accept": "application/octet-stream",
        "User-Agent": "PC-Command-HubUpdate",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    _assert_allowed_url(str(url))
    req = urllib.request.Request(str(url), headers=headers)
    with urllib.request.urlopen(req, timeout=25) as resp:  # nosec B310
        final = resp.geturl() or str(url)
        _assert_allowed_download_url(final)
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
    hub_key = normalize_hub_id(hub_id)
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
    pack_id = HUB_PACK_IDS.get(hub_key)
    local = read_local_version(*roots, pack_id=pack_id)
    tok = token if token is not None else find_token(*roots, default_install_dir())
    auto_update = read_auto_update_setting(*roots, default_install_dir())
    from_sot = running_from_source_tree(app_dir)
    if getattr(sys, "frozen", False):
        exe_parent = Path(sys.executable).resolve().parent
        from_sot = from_sot or running_from_source_tree(exe_parent)
        from_sot = from_sot or running_from_dev_central_tree(exe_parent)

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
            "canSelfUpdate": False,
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
            "canSelfUpdate": False,
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
    update_available = bool(remote) and is_remote_newer(remote, local) and has_asset
    can_self = bool(update_available and has_asset and not from_sot)

    return {
        "ok": True,
        "error": None,
        "updateAvailable": update_available,
        "local": local,
        "remote": remote,
        "hubId": hub_key,
        "packId": HUB_PACK_IDS.get(hub_key),
        "asset": asset_name,
        "exe": HUB_EXES.get(hub_key),
        "hasAsset": has_asset,
        "tag": tag,
        "repo": resolve_release_repo(repo),
        "action": "download" if can_self else "install_easy",
        "canSelfUpdate": can_self,
        "autoUpdate": auto_update,
        "fromSourceTree": from_sot,
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


def _safe_extract(zip_path: Path, dest: Path) -> None:
    dest = dest.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            name = member.filename.replace("\\", "/")
            if not name or name.startswith("/") or name.startswith("//"):
                raise RuntimeError(f"Zip unsafe: {name}")
            if len(name) >= 2 and name[1] == ":":
                raise RuntimeError(f"Zip unsafe (drive): {name}")
            if ".." in name.split("/"):
                raise RuntimeError(f"Zip unsafe: {name}")
            if getattr(member, "is_symlink", lambda: False)():
                raise RuntimeError(f"Zip unsafe (symlink): {name}")
            mode = (member.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                raise RuntimeError(f"Zip unsafe (symlink mode): {name}")
            target = (dest / name).resolve()
            try:
                target.relative_to(dest)
            except ValueError as exc:
                raise RuntimeError(f"Zip unsafe (escape): {name}") from exc
            if name.endswith("/"):
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member, "r") as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)


def _is_locked(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        with open(path, "a+b"):
            return False
    except OSError:
        return True


def _finish_hub_update_script(
    install_dir: Path, staging: Path, exe_name: str
) -> Path:
    script = install_dir / "_finish_hub_update.cmd"
    lines = [
        "@echo off",
        "setlocal",
        f'cd /d "{install_dir}"',
        "echo Finalisation mise a jour hub...",
        "timeout /t 2 /nobreak >nul",
        f'if exist "{staging}\\{exe_name}" copy /Y "{staging}\\{exe_name}" ".\\" >nul',
        f'rmdir /S /Q "{staging}" 2>nul',
        f'del /F /Q "{script.name}" 2>nul',
        f'start "" "{exe_name}"',
        "exit /b 0",
        "",
    ]
    script.write_text("\n".join(lines), encoding="utf-8")
    return script


def _download_asset_to_file(
    asset: dict,
    token: str | None,
    dest: Path,
    *,
    catalog: dict | None = None,
    asset_name: str | None = None,
    min_size: int = 1024,
) -> None:
    """Stream an allowlisted GitHub asset to dest; hash incrementally; promote only on success."""
    url = asset.get("url") or asset.get("browser_download_url")
    if not url:
        raise RuntimeError("Asset sans URL")
    name = asset_name or str(asset.get("name") or dest.name)
    expected, require = expected_asset_sha256(catalog, name)
    if require and not expected:
        raise RuntimeError(f"SHA-256 manquant dans le catalog pour {name}")
    headers = {
        "Accept": "application/octet-stream",
        "User-Agent": "PC-Command-HubUpdate",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if "api.github.com" in str(url):
        _assert_allowed_url(str(url))
    else:
        _assert_allowed_download_url(str(url))
    req = urllib.request.Request(str(url), headers=headers)
    part = dest.with_suffix(dest.suffix + ".part")
    try:
        if part.exists():
            part.unlink()
        with urllib.request.urlopen(req, timeout=300) as resp:  # nosec B310
            final = resp.geturl() or str(url)
            if "api.github.com" in str(url) and final != url:
                _assert_allowed_download_url(final)
            elif final != url:
                _assert_allowed_download_url(final)
            hasher = hashlib.sha256()
            total = 0
            dest.parent.mkdir(parents=True, exist_ok=True)
            with part.open("wb") as out:
                while True:
                    chunk = resp.read(_CHUNK)
                    if not chunk:
                        break
                    out.write(chunk)
                    hasher.update(chunk)
                    total += len(chunk)
        if total < min_size:
            raise RuntimeError(f"Téléchargement vide ou trop petit pour {name}")
        if require and hasher.hexdigest().lower() != str(expected).lower():
            raise RuntimeError(f"SHA-256 mismatch pour {name}")
        part.replace(dest)
    except Exception:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        raise


@contextmanager
def _version_lock(install_dir: Path) -> Iterator[None]:
    """Exclusive lock around version.json writes (Windows msvcrt)."""
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


def apply_hub_update(
    hub_id: str,
    app_dir: Path,
    *,
    token: str | None = None,
    repo: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Download allowlisted Launch-Hub-*.zip and replace the local hub exe in-place."""
    hub_key = normalize_hub_id(hub_id)
    asset_name = HUB_ASSETS.get(hub_key)
    exe_name = HUB_EXES.get(hub_key)
    if not asset_name or not exe_name:
        return {"ok": False, "error": f"hub inconnu: {hub_id!r}"}

    install_dir = resolve_hub_install_dir(app_dir)
    # Refuse replacing into Dev Central Tree SoT by accident
    lowered = str(install_dir).lower().replace("/", "\\")
    for marker in ("\\dev central tree\\", "\\01_hubs\\", "\\atelierwindows\\"):
        if marker in f"\\{lowered}\\":
            return {
                "ok": True,
                "skipped": True,
                "updated": False,
                "reason": "fromSourceTree",
                "message": (
                    "Mise à jour ignorée : hub lancé depuis le dépôt source. "
                    f"Installe via Install-Easy sous %LOCALAPPDATA%\\{HUB_INSTALL_DIR}."
                ),
            }

    roots = version_search_roots(app_dir)
    if not _coerce_bool(force, False):
        auto = read_auto_update_setting(*roots, install_dir, default_install_dir())
        if not auto:
            return {
                "ok": True,
                "skipped": True,
                "updated": False,
                "reason": "autoUpdateOff",
                "message": "Mises à jour automatiques désactivées.",
            }

    tok = token if token is not None else find_token(*roots, install_dir, default_install_dir())
    if not tok:
        return {
            "ok": False,
            "error": (
                "Pas d'accès GitHub pour télécharger la mise à jour. "
                "Ouvre Install-Easy ou configure gh auth / installer.token."
            ),
            "action": "install_easy",
        }

    try:
        release = json.loads(_api_request(api_latest_url(repo), tok).decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Impossible de lire la release : {exc}"}

    assets = {str(a.get("name") or ""): a for a in (release.get("assets") or [])}
    asset = assets.get(asset_name)
    if not asset:
        return {
            "ok": False,
            "error": f"Asset manquant sur la release : {asset_name}",
            "action": "install_easy",
        }

    catalog = None
    try:
        catalog = _catalog_from_release(release, tok)
    except Exception:
        catalog = None
    pack_id = HUB_PACK_IDS.get(hub_key)
    tag = str(release.get("tag_name") or "")

    staging = install_dir / "_hub_update_staging"
    zip_path: Path | None = None
    try:
        install_dir.mkdir(parents=True, exist_ok=True)
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)

        fd, tmp_name = tempfile.mkstemp(prefix="hub-upd-", suffix=".zip")
        os.close(fd)
        zip_path = Path(tmp_name)
        _download_asset_to_file(
            asset, tok, zip_path, catalog=catalog, asset_name=asset_name, min_size=1024
        )
        _safe_extract(zip_path, staging)

        staged_exe = staging / exe_name
        if not staged_exe.is_file():
            found = list(staging.rglob(exe_name))
            if not found:
                return {
                    "ok": False,
                    "error": f"{exe_name} introuvable dans {asset_name}",
                }
            staged_exe = found[0]
            if staged_exe.parent != staging:
                shutil.copy2(staged_exe, staging / exe_name)

        target_exe = install_dir / exe_name
        if not _is_locked(target_exe):
            try:
                shutil.copy2(staging / exe_name, target_exe)
                write_pack_stamp(install_dir, pack_id, tag, catalog)
                shutil.rmtree(staging, ignore_errors=True)
                return {
                    "ok": True,
                    "restartRequired": False,
                    "installDir": str(install_dir),
                    "exe": exe_name,
                    "tag": tag,
                    "message": "Mise à jour appliquée. Relance le hub pour activer.",
                }
            except OSError:
                pass

        write_pack_stamp(install_dir, pack_id, tag, catalog)
        script = _finish_hub_update_script(install_dir, staging, exe_name)
        try:
            subprocess.Popen(
                ["cmd.exe", "/c", str(script)],
                cwd=str(install_dir),
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
                | getattr(subprocess, "DETACHED_PROCESS", 0x00000008),
                close_fds=True,
            )
        except OSError as exc:
            return {"ok": False, "error": f"Impossible de lancer le script de remplacement : {exc}"}

        return {
            "ok": True,
            "restartRequired": True,
            "installDir": str(install_dir),
            "exe": exe_name,
            "finishScript": str(script),
            "tag": tag,
            "message": "Mise à jour téléchargée — le hub va redémarrer.",
        }
    except Exception as exc:  # noqa: BLE001
        shutil.rmtree(staging, ignore_errors=True)
        return {"ok": False, "error": str(exc)}
    finally:
        if zip_path is not None:
            try:
                zip_path.unlink(missing_ok=True)
            except OSError:
                pass
            part = zip_path.with_suffix(zip_path.suffix + ".part")
            try:
                part.unlink(missing_ok=True)
            except OSError:
                pass
