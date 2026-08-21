# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Heuristic rules engine for Traffic."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from .collector import COMMON_PORTS, SENSITIVE_LISTEN_PORTS, TrafficCollector

DEFAULT_RULES: dict[str, dict[str, Any]] = {
    "new_network_process": {
        "enabled": True,
        "severity": "warn",
        "label_fr": "Nouveau processus réseau",
        "label_en": "New network process",
    },
    "rare_port": {
        "enabled": True,
        "severity": "warn",
        "label_fr": "Port sortant rare",
        "label_en": "Rare outbound port",
    },
    "bandwidth_spike": {
        "enabled": True,
        "severity": "high",
        "label_fr": "Pic de débit",
        "label_en": "Bandwidth spike",
        "threshold_bps": 8_000_000,  # ~8 MB/s absolute
        "baseline_factor": 4.0,
    },
    "dest_fanout": {
        "enabled": True,
        "severity": "high",
        "label_fr": "Beaucoup de destinations",
        "label_en": "High destination fan-out",
        "threshold": 25,
    },
    "suspicious_listener": {
        "enabled": True,
        "severity": "warn",
        "label_fr": "Listener sensible",
        "label_en": "Sensitive listener",
    },
    "blocklist_hit": {
        "enabled": True,
        "severity": "high",
        "label_fr": "Correspondance blocklist",
        "label_en": "Blocklist match",
    },
    "loose_executable": {
        "enabled": True,
        "severity": "info",
        "label_fr": "Exécutable hors dossiers système",
        "label_en": "Loose executable path",
    },
    "foreign_outbound": {
        "enabled": False,
        "severity": "info",
        "label_fr": "Connexion hors pays d’origine",
        "label_en": "Foreign outbound connection",
        "home_country": "FR",
    },
}


def data_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "RoadWay-X"
    path.mkdir(parents=True, exist_ok=True)
    return path


