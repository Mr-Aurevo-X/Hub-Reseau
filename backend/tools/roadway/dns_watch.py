# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""DNS recent queries — DNS client cache + optional event sampling."""
from __future__ import annotations

import subprocess
import time
from collections import deque
from typing import Any

_recent: deque[dict[str, Any]] = deque(maxlen=200)


def _run_ps(script: str, timeout: float = 8.0) -> str:
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return proc.stdout or ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def refresh_cache() -> list[dict[str, Any]]:
    """Pull Get-DnsClientCache entries into recent list."""
    script = (
        "Get-DnsClientCache -ErrorAction SilentlyContinue | "
        "Select-Object -First 80 Name,Type,Data,TTL | "
        "ConvertTo-Csv -NoTypeInformation"
    )
    raw = _run_ps(script)
    lines = [l for l in raw.splitlines() if l.strip()]
    if len(lines) < 2:
        return list(_recent)
    # skip header
    now = time.time()
    for line in lines[1:]:
        parts = [p.strip().strip('"') for p in line.split(",")]
        if len(parts) < 3:
            continue
        name, typ, data = parts[0], parts[1], parts[2]
        if not name or name.startswith("?"):
            continue
        item = {
            "ts": now,
            "query": name,
            "type": typ,
            "result": data,
            "pid": None,
        }
        # dedupe by query+result
        if any(r.get("query") == name and r.get("result") == data for r in _recent):
            continue
        _recent.appendleft(item)
    return list(_recent)


def note_query(query: str, result: str = "", pid: int | None = None) -> None:
    _recent.appendleft(
        {
            "ts": time.time(),
            "query": query,
            "type": "A",
            "result": result,
            "pid": pid,
        }
    )


def list_recent(limit: int = 60) -> dict[str, Any]:
    items = list(_recent)[: max(1, min(int(limit or 60), 200))]
    return {"ok": True, "items": items, "count": len(_recent)}


def match_blocklist(blocklist: list[str]) -> list[dict[str, Any]]:
    hits = []
    bl = [b.lower() for b in blocklist if b]
    for item in _recent:
        q = (item.get("query") or "").lower()
        hit = next((b for b in bl if b in q), None)
        if hit:
            hits.append({**item, "match": hit})
    return hits
