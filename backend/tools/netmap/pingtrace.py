# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""PingTrace — ping + traceroute."""
from __future__ import annotations
import re
import subprocess
from typing import Any

def _run_cmd(args: list[str], timeout: int = 120) -> tuple[str, int]:
    proc = subprocess.run(
        args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return out.strip(), int(proc.returncode)

def _sanitize_host(host: str) -> str:
    host_n = (host or "").strip()
    if not host_n:
        raise ValueError("Hôte requis")
    if len(host_n) > 253:
        raise ValueError("Hôte trop long")
    if not re.match(r"^[a-zA-Z0-9._\-:]+$", host_n):
        raise ValueError("Hôte invalide")
    return host_n

def _parse_ping_stats(text: str) -> dict[str, Any]:
    stats: dict[str, Any] = {}
    m_avg = re.search(r"Moyenne\s*=\s*(\d+)ms|Average\s*=\s*(\d+)ms", text, re.I)
    if m_avg:
        stats["avgMs"] = int(m_avg.group(1) or m_avg.group(2))
    m_loss = re.search(r"(\d+)%\s*(perte|loss)", text, re.I)
    if m_loss:
        stats["lossPct"] = int(m_loss.group(1))
    return stats

def run_ping_trace(host: str = "") -> dict[str, Any]:
    try:
        host_n = _sanitize_host(host)
        ping_out, ping_rc = _run_cmd(["ping", "-n", "4", host_n], timeout=90)
        try:
            trace_out, trace_rc = _run_cmd(["tracert", "-d", host_n], timeout=180)
        except subprocess.TimeoutExpired:
            trace_out, trace_rc = "(tracert timeout)", 1
        stats = _parse_ping_stats(ping_out)
        combined = f"=== PING {host_n} ===\n{ping_out}\n\n=== TRACERT -d {host_n} ===\n{trace_out}"
        return {
            "ok": True, "host": host_n, "output": combined, "ping": ping_out, "trace": trace_out,
            "pingRc": ping_rc, "traceRc": trace_rc, "stats": stats,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Délai dépassé"}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