class HeuristicsEngine:
    def __init__(self) -> None:
        self._rules = self._load_rules()
        self._blocklist = self._load_blocklist()
        self._cooldowns: dict[str, float] = {}
        self._bps_baseline: list[float] = []

    def _rules_path(self) -> Path:
        return data_dir() / "rules.json"

    def _blocklist_path(self) -> Path:
        return data_dir() / "blocklist.txt"

    def _load_rules(self) -> dict[str, dict[str, Any]]:
        path = self._rules_path()
        merged = {k: dict(v) for k, v in DEFAULT_RULES.items()}
        if path.is_file():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8-sig"))
                if isinstance(loaded, dict):
                    for key, val in loaded.items():
                        if key in merged and isinstance(val, dict):
                            merged[key].update(val)
            except (OSError, json.JSONDecodeError, TypeError):
                pass
        return merged

    def _load_blocklist(self) -> list[str]:
        path = self._blocklist_path()
        if not path.is_file():
            path.write_text(
                "# One host/domain/IP substring per line\n",
                encoding="utf-8",
            )
            return []
        out: list[str] = []
        try:
            for line in path.read_text(encoding="utf-8-sig").splitlines():
                s = line.strip().lower()
                if not s or s.startswith("#"):
                    continue
                out.append(s)
        except OSError:
            pass
        return out

    def save_rules(self, patch: dict[str, Any] | None = None) -> dict[str, Any]:
        if isinstance(patch, dict):
            for key, val in patch.items():
                if key in self._rules and isinstance(val, dict):
                    self._rules[key].update(val)
        try:
            self._rules_path().write_text(
                json.dumps(self._rules, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError as exc:
            return {"ok": False, "error": str(exc), "rules": self._rules}
        return {"ok": True, "rules": self._rules}

    def get_rules(self) -> dict[str, Any]:
        return {"ok": True, "rules": self._rules, "blocklist_path": str(self._blocklist_path())}

    def reload_blocklist(self) -> dict[str, Any]:
        self._blocklist = self._load_blocklist()
        return {"ok": True, "count": len(self._blocklist), "items": list(self._blocklist)}

    def get_blocklist(self) -> dict[str, Any]:
        return {
            "ok": True,
            "items": list(self._blocklist),
            "path": str(self._blocklist_path()),
        }

    def set_blocklist(self, items: list[str] | None = None) -> dict[str, Any]:
        lines = ["# One host/domain/IP substring per line"]
        cleaned: list[str] = []
        for raw in items or []:
            s = str(raw or "").strip().lower()
            if s and not s.startswith("#"):
                cleaned.append(s)
                lines.append(s)
        try:
            self._blocklist_path().write_text("\n".join(lines) + "\n", encoding="utf-8")
        except OSError as exc:
            return {"ok": False, "error": str(exc)}
        self._blocklist = cleaned
        return {"ok": True, "count": len(cleaned), "items": cleaned}

    def _cooled(self, key: str, seconds: float = 45.0) -> bool:
        now = time.time()
        last = self._cooldowns.get(key, 0.0)
        if now - last < seconds:
            return True
        self._cooldowns[key] = now
        return False

    def _rule_on(self, name: str) -> bool:
        rule = self._rules.get(name) or {}
        return bool(rule.get("enabled", True))

    def evaluate(
        self,
        snapshot: dict[str, Any],
        collector: TrafficCollector,
        trust_check: Any = None,
    ) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        now = time.time()
        stats = snapshot.get("stats") or {}
        nic = snapshot.get("nic") or {}
        connections = snapshot.get("connections") or []
        fanout = snapshot.get("fanout") or {}

        def trusted(path: str = "", name: str = "") -> bool:
            if trust_check is None:
                return False
            try:
                return bool(trust_check(path, name))
            except Exception:
                return False

        # Events from collector (new process)
        if self._rule_on("new_network_process"):
            for ev in snapshot.get("events") or []:
                if ev.get("rule") != "new_network_process":
                    continue
                if trusted(ev.get("path") or "", ev.get("name") or ""):
                    continue
                ck = f"new:{ev.get('path') or ev.get('name')}"
                if self._cooled(ck, 120.0):
                    continue
                alerts.append(self._make(ev, "new_network_process"))

        # Rare outbound ports
        if self._rule_on("rare_port"):
            for c in connections:
                if not c.get("outbound"):
                    continue
                if trusted(c.get("path") or "", c.get("name") or ""):
                    continue
                port = int(c.get("remote_port") or 0)
                extra_common = self._rules.get("rare_port", {}).get("common_ports")
                common = COMMON_PORTS
                if isinstance(extra_common, list) and extra_common:
                    try:
                        common = frozenset(int(x) for x in extra_common) | COMMON_PORTS
                    except (TypeError, ValueError):
                        pass
                if port <= 0 or port in common:
                    continue
                ck = f"rare:{c.get('pid')}:{port}:{c.get('remote_ip')}"
                if self._cooled(ck, 90.0):
                    continue
                alerts.append(
                    self._make(
                        {
                            "severity": self._rules["rare_port"].get("severity", "warn"),
                            "pid": c.get("pid"),
                            "name": c.get("name"),
                            "path": c.get("path"),
                            "remote": c.get("raddr"),
                            "detail": f"Port sortant rare {port} → {c.get('raddr')}",
                        },
                        "rare_port",
                    )
                )

        # Bandwidth spike
        if self._rule_on("bandwidth_spike"):
            total = float(nic.get("bps_total") or 0)
            self._bps_baseline.append(total)
            if len(self._bps_baseline) > 60:
                self._bps_baseline = self._bps_baseline[-60:]
            avg = sum(self._bps_baseline) / max(1, len(self._bps_baseline))
            thr = float(self._rules["bandwidth_spike"].get("threshold_bps") or 8_000_000)
            factor = float(self._rules["bandwidth_spike"].get("baseline_factor") or 4.0)
            spiked = total >= thr or (avg > 50_000 and total >= avg * factor)
            if spiked and stats.get("baseline_ready") and not self._cooled("bw_spike", 60.0):
                alerts.append(
                    self._make(
                        {
                            "severity": self._rules["bandwidth_spike"].get("severity", "high"),
                            "detail": f"Pic débit {self._fmt_bps(total)} (moy {self._fmt_bps(avg)})",
                            "bps": total,
                        },
                        "bandwidth_spike",
                    )
                )

        # Destination fan-out
        if self._rule_on("dest_fanout"):
            thr = int(self._rules["dest_fanout"].get("threshold") or 25)
            name_by_pid = {int(c.get("pid") or 0): c for c in connections}
            for pid_s, count in fanout.items():
                try:
                    pid = int(pid_s)
                except (TypeError, ValueError):
                    continue
                count_n = int(count)
                if count_n < thr:
                    continue
                ck = f"fanout:{pid}"
                if self._cooled(ck, 90.0):
                    continue
                meta = name_by_pid.get(pid) or {}
                alerts.append(
                    self._make(
                        {
                            "severity": self._rules["dest_fanout"].get("severity", "high"),
                            "pid": pid,
                            "name": meta.get("name"),
                            "path": meta.get("path"),
                            "detail": f"{count_n} destinations distinctes / 30s",
                            "count": count_n,
                        },
                        "dest_fanout",
                    )
                )

        # Suspicious listeners
        if self._rule_on("suspicious_listener"):
            for c in connections:
                if not c.get("listening"):
                    continue
                port = int(c.get("local_port") or 0)
                if port not in SENSITIVE_LISTEN_PORTS:
                    continue
                if not c.get("loose") and (c.get("path") or "").lower().startswith(r"c:\windows"):
                    continue
                ck = f"listen:{c.get('pid')}:{port}"
                if self._cooled(ck, 180.0):
                    continue
                alerts.append(
                    self._make(
                        {
                            "severity": self._rules["suspicious_listener"].get("severity", "warn"),
                            "pid": c.get("pid"),
                            "name": c.get("name"),
                            "path": c.get("path"),
                            "detail": f"Listener sensible :{port} ({c.get('name') or '?'})",
                            "port": port,
                        },
                        "suspicious_listener",
                    )
                )

        # Blocklist
        if self._rule_on("blocklist_hit") and self._blocklist:
            for c in connections:
                hay = " ".join(
                    [
                        str(c.get("remote_ip") or ""),
                        str(c.get("raddr") or ""),
                        str(c.get("hostname") or ""),
                        str(c.get("name") or ""),
                    ]
                ).lower()
                hit = next((b for b in self._blocklist if b in hay), None)
                if not hit:
                    # also check hostname on flows later via remote
                    continue
                ck = f"bl:{hit}:{c.get('pid')}:{c.get('remote_ip')}"
                if self._cooled(ck, 120.0):
                    continue
                alerts.append(
                    self._make(
                        {
                            "severity": self._rules["blocklist_hit"].get("severity", "high"),
                            "pid": c.get("pid"),
                            "name": c.get("name"),
                            "path": c.get("path"),
                            "remote": c.get("raddr"),
                            "detail": f"Blocklist « {hit} » → {c.get('raddr')}",
                            "match": hit,
                        },
                        "blocklist_hit",
                    )
                )
            for f in snapshot.get("flows") or []:
                host = str(f.get("hostname") or "").lower()
                if not host:
                    continue
                hit = next((b for b in self._blocklist if b in host), None)
                if not hit:
                    continue
                ck = f"blh:{hit}:{f.get('pid')}:{host}"
                if self._cooled(ck, 120.0):
                    continue
                alerts.append(
                    self._make(
                        {
                            "severity": self._rules["blocklist_hit"].get("severity", "high"),
                            "pid": f.get("pid"),
                            "name": f.get("name"),
                            "path": f.get("path"),
                            "remote": f.get("raddr"),
                            "detail": f"Blocklist host « {hit} » → {host}",
                            "match": hit,
                        },
                        "blocklist_hit",
                    )
                )

        # Loose executables with outbound
        if self._rule_on("loose_executable"):
            for c in connections:
                if not c.get("outbound") or not c.get("loose"):
                    continue
                if trusted(c.get("path") or "", c.get("name") or ""):
                    continue
                ck = f"loose:{c.get('path') or c.get('name')}"
                if self._cooled(ck, 180.0):
                    continue
                alerts.append(
                    self._make(
                        {
                            "severity": self._rules["loose_executable"].get("severity", "info"),
                            "pid": c.get("pid"),
                            "name": c.get("name"),
                            "path": c.get("path"),
                            "remote": c.get("raddr"),
                            "detail": f"Exécutable hors système: {c.get('name') or '?'}",
                        },
                        "loose_executable",
                    )
                )

        # Optional foreign outbound (geo)
        if self._rule_on("foreign_outbound"):
            home = str(self._rules.get("foreign_outbound", {}).get("home_country") or "FR").upper()
            for c in connections:
                if not c.get("outbound"):
                    continue
                if trusted(c.get("path") or "", c.get("name") or ""):
                    continue
                cc = (c.get("country") or "").upper()
                if not cc or cc == home:
                    continue
                ck = f"foreign:{c.get('pid')}:{c.get('remote_ip')}:{cc}"
                if self._cooled(ck, 120.0):
                    continue
                alerts.append(
                    self._make(
                        {
                            "severity": self._rules["foreign_outbound"].get("severity", "info"),
                            "pid": c.get("pid"),
                            "name": c.get("name"),
                            "path": c.get("path"),
                            "remote": c.get("raddr"),
                            "detail": f"Sortie vers {cc} ({c.get('country_name') or cc})",
                        },
                        "foreign_outbound",
                    )
                )

        for a in alerts:
            a["ts"] = now
        return alerts

    def _make(self, payload: dict[str, Any], rule: str) -> dict[str, Any]:
        rule_meta = self._rules.get(rule) or {}
        return {
            "id": f"{rule}-{int(time.time() * 1000)}-{payload.get('pid') or 0}",
            "rule": rule,
            "severity": payload.get("severity") or rule_meta.get("severity") or "info",
            "label_fr": rule_meta.get("label_fr") or rule,
            "label_en": rule_meta.get("label_en") or rule,
            "detail": payload.get("detail") or "",
            "pid": payload.get("pid") or 0,
            "name": payload.get("name") or "",
            "path": payload.get("path") or "",
            "remote": payload.get("remote") or "",
            "muted": False,
        }

    @staticmethod
    def _fmt_bps(bps: float) -> str:
        n = float(bps or 0)
        if n >= 1_000_000:
            return f"{n / 1_000_000:.1f} MB/s"
        if n >= 1_000:
            return f"{n / 1_000:.1f} KB/s"
        return f"{n:.0f} B/s"
