# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Opt-in reputation lookups — info only, never auto-block."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def data_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "RoadWay-X"
    path.mkdir(parents=True, exist_ok=True)
    return path


class ReputationService:
    def __init__(self) -> None:
        self._enabled = False
        self._abuse_key = ""
        self._cache: dict[str, dict[str, Any]] = {}
        self._ttl = 24 * 3600
        self._load()

    def _settings_path(self) -> Path:
        return data_dir() / "reputation-settings.json"

    def _secrets_path(self) -> Path:
        return data_dir() / "secrets.json"

    def _cache_path(self) -> Path:
        return data_dir() / "reputation-cache.json"

    def _load(self) -> None:
        sp = self._settings_path()
        if sp.is_file():
            try:
                d = json.loads(sp.read_text(encoding="utf-8-sig"))
                self._enabled = bool(d.get("enabled", False))
            except (OSError, json.JSONDecodeError, TypeError):
                pass
        sec = self._secrets_path()
        if sec.is_file():
            try:
                d = json.loads(sec.read_text(encoding="utf-8-sig"))
                self._abuse_key = str(d.get("abuseipdb_key") or "").strip()
            except (OSError, json.JSONDecodeError, TypeError):
                pass
        cp = self._cache_path()
        if cp.is_file():
            try:
                d = json.loads(cp.read_text(encoding="utf-8-sig"))
                if isinstance(d, dict):
                    self._cache = d
            except (OSError, json.JSONDecodeError, TypeError):
                pass

    def _persist_settings(self) -> None:
        try:
            self._settings_path().write_text(
                json.dumps({"enabled": self._enabled}, indent=2),
                encoding="utf-8",
            )
        except OSError:
            pass

    def _persist_cache(self) -> None:
        try:
            # prune old
            now = time.time()
            self._cache = {
                k: v
                for k, v in self._cache.items()
                if isinstance(v, dict) and now - float(v.get("ts") or 0) < self._ttl
            }
            self._cache_path().write_text(json.dumps(self._cache), encoding="utf-8")
        except OSError:
            pass

    def get_settings(self) -> dict[str, Any]:
        return {
            "ok": True,
            "enabled": self._enabled,
            "has_abuseipdb_key": bool(self._abuse_key),
            "secrets_path": str(self._secrets_path()),
        }

    def set_enabled(self, enabled: bool = False) -> dict[str, Any]:
        self._enabled = bool(enabled)
        self._persist_settings()
        return self.get_settings()

    def set_abuseipdb_key(self, key: str = "") -> dict[str, Any]:
        self._abuse_key = (key or "").strip()
        try:
            existing = {}
            if self._secrets_path().is_file():
                existing = json.loads(self._secrets_path().read_text(encoding="utf-8-sig"))
            existing["abuseipdb_key"] = self._abuse_key
            self._secrets_path().write_text(json.dumps(existing, indent=2), encoding="utf-8")
        except (OSError, json.JSONDecodeError, TypeError) as exc:
            return {"ok": False, "error": str(exc)}
        return self.get_settings()

    def _cached(self, key: str) -> dict[str, Any] | None:
        hit = self._cache.get(key)
        if not hit:
            return None
        if time.time() - float(hit.get("ts") or 0) > self._ttl:
            return None
        return hit

    def lookup(self, host_or_ip: str = "", url: str = "") -> dict[str, Any]:
        target = (url or host_or_ip or "").strip()
        if not target:
            return {"ok": False, "error": "cible vide"}
        if not self._enabled:
            return {
                "ok": True,
                "enabled": False,
                "verdict": "unknown",
                "sources": [],
                "links": self._browser_links(target),
                "message": "Lookups externes désactivés",
            }
        cache_key = target.lower()
        cached = self._cached(cache_key)
        if cached:
            return {**cached, "ok": True, "cached": True}

        sources: list[dict[str, Any]] = []
        verdict = "unknown"

        # URLhaus host
        host = target
        if "://" in host:
            try:
                host = urllib.parse.urlparse(target).hostname or target
            except Exception:
                pass
        uh = self._urlhaus(host)
        if uh:
            sources.append(uh)
            if uh.get("malicious"):
                verdict = "malicious"
            elif uh.get("suspicious") and verdict != "malicious":
                verdict = "suspicious"

        # AbuseIPDB if looks like IPv4 and key set
        if self._looks_ip(host) and self._abuse_key:
            ab = self._abuseipdb(host)
            if ab:
                sources.append(ab)
                score = int(ab.get("score") or 0)
                if score >= 75:
                    verdict = "malicious"
                elif score >= 25 and verdict == "unknown":
                    verdict = "suspicious"
                elif score == 0 and verdict == "unknown" and not sources:
                    verdict = "clean"

        if not sources and verdict == "unknown":
            verdict = "unknown"

        result = {
            "ok": True,
            "enabled": True,
            "target": target,
            "host": host,
            "verdict": verdict,
            "sources": sources,
            "links": self._browser_links(host),
            "ts": time.time(),
        }
        self._cache[cache_key] = result
        self._persist_cache()
        return result

    @staticmethod
    def _looks_ip(s: str) -> bool:
        parts = s.split(".")
        if len(parts) != 4:
            return False
        try:
            return all(0 <= int(p) <= 255 for p in parts)
        except ValueError:
            return False

    @staticmethod
    def _browser_links(host: str) -> dict[str, str]:
        q = urllib.parse.quote(host)
        return {
            "virustotal": f"https://www.virustotal.com/gui/search/{q}",
            "talos": f"https://talosintelligence.com/reputation_center/lookup?search={q}",
            "abuseipdb": f"https://www.abuseipdb.com/check/{q}",
            "urlhaus": f"https://urlhaus.abuse.ch/browse.php?search={q}",
        }

    def _urlhaus(self, host: str) -> dict[str, Any] | None:
        try:
            data = urllib.parse.urlencode({"host": host}).encode()
            req = urllib.request.Request(
                "https://urlhaus-api.abuse.ch/v1/host/",
                data=data,
                method="POST",
                headers={"User-Agent": "RoadWay-X/1.0 (local opt-in)"},
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                body = json.loads(resp.read().decode("utf-8", errors="replace"))
            status = str(body.get("query_status") or "")
            if status == "no_results":
                return {"provider": "urlhaus", "malicious": False, "suspicious": False, "status": status}
            if status == "ok":
                return {
                    "provider": "urlhaus",
                    "malicious": True,
                    "suspicious": True,
                    "status": status,
                    "url_count": body.get("url_count"),
                }
            return {"provider": "urlhaus", "status": status, "malicious": False}
        except (urllib.error.URLError, OSError, json.JSONDecodeError, TimeoutError):
            return None

    def _abuseipdb(self, ip: str) -> dict[str, Any] | None:
        try:
            url = (
                "https://api.abuseipdb.com/api/v2/check?"
                + urllib.parse.urlencode({"ipAddress": ip, "maxAgeInDays": 90})
            )
            req = urllib.request.Request(
                url,
                headers={
                    "Key": self._abuse_key,
                    "Accept": "application/json",
                    "User-Agent": "RoadWay-X/1.0 (local opt-in)",
                },
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                body = json.loads(resp.read().decode("utf-8", errors="replace"))
            data = body.get("data") or {}
            return {
                "provider": "abuseipdb",
                "score": int(data.get("abuseConfidenceScore") or 0),
                "total_reports": data.get("totalReports"),
                "malicious": int(data.get("abuseConfidenceScore") or 0) >= 75,
                "suspicious": int(data.get("abuseConfidenceScore") or 0) >= 25,
            }
        except (urllib.error.URLError, OSError, json.JSONDecodeError, TimeoutError, TypeError, ValueError):
            return None
