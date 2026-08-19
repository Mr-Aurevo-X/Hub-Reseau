# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Optional short PCAP capture on alert — requires Npcap; never blocks."""
from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Any

_lock = threading.Lock()
_buffer: list[Any] = []
_capturing = False
_last_error: str | None = None


def data_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "RoadWay-X" / "captures"
    path.mkdir(parents=True, exist_ok=True)
    return path


def npcap_available() -> bool:
    candidates = [
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "System32" / "Npcap.dll",
        Path(r"C:\Windows\System32\Npcap.dll"),
        Path(r"C:\Program Files\Npcap\NPFInstall.exe"),
    ]
    return any(p.exists() for p in candidates)


def status() -> dict[str, Any]:
    scapy_ok = False
    try:
        import importlib.util

        scapy_ok = importlib.util.find_spec("scapy") is not None
    except Exception:
        scapy_ok = False
    return {
        "ok": True,
        "npcap": npcap_available(),
        "scapy": scapy_ok,
        "capturing": _capturing,
        "buffer_packets": len(_buffer),
        "last_error": _last_error,
        "captures_dir": str(data_dir()),
    }


def capture_for_ip(ip: str, seconds: float = 10.0) -> dict[str, Any]:
    """Sniff briefly filtered to IP; write pcap. Manual/opt-in only."""
    global _capturing, _last_error, _buffer
    ip_n = (ip or "").strip()
    if not ip_n:
        return {"ok": False, "error": "IP vide"}
    if not npcap_available():
        return {"ok": False, "error": "Npcap introuvable — installez Npcap", "npcap": False}
    try:
        from scapy.all import sniff, wrpcap  # type: ignore
    except ImportError:
        return {"ok": False, "error": "scapy non installé", "scapy": False}

    try:
        secs = max(2.0, min(float(seconds or 10), 30.0))
    except (TypeError, ValueError):
        secs = 10.0

    with _lock:
        if _capturing:
            return {"ok": False, "error": "Capture déjà en cours"}
        _capturing = True
        _last_error = None
        _buffer = []

    def _run() -> None:
        global _capturing, _last_error, _buffer
        try:
            bpf = f"host {ip_n}"
            pkts = sniff(filter=bpf, timeout=secs, store=True)
            _buffer = list(pkts)
            out = data_dir() / f"alert-{ip_n.replace(':', '_')}-{int(time.time())}.pcap"
            wrpcap(str(out), pkts)
            _last_error = None
            _capturing = False
            _result["path"] = str(out)
            _result["count"] = len(pkts)
            _result["done"] = True
        except Exception as exc:
            _last_error = str(exc)
            _capturing = False
            _result["error"] = str(exc)
            _result["done"] = True

    _result: dict[str, Any] = {"done": False}
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=secs + 5)
    with _lock:
        _capturing = False
    if _result.get("done") and _result.get("path"):
        return {"ok": True, "path": _result["path"], "count": _result.get("count", 0), "ip": ip_n}
    return {
        "ok": False,
        "error": _result.get("error") or _last_error or "Capture échouée",
        "ip": ip_n,
    }
