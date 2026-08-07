"""Local GeoIP via MaxMind MMDB (optional file)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_reader = None
_tried = False
_cache: dict[str, dict[str, Any]] = {}


def data_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "RoadWay-X"
    path.mkdir(parents=True, exist_ok=True)
    return path


def mmdb_candidates() -> list[Path]:
    from pathlib import Path as P

    root = P(__file__).resolve().parent.parent.parent
    return [
        data_dir() / "GeoLite2-Country.mmdb",
        data_dir() / "GeoLite2-City.mmdb",
        root / "data" / "GeoLite2-Country.mmdb",
        root / "data" / "GeoLite2-City.mmdb",
    ]


def _ensure_reader() -> Any:
    global _reader, _tried
    if _tried:
        return _reader
    _tried = True
    try:
        import maxminddb
    except ImportError:
        _reader = None
        return None
    for p in mmdb_candidates():
        if p.is_file():
            try:
                _reader = maxminddb.open_database(str(p))
                return _reader
            except Exception:
                continue
    _reader = None
    return None


def lookup(ip: str) -> dict[str, Any]:
    ip_n = (ip or "").strip()
    out = {"ok": True, "ip": ip_n, "country": None, "country_name": None, "available": False}
    if not ip_n:
        return out
    if ip_n in _cache:
        return dict(_cache[ip_n])
    reader = _ensure_reader()
    if reader is None:
        out["available"] = False
        _cache[ip_n] = out
        return out
    out["available"] = True
    try:
        rec = reader.get(ip_n)
        if not rec:
            _cache[ip_n] = out
            return out
        country = rec.get("country") or {}
        out["country"] = country.get("iso_code")
        names = country.get("names") or {}
        out["country_name"] = names.get("fr") or names.get("en")
    except Exception as exc:
        out["ok"] = False
        out["error"] = str(exc)
    _cache[ip_n] = out
    return out


def status() -> dict[str, Any]:
    reader = _ensure_reader()
    paths = [str(p) for p in mmdb_candidates()]
    return {
        "ok": True,
        "available": reader is not None,
        "paths": paths,
        "hint": "Placez GeoLite2-Country.mmdb dans %LOCALAPPDATA%\\Mr-Aurevo-X\\RoadWay-X\\",
    }
