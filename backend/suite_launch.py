"""Launch sibling Suite apps (Lancer.cmd / python host preferred; exe optional)."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

DEFAULT_ACCENT = "#e03545"
ENV_ACCENT = "MRAUREVOX_ACCENT"
ENV_LANG = "MRAUREVOX_LANG"
LAUNCHER_MARK = "Mr-Aurevo-X-LAUNCHER-ID: Mr-Aurevo-X"
_APP_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\- ]{0,63}$")


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def resolve_suite_accent(default: str = DEFAULT_ACCENT) -> str:
    env = (os.environ.get(ENV_ACCENT) or "").strip()
    if env.startswith("#") and len(env) in (4, 7):
        return env
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "user-settings.json"
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            accent = str((loaded or {}).get("accent") or "").strip()
            if accent.startswith("#") and len(accent) in (4, 7):
                return accent
        except Exception:
            pass
    return default


def resolve_suite_language(default: str = "fr") -> str:
    env = (os.environ.get(ENV_LANG) or "").strip().lower()
    if env in ("fr", "en"):
        return env
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "user-settings.json"
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            lang = str((loaded or {}).get("language") or "").strip().lower()
            if lang in ("fr", "en"):
                return lang
        except Exception:
            pass
    return default if default in ("fr", "en") else "fr"


def _suite_candidate_roots() -> list[Path]:
    roots: list[Path] = []
    try:
        app_parent = app_dir().resolve().parent
        roots.append(app_parent)
        # Hubs live under Atelier; Lab tools are siblings under Dev Central Tree.
        tree = app_parent.parent
        for rel in ("L'Atelier Windows", "Lab", "AtelierWindows"):
            cand = tree / rel
            if cand.is_dir():
                roots.append(cand.resolve())
    except OSError:
        pass
    for key in ("MRAUREVOX_SUITE_ROOT", "MRAUREVOX_DEV_ROOT", "MRAUREVOX_APPS_ROOT"):
        raw = (os.environ.get(key) or "").strip()
        if raw:
            try:
                roots.append(Path(raw).expanduser().resolve())
            except OSError:
                pass
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    for cand in (Path(local) / "Mr-Aurevo-X" / "Apps", Path(local) / "Mr-Aurevo-X"):
        if cand.is_dir():
            try:
                roots.append(cand.resolve())
            except OSError:
                pass
    seen: set[str] = set()
    out: list[Path] = []
    for r in roots:
        k = str(r).lower()
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def _safe_app_name(name: str) -> str | None:
    app_name = str(name or "").strip()
    if not app_name or not _APP_NAME_RE.fullmatch(app_name):
        return None
    if ".." in app_name or app_name in {".", ".."}:
        return None
    if any(c in app_name for c in '\\/:*?"<>|'):
        return None
    return app_name


def _app_folder(root: Path, app_name: str) -> Path | None:
    try:
        root_r = root.resolve()
        folder = (root_r / app_name).resolve()
        folder.relative_to(root_r)
    except (OSError, ValueError):
        return None
    if not folder.is_dir():
        return None
    return folder


def _cmd_has_launcher_mark(path: Path) -> bool:
    try:
        raw = path.read_bytes()[:4096]
    except OSError:
        return False
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        return False
    return LAUNCHER_MARK in text


def resolve_suite_app_cmd(name: str) -> Path | None:
    app_name = _safe_app_name(name)
    if not app_name:
        return None
    candidates = (
        "Lancer.cmd",
        f"Lancer {app_name}.cmd",
        f"Lancer.{app_name}.cmd",
        f"{app_name}.cmd",
    )
    unmarked: list[Path] = []
    for root in _suite_candidate_roots():
        folder = _app_folder(root, app_name)
        if folder is None:
            continue
        for fname in candidates:
            p = folder / fname
            if not p.is_file():
                continue
            if _cmd_has_launcher_mark(p):
                return p
            unmarked.append(p)
        # any Lancer*.cmd with mark
        for p in sorted(folder.glob("Lancer*.cmd")):
            if not p.is_file():
                continue
            if _cmd_has_launcher_mark(p):
                return p
            unmarked.append(p)
    # Lab / legacy launchers often omit the Suite mark — still launch Lancer.cmd.
    return unmarked[0] if unmarked else None


def resolve_suite_app_python_host(name: str) -> Path | None:
    app_name = _safe_app_name(name)
    if not app_name:
        return None
    slug = app_name.lower().replace("-", "_").replace(" ", "_")
    for root in _suite_candidate_roots():
        folder = _app_folder(root, app_name)
        if folder is None:
            continue
        for rel in (
            Path("host") / "host.py",
            Path("host") / f"{slug}_host.py",
            Path(f"{slug}_host.py"),
            Path("host.py"),
        ):
            p = folder / rel
            if p.is_file():
                return p
    return None


def resolve_suite_app_exe(name: str) -> Path | None:
    """Legacy fallback — still jails app name; prefer cmd/host via launch_suite_app."""
    app_name = _safe_app_name(name)
    if not app_name:
        return None
    for root in _suite_candidate_roots():
        folder = _app_folder(root, app_name)
        if folder is None:
            continue
        preferred = folder / f"{app_name}.exe"
        if preferred.is_file():
            return preferred
        for p in sorted(folder.glob("*.exe")):
            low = p.name.lower()
            if p.is_file() and "uninstall" not in low and "setup" not in low:
                return p
    return None


def launch_suite_app(name: str) -> dict:
    child_env = dict(os.environ)
    child_env[ENV_ACCENT] = (os.environ.get(ENV_ACCENT) or "").strip() or resolve_suite_accent()
    child_env[ENV_LANG] = (os.environ.get(ENV_LANG) or "").strip() or resolve_suite_language()

    cmd = resolve_suite_app_cmd(name)
    if cmd is not None:
        try:
            subprocess.Popen(
                ["cmd.exe", "/c", str(cmd)],
                cwd=str(cmd.parent),
                shell=False,
                env=child_env,
            )
            return {"ok": True, "path": str(cmd)}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    host_py = resolve_suite_app_python_host(name)
    if host_py is not None:
        try:
            cwd = host_py.parent.parent if host_py.parent.name.lower() == "host" else host_py.parent
            subprocess.Popen(
                [sys.executable, str(host_py)],
                cwd=str(cwd),
                shell=False,
                env=child_env,
            )
            return {"ok": True, "path": str(host_py)}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    return {"ok": False, "error": f"Application introuvable ou lanceur non marque: {name}"}
