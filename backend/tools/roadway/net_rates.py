"""Per-process network rates — ETW when available, else I/O approx."""
from __future__ import annotations

import time
from typing import Any

import psutil

_rate_source = "approx"
_prev_io: dict[int, tuple[int, int]] = {}
_prev_ts: float | None = None
_etw_ok = False


def rate_source() -> str:
    return _rate_source


def try_init_etw() -> bool:
    """Best-effort: mark etw if pywin32 present (full consumer can be extended)."""
    global _etw_ok, _rate_source
    try:
        import win32api  # noqa: F401

        # Full Kernel-Network ETW consumer is heavy; we keep approx rates but
        # expose capability flag. Future: bind real ETW byte counters here.
        _etw_ok = True
        # Still use approx until real counters wired — source stays approx
        _rate_source = "approx"
        return True
    except Exception:
        _etw_ok = False
        _rate_source = "approx"
        return False


def poll_process_rates(now: float | None = None) -> dict[int, dict[str, float]]:
    global _prev_io, _prev_ts, _rate_source
    now = now or time.time()
    rates: dict[int, dict[str, float]] = {}
    dt = 1.0
    if _prev_ts is not None:
        dt = max(0.05, now - _prev_ts)
    current: dict[int, tuple[int, int]] = {}
    try:
        for p in psutil.process_iter(["pid"]):
            pid = p.info.get("pid")
            if not pid:
                continue
            try:
                io = p.io_counters()
                if io is None:
                    continue
                pair = (int(io.read_bytes), int(io.write_bytes))
                current[pid] = pair
                prev = _prev_io.get(pid)
                if prev is not None:
                    rates[pid] = {
                        "bps_down": max(0.0, (pair[0] - prev[0]) / dt),
                        "bps_up": max(0.0, (pair[1] - prev[1]) / dt),
                    }
            except (psutil.Error, OSError, AttributeError):
                continue
    except (psutil.Error, OSError):
        pass
    _prev_io = current
    _prev_ts = now
    _rate_source = "approx"
    return rates


def meta() -> dict[str, Any]:
    return {
        "rate_source": _rate_source,
        "etw_available": _etw_ok,
        "label": "approx (I/O Windows)" if _rate_source == "approx" else "ETW",
    }
