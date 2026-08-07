# Shared security helpers for Suite tools (ASCII module text applied per-app).
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import shlex
import time
from pathlib import Path
from typing import Any

# Uninstall binaries we refuse to launch via UninstX
_BLOCKED_BASENAMES = {
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "wscript.exe",
    "cscript.exe",
    "mshta.exe",
    "rundll32.exe",
    "reg.exe",
    "regedit.exe",
    "bitsadmin.exe",
    "certutil.exe",
    "curl.exe",
    "wget.exe",
    "bash.exe",
    "msbuild.exe",
    "installutil.exe",
    "regasm.exe",
    "regsvcs.exe",
    "msxsl.exe",
    "cmstp.exe",
    "control.exe",
    "forfiles.exe",
    "pcalua.exe",
    "hh.exe",
    "ieexec.exe",
    "wmic.exe",
    "msdt.exe",
    "odbcconf.exe",
    "desktopimgdownldr.exe",
    "esentutl.exe",
    "expand.exe",
    "extrac32.exe",
    "makecab.exe",
    "certreq.exe",
    "ftp.exe",
    "tftp.exe",
}

_DENIED_OPEN_EXTS = {".exe", ".cmd", ".bat", ".ps1", ".vbs", ".msi", ".com", ".scr", ".js", ".jse", ".wsf"}

_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$"
)

# Never allow blocking these via hosts (would break the machine / updates)
_PROTECTED_DOMAINS = {
    "localhost",
    "local",
    "microsoft.com",
    "www.microsoft.com",
    "windowsupdate.com",
    "update.microsoft.com",
    "download.microsoft.com",
    "office.com",
    "live.com",
    "login.microsoftonline.com",
    "github.com",
    "githubusercontent.com",
}

_SYSTEM_ROOT_PREFIXES = (
    r"c:\windows",
    r"c:\program files",
    r"c:\program files (x86)",
)


def parse_uninstall_command(cmd: str) -> tuple[list[str] | None, str]:
    """Parse Windows UninstallString into argv without shell=True."""
    raw = (cmd or "").strip()
    if not raw:
        return None, "empty command"
    if "\n" in raw or "\r" in raw:
        return None, "multiline command rejected"
    # Block obvious shell metacharacters chains
    if any(x in raw for x in ("&&", "||", "|", ";", "`", "$(", "${")):
        return None, "shell metacharacters rejected"
    try:
        parts = shlex.split(raw, posix=False)
    except ValueError as exc:
        return None, f"parse error: {exc}"
    if not parts:
        return None, "empty argv"
    exe = parts[0].strip('"')
    base = Path(exe).name.lower()
    if base in _BLOCKED_BASENAMES:
        return None, f"blocked executable: {base}"
    # msiexec is allowed only for uninstall operations. Registry-supplied
    # install/repair/advertise commands must never be launched by UninstX.
    if base == "msiexec.exe" or base == "msiexec":
        args = [str(arg).strip().strip('"').lower() for arg in parts[1:]]
        uninstall_flags = ("/x", "-x", "/uninstall", "-uninstall")
        has_uninstall = any(
            arg in uninstall_flags or arg.startswith(("/x{", "-x{"))
            for arg in args
        )
        forbidden = ("/i", "-i", "/package", "-package", "/a", "-a", "/j", "-j", "/f", "-f")
        if not has_uninstall:
            return None, "msiexec rejected: uninstall flag /x or /uninstall required"
        if any(arg == flag or arg.startswith(flag + "{") for arg in args for flag in forbidden):
            return None, "msiexec rejected: install/repair flags are not allowed"
        return parts, ""
    # Require an existing .exe/.msi path when it looks like a path
    p = Path(exe)
    suffix = p.suffix.lower()
    if suffix in {".bat", ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".com", ".scr"}:
        return None, f"blocked uninstall script: {suffix}"
    if suffix == ".msi":
        return None, "direct MSI launch rejected: use msiexec /x"
    if suffix in {".exe", ".msi"}:
        if not p.is_file():
            return None, f"uninstall binary not found: {exe}"
    return parts, ""


def sanitize_domains(domains: list, max_count: int = 50) -> tuple[list[str], list[str]]:
    """Return (accepted, rejected_reasons)."""
    ok: list[str] = []
    bad: list[str] = []
    for raw in domains or []:
        d = str(raw).strip().lower().rstrip(".")
        if not d:
            continue
        if "://" in d or "/" in d or "\\" in d or " " in d:
            bad.append(f"{d}: path/url rejected")
            continue
        if d.startswith("."):
            d = d[1:]
        if d in _PROTECTED_DOMAINS or any(d.endswith("." + p) for p in _PROTECTED_DOMAINS):
            bad.append(f"{d}: protected domain")
            continue
        if not _DOMAIN_RE.match(d):
            bad.append(f"{d}: invalid hostname")
            continue
        if d not in ok:
            ok.append(d)
        if len(ok) >= max_count:
            break
    return ok, bad


