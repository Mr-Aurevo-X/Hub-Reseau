# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Trust allowlist + interactive question queue (never auto-blocks)."""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any


def data_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "RoadWay-X"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _norm_path(path: str) -> str:
    return (path or "").strip().lower().replace("/", "\\")


class TrustStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._entries: list[dict[str, Any]] = []
        self._learn_until = 0.0
        self._session_ignore: set[str] = set()
        self._queue: list[dict[str, Any]] = []
        self._seen_keys: set[str] = set()
        self._load()

    def _path(self) -> Path:
        return data_dir() / "trust.json"

    def _settings_path(self) -> Path:
        return data_dir() / "trust-settings.json"

    def _load(self) -> None:
        p = self._path()
        if p.is_file():
            try:
                data = json.loads(p.read_text(encoding="utf-8-sig"))
                if isinstance(data, list):
                    self._entries = [e for e in data if isinstance(e, dict)]
                elif isinstance(data, dict) and isinstance(data.get("entries"), list):
                    self._entries = [e for e in data["entries"] if isinstance(e, dict)]
            except (OSError, json.JSONDecodeError, TypeError):
                pass
        sp = self._settings_path()
        if sp.is_file():
            try:
                s = json.loads(sp.read_text(encoding="utf-8-sig"))
                self._learn_until = float(s.get("learn_until") or 0)
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                pass

    def _persist(self) -> None:
        try:
            self._path().write_text(
                json.dumps({"entries": self._entries}, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            self._settings_path().write_text(
                json.dumps({"learn_until": self._learn_until}, indent=2),
                encoding="utf-8",
            )
        except OSError:
            pass

    def is_learning(self) -> bool:
        return time.time() < self._learn_until

    def learn_remaining_s(self) -> float:
        return max(0.0, self._learn_until - time.time())

    def start_learn(self, minutes: float = 10.0) -> dict[str, Any]:
        try:
            mins = max(1.0, min(float(minutes or 10), 120.0))
        except (TypeError, ValueError):
            mins = 10.0
        with self._lock:
            self._learn_until = time.time() + mins * 60.0
            # Fresh learn session: allow asking again about current traffic
            self._seen_keys.clear()
            self._session_ignore.clear()
            self._persist()
            return {
                "ok": True,
                "learning": True,
                "learn_until": self._learn_until,
                "minutes": mins,
                "remaining_s": self.learn_remaining_s(),
            }

    def stop_learn(self) -> dict[str, Any]:
        with self._lock:
            self._learn_until = 0.0
            self._persist()
            return {"ok": True, "learning": False, "remaining_s": 0.0}

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "ok": True,
                "learning": self.is_learning(),
                "learn_until": self._learn_until,
                "remaining_s": self.learn_remaining_s(),
                "trust_count": len(self._entries),
                "queue_count": len(self._queue),
            }

    def list_trust(self) -> dict[str, Any]:
        with self._lock:
            return {"ok": True, "entries": list(self._entries)}

    def _is_trusted_unlocked(self, path: str = "", name: str = "") -> bool:
        path_n = _norm_path(path)
        name_n = (name or "").strip().lower()
        for e in self._entries:
            ep = e.get("path") or ""
            en = (e.get("name") or "").lower()
            if path_n and ep and path_n == ep:
                return True
            if name_n and en and name_n == en:
                return True
            if path_n and ep and Path(path_n).name == Path(ep).name and en and name_n == en:
                return True
        return False

    def is_trusted(self, path: str = "", name: str = "") -> bool:
        with self._lock:
            return self._is_trusted_unlocked(path, name)

    def add_trust(self, path: str = "", name: str = "") -> dict[str, Any]:
        path_n = _norm_path(path)
        name_n = (name or "").strip()
        if not path_n and not name_n:
            return {"ok": False, "error": "path ou name requis"}
        entry = {
            "path": path_n,
            "name": name_n,
            "added_at": time.time(),
        }
        with self._lock:
            if self._is_trusted_unlocked(path_n, name_n):
                return {"ok": True, "entry": entry, "exists": True}
            self._entries.append(entry)
            self._persist()
            return {"ok": True, "entry": entry}

    def remove_trust(self, path: str = "", name: str = "") -> dict[str, Any]:
        path_n = _norm_path(path)
        name_n = (name or "").strip().lower()
        with self._lock:
            before = len(self._entries)
            self._entries = [
                e
                for e in self._entries
                if not (
                    (path_n and e.get("path") == path_n)
                    or (name_n and (e.get("name") or "").lower() == name_n and not path_n)
                )
            ]
            self._persist()
            return {"ok": True, "removed": before - len(self._entries)}

    def question_key(self, kind: str, path: str = "", name: str = "", remote: str = "") -> str:
        # Process questions keyed by path/name (not remote) so one card per app
        if kind in ("new_process", "loose_exe"):
            return f"{kind}|{_norm_path(path)}|{(name or '').lower()}"
        # Host questions keyed by remote host/ip
        return f"{kind}|{(remote or '').lower()}"

    def enqueue(
        self,
        kind: str,
        *,
        path: str = "",
        name: str = "",
        pid: int = 0,
        remote: str = "",
        hostname: str = "",
        detail: str = "",
        severity: str = "info",
    ) -> dict[str, Any] | None:
        key = self.question_key(kind, path, name, remote or hostname)
        with self._lock:
            if key in self._session_ignore or key in self._seen_keys:
                return None
            if self._is_trusted_unlocked(path, name):
                return None
            # Already queued?
            for q in self._queue:
                if q.get("key") == key:
                    return None
            self._seen_keys.add(key)
            item = {
                "id": str(uuid.uuid4()),
                "key": key,
                "kind": kind,
                "path": path or "",
                "name": name or "",
                "pid": int(pid or 0),
                "remote": remote or "",
                "hostname": hostname or "",
                "detail": detail or "",
                "severity": severity or "info",
                "ts": time.time(),
                "reputation": None,
            }
            self._queue.append(item)
            if len(self._queue) > 80:
                self._queue = self._queue[-80:]
            return dict(item)

    def list_questions(self) -> dict[str, Any]:
        with self._lock:
            return {
                "ok": True,
                "questions": [dict(q) for q in self._queue],
                "count": len(self._queue),
                "learning": self.is_learning(),
                "remaining_s": self.learn_remaining_s(),
            }

    def answer(self, question_id: str, action: str) -> dict[str, Any]:
        """action: trust | ignore | propose_block — never applies block itself."""
        action_n = (action or "").strip().lower()
        with self._lock:
            found = None
            for i, q in enumerate(self._queue):
                if q.get("id") == question_id:
                    found = self._queue.pop(i)
                    break
            if not found:
                return {"ok": False, "error": "question introuvable"}
            key = found.get("key") or ""
            path = found.get("path") or ""
            name = found.get("name") or ""
            if action_n == "ignore":
                if key:
                    self._session_ignore.add(key)
                return {"ok": True, "action": "ignore", "question": found, "needs_confirm_block": False}
            if action_n in ("propose_block", "block"):
                return {
                    "ok": True,
                    "action": "propose_block",
                    "question": found,
                    "needs_confirm_block": True,
                    "block_hint": {
                        "remote": found.get("remote") or "",
                        "hostname": found.get("hostname") or "",
                        "pid": found.get("pid") or 0,
                        "path": path,
                        "name": name,
                    },
                }
            if action_n != "trust":
                self._queue.insert(0, found)
                return {"ok": False, "error": "action invalide (trust|ignore|propose_block)"}
        self.add_trust(path, name)
        return {"ok": True, "action": "trust", "question": found, "needs_confirm_block": False}

    def set_question_reputation(self, question_id: str, reputation: dict[str, Any]) -> None:
        with self._lock:
            for q in self._queue:
                if q.get("id") == question_id:
                    q["reputation"] = reputation
                    break

    def observe_snapshot(self, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        """Enqueue questions during learn (and for loose exe anytime). Never blocks."""
        added: list[dict[str, Any]] = []
        learning = self.is_learning()
        budget = 12
        # Prefer unique processes first
        seen_proc: set[str] = set()
        for c in snapshot.get("connections") or []:
            if len(added) >= budget:
                break
            if not c.get("outbound"):
                continue
            path = c.get("path") or ""
            name = c.get("name") or ""
            if self.is_trusted(path, name):
                continue
            proc_id = f"{_norm_path(path)}|{(name or '').lower()}"
            if learning or c.get("loose"):
                if proc_id in seen_proc:
                    pass
                else:
                    seen_proc.add(proc_id)
                    kind = "loose_exe" if c.get("loose") else "new_process"
                    item = self.enqueue(
                        kind,
                        path=path,
                        name=name,
                        pid=int(c.get("pid") or 0),
                        remote=c.get("raddr") or "",
                        hostname=c.get("hostname") or "",
                        detail=f"{name or '?'} → {c.get('raddr') or '?'}",
                        severity="warn" if c.get("loose") else "info",
                    )
                    if item:
                        added.append(item)
            rip = (c.get("remote_ip") or "").strip()
            host = (c.get("hostname") or "").strip()
            if learning and rip and len(added) < budget:
                item = self.enqueue(
                    "new_host",
                    path=path,
                    name=name,
                    pid=int(c.get("pid") or 0),
                    remote=c.get("raddr") or rip,
                    hostname=host or rip,
                    detail=f"Hôte distant {host or rip}",
                    severity="info",
                )
                if item:
                    added.append(item)
        return added
