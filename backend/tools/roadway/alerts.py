# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Alert store + optional Windows balloon notifications."""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any


def data_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "RoadWay-X"
    path.mkdir(parents=True, exist_ok=True)
    return path


class AlertStore:
    def __init__(self, max_items: int = 500) -> None:
        self._items: deque[dict[str, Any]] = deque(maxlen=max(50, max_items))
        self._muted_rules: set[str] = set()
        self._toasts_enabled = True
        self._lock = threading.Lock()
        self._load()

    def _settings_path(self) -> Path:
        return data_dir() / "alert-settings.json"

    def _history_path(self) -> Path:
        return data_dir() / "alerts-history.json"

    def _load(self) -> None:
        sp = self._settings_path()
        if sp.is_file():
            try:
                data = json.loads(sp.read_text(encoding="utf-8-sig"))
                muted = data.get("muted_rules") or []
                if isinstance(muted, list):
                    self._muted_rules = {str(x) for x in muted}
                self._toasts_enabled = bool(data.get("toasts_enabled", True))
            except (OSError, json.JSONDecodeError, TypeError):
                pass
        hp = self._history_path()
        if hp.is_file():
            try:
                data = json.loads(hp.read_text(encoding="utf-8-sig"))
                if isinstance(data, list):
                    for item in data[-400:]:
                        if isinstance(item, dict):
                            self._items.append(item)
            except (OSError, json.JSONDecodeError, TypeError):
                pass

    def _persist_settings(self) -> None:
        try:
            self._settings_path().write_text(
                json.dumps(
                    {
                        "muted_rules": sorted(self._muted_rules),
                        "toasts_enabled": self._toasts_enabled,
                    },
                    indent=2,
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
        except OSError:
            pass

    def _persist_history(self) -> None:
        try:
            self._history_path().write_text(
                json.dumps(list(self._items), indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError:
            pass

    def ingest(self, alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        accepted: list[dict[str, Any]] = []
        with self._lock:
            for raw in alerts:
                if not isinstance(raw, dict):
                    continue
                rule = str(raw.get("rule") or "")
                if rule in self._muted_rules:
                    continue
                item = dict(raw)
                item.setdefault("ts", time.time())
                item.setdefault("id", f"a-{int(item['ts'] * 1000)}")
                self._items.appendleft(item)
                accepted.append(item)
            if accepted:
                self._persist_history()
        for item in accepted:
            if self._toasts_enabled and item.get("severity") in ("warn", "high"):
                self._toast(item)
        return accepted

    def list_alerts(self, limit: int = 100) -> dict[str, Any]:
        with self._lock:
            items = list(self._items)[: max(1, min(int(limit or 100), 500))]
            return {
                "ok": True,
                "alerts": items,
                "count": len(self._items),
                "muted_rules": sorted(self._muted_rules),
                "toasts_enabled": self._toasts_enabled,
            }

    def clear(self) -> dict[str, Any]:
        with self._lock:
            self._items.clear()
            self._persist_history()
        return {"ok": True}

    def mute_rule(self, rule: str, muted: bool = True) -> dict[str, Any]:
        rule_n = str(rule or "").strip()
        if not rule_n:
            return {"ok": False, "error": "rule vide"}
        with self._lock:
            if muted:
                self._muted_rules.add(rule_n)
            else:
                self._muted_rules.discard(rule_n)
            self._persist_settings()
        return {"ok": True, "muted_rules": sorted(self._muted_rules)}

    def set_toasts(self, enabled: bool = True) -> dict[str, Any]:
        with self._lock:
            self._toasts_enabled = bool(enabled)
            self._persist_settings()
        return {"ok": True, "toasts_enabled": self._toasts_enabled}

    def get_settings(self) -> dict[str, Any]:
        return {
            "ok": True,
            "muted_rules": sorted(self._muted_rules),
            "toasts_enabled": self._toasts_enabled,
        }

    def _toast(self, item: dict[str, Any]) -> None:
        title = "Traffic"
        sev = str(item.get("severity") or "info").upper()
        detail = str(item.get("detail") or item.get("label_fr") or "Alerte")
        # Escape for PowerShell single-quoted string
        detail_ps = detail.replace("'", "''")[:180]
        title_ps = f"{title} [{sev}]".replace("'", "''")

        def worker() -> None:
            script = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "Add-Type -AssemblyName System.Drawing; "
                "$n = New-Object System.Windows.Forms.NotifyIcon; "
                "$n.Icon = [System.Drawing.SystemIcons]::Warning; "
                f"$n.BalloonTipTitle = '{title_ps}'; "
                f"$n.BalloonTipText = '{detail_ps}'; "
                "$n.Visible = $true; "
                "$n.ShowBalloonTip(3500); "
                "Start-Sleep -Milliseconds 4000; "
                "$n.Dispose()"
            )
            try:
                subprocess.Popen(
                    [
                        "powershell",
                        "-NoProfile",
                        "-WindowStyle",
                        "Hidden",
                        "-Command",
                        script,
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            except OSError:
                pass

        threading.Thread(target=worker, daemon=True).start()