def safe_resolve_under(path: str | Path, allowed_roots: list[Path] | None = None) -> Path | None:
    """Resolve path; optionally require it under one of allowed_roots."""
    try:
        p = Path(path).expanduser().resolve()
    except (OSError, RuntimeError):
        return None
    if allowed_roots:
        for root in allowed_roots:
            try:
                p.relative_to(root.resolve())
                return p
            except ValueError:
                continue
        return None
    return p


def is_probably_user_data_path(path: Path) -> bool:
    """Allow open_folder only for real existing paths (no UNC crazy)."""
    s = str(path)
    if s.startswith("\\\\"):
        return False
    return path.exists()


def is_blocked_system_path(path: Path) -> bool:
    """True for Windows / Program Files trees (takeown / ACL jail)."""
    try:
        low = str(path.resolve()).lower()
    except (OSError, RuntimeError):
        return True
    return any(low == p or low.startswith(p + "\\") for p in _SYSTEM_ROOT_PREFIXES)


def safe_open_path(
    path: str | Path,
    *,
    roots: list[Path] | None = None,
    deny_exec: bool = True,
) -> tuple[Path | None, str]:
    """
    Resolve and optionally jail a path for os.startfile.
    Refuses UNC, missing paths, and executable extensions when deny_exec.
    If roots is None, any existing local path is allowed (still deny_exec).
    """
    raw = str(path or "").strip()
    if not raw:
        return None, "empty path"
    if raw.startswith("\\\\") or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", raw):
        # UNC or URL-like schemes (http:, file:, etc.) — allow drive letters only via Path
        if not re.match(r"^[a-zA-Z]:[\\/]", raw):
            return None, "scheme or UNC rejected"
    p = safe_resolve_under(raw, roots)
    if p is None:
        return None, "path outside allowed roots" if roots else "invalid path"
    if not p.exists():
        return None, "path not found"
    if deny_exec and p.is_file() and p.suffix.lower() in _DENIED_OPEN_EXTS:
        return None, f"executable extension blocked: {p.suffix.lower()}"
    return p, ""


def member_path_safe(member: str) -> bool:
    """Reject zip/7z member names that escape the destination (zip-slip)."""
    name = (member or "").replace("\\", "/").strip()
    if not name or name.startswith("/") or name.startswith("../") or "/../" in f"/{name}/":
        return False
    if ".." in Path(name).parts:
        return False
    # Absolute Windows path inside archive
    if re.match(r"^[a-zA-Z]:", name) or name.startswith("//"):
        return False
    return True


def assert_extract_contained(dest: Path, created_paths: list[Path]) -> tuple[bool, str]:
    """Verify every created path stays under dest; caller should delete escapes."""
    try:
        root = dest.resolve()
    except (OSError, RuntimeError):
        return False, "invalid destination"
    for raw in created_paths:
        try:
            p = Path(raw).resolve()
            p.relative_to(root)
        except (OSError, RuntimeError, ValueError):
            return False, f"path escaped destination: {raw}"
    return True, ""


def collect_tree_paths(root: Path) -> list[Path]:
    """List all files/dirs under root (for post-extract scan)."""
    out: list[Path] = []
    if not root.exists():
        return out
    for dirpath, dirnames, filenames in os.walk(root):
        base = Path(dirpath)
        for d in dirnames:
            out.append(base / d)
        for f in filenames:
            out.append(base / f)
    return out


class ConfirmGate:
    """Short-lived host-side confirmation tokens (UI confirm alone is not enough)."""

    def __init__(self, ttl_seconds: float = 60.0) -> None:
        self._ttl = float(ttl_seconds)
        self._secret = secrets.token_bytes(32)
        self._pending: dict[str, tuple[str, str, float]] = {}

    @staticmethod
    def _payload_digest(payload: Any) -> str:
        raw = repr(payload).encode("utf-8", errors="replace")
        return hashlib.sha256(raw).hexdigest()

    def prepare(self, action: str, payload: Any = None) -> str:
        action_key = str(action or "").strip()
        if not action_key:
            raise ValueError("empty action")
        digest = self._payload_digest(payload)
        nonce = secrets.token_hex(16)
        sig = hmac.new(
            self._secret,
            f"{action_key}|{digest}|{nonce}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        token = f"{nonce}.{sig}"
        self._pending[token] = (action_key, digest, time.monotonic() + self._ttl)
        return token

    def consume(self, token: str, action: str, payload: Any = None) -> bool:
        tok = str(token or "").strip()
        entry = self._pending.pop(tok, None)
        if entry is None:
            return False
        action_key, digest, expires = entry
        if time.monotonic() > expires:
            return False
        if action_key != str(action or "").strip():
            return False
        if digest != self._payload_digest(payload):
            return False
        expected = tok.split(".", 1)
        if len(expected) != 2:
            return False
        nonce, sig = expected
        want = hmac.new(
            self._secret,
            f"{action_key}|{digest}|{nonce}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(sig, want)
