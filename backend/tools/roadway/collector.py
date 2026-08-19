# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Real-time flow / NIC / process network collector."""
from __future__ import annotations

import socket
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import psutil

COMMON_PORTS = frozenset(
    {
        20, 21, 22, 23, 25, 53, 67, 68, 80, 110, 123, 135, 137, 138, 139,
        143, 443, 445, 465, 587, 993, 995, 1433, 1521, 3306, 3389, 5432,
        5900, 6379, 8080, 8443, 27017,
    }
)

SENSITIVE_LISTEN_PORTS = frozenset(
    {22, 23, 135, 139, 445, 1433, 3306, 3389, 5432, 5900, 6379, 27017}
)

SYSTEM_PATH_PREFIXES = (
    r"c:\windows\\",
    r"c:\program files\\",
    r"c:\program files (x86)\\",
)


def _fmt_addr(addr: Any) -> str:
    if not addr:
        return ""
    try:
        ip, port = addr.ip, addr.port
        if ip is None:
            return ""
        return f"{ip}:{port}" if port is not None else str(ip)
    except (AttributeError, TypeError):
        return str(addr)


def _proto_label(conn: Any) -> str:
    try:
        t = conn.type
        if t == getattr(psutil, "SOCK_STREAM", 1):
            return "TCP"
        if t == getattr(psutil, "SOCK_DGRAM", 2):
            return "UDP"
    except (AttributeError, TypeError):
        pass
    return "?"


def _is_private_or_local(ip: str) -> bool:
    ip = (ip or "").strip().lower()
    if not ip or ip in ("::", "::1", "0.0.0.0", "*"):
        return True
    if ip.startswith("127.") or ip.startswith("10.") or ip.startswith("192.168."):
        return True
    if ip.startswith("169.254.") or ip.startswith("fc") or ip.startswith("fe80"):
        return True
    if ip.startswith("172."):
        try:
            second = int(ip.split(".")[1])
            if 16 <= second <= 31:
                return True
        except (ValueError, IndexError):
            pass
    return False


def _is_loose_path(path: str) -> bool:
    p = (path or "").strip().lower().replace("/", "\\")
    if not p:
        return False
    for prefix in SYSTEM_PATH_PREFIXES:
        if p.startswith(prefix):
            return False
    return True


@dataclass
class Snapshot:
    ts: float
    connections: list[dict[str, Any]] = field(default_factory=list)
    flows: list[dict[str, Any]] = field(default_factory=list)
    nic: dict[str, Any] = field(default_factory=dict)
    tops: list[dict[str, Any]] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)


class TrafficCollector:
    """Poll sockets + NIC counters; aggregate flows and short baseline."""

    def __init__(self, history_len: int = 120) -> None:
        self._history: deque[Snapshot] = deque(maxlen=max(30, history_len))
        self._prev_nic: dict[str, int] | None = None
        self._prev_nic_ts: float | None = None
        self._prev_proc_io: dict[int, tuple[int, int]] = {}
        self._prev_proc_ts: float | None = None
        self._seen_procs: set[str] = set()
        self._baseline_ready = False
        self._baseline_until = time.time() + 8.0
        self._dest_window: deque[tuple[float, str, int]] = deque(maxlen=5000)
        self._last_error: str | None = None
        # Warm NIC counters
        try:
            psutil.net_io_counters()
        except (psutil.Error, OSError):
            pass

    def _proc_info(self, pid: int | None, cache: dict[int, dict[str, Any]]) -> dict[str, Any]:
        if not pid or pid <= 0:
            return {"name": "", "path": "", "loose": False}
        if pid in cache:
            return cache[pid]
        name, path = "", ""
        try:
            p = psutil.Process(pid)
            name = p.name() or ""
            try:
                path = p.exe() or ""
            except (psutil.Error, OSError):
                path = ""
        except (psutil.Error, OSError):
            pass
        info = {"name": name, "path": path, "loose": _is_loose_path(path)}
        cache[pid] = info
        return info

    def _nic_rates(self, now: float) -> dict[str, Any]:
        try:
            counters = psutil.net_io_counters()
        except (psutil.Error, OSError) as exc:
            self._last_error = str(exc)
            return {
                "bytes_sent": 0,
                "bytes_recv": 0,
                "bps_up": 0.0,
                "bps_down": 0.0,
                "packets_sent": 0,
                "packets_recv": 0,
            }
        cur = {
            "bytes_sent": int(counters.bytes_sent),
            "bytes_recv": int(counters.bytes_recv),
            "packets_sent": int(getattr(counters, "packets_sent", 0) or 0),
            "packets_recv": int(getattr(counters, "packets_recv", 0) or 0),
        }
        bps_up = bps_down = 0.0
        if self._prev_nic is not None and self._prev_nic_ts is not None:
            dt = max(0.05, now - self._prev_nic_ts)
            bps_up = max(0.0, (cur["bytes_sent"] - self._prev_nic["bytes_sent"]) / dt)
            bps_down = max(0.0, (cur["bytes_recv"] - self._prev_nic["bytes_recv"]) / dt)
        self._prev_nic = cur
        self._prev_nic_ts = now
        return {
            **cur,
            "bps_up": bps_up,
            "bps_down": bps_down,
            "bps_total": bps_up + bps_down,
        }

    def _process_net_rates(self, now: float, pids: set[int] | None = None) -> dict[int, dict[str, float]]:
        """Per-pid io_counters delta for relevant PIDs only."""
        rates: dict[int, dict[str, float]] = {}
        dt = 1.0
        if self._prev_proc_ts is not None:
            dt = max(0.05, now - self._prev_proc_ts)
        current: dict[int, tuple[int, int]] = {}
        targets = pids or set()
        # Also keep previously seen pids briefly
        targets |= set(self._prev_proc_io.keys())
        for pid in list(targets)[:200]:
            if not pid or pid <= 0:
                continue
            try:
                p = psutil.Process(pid)
                io = p.io_counters()
                if io is None:
                    continue
                pair = (int(io.read_bytes), int(io.write_bytes))
                current[pid] = pair
                prev = self._prev_proc_io.get(pid)
                if prev is not None:
                    rates[pid] = {
                        "bps_down": max(0.0, (pair[0] - prev[0]) / dt),
                        "bps_up": max(0.0, (pair[1] - prev[1]) / dt),
                    }
            except (psutil.Error, OSError, AttributeError):
                continue
        self._prev_proc_io = current
        self._prev_proc_ts = now
        return rates

    def poll(self) -> Snapshot:
        now = time.time()
        if now >= self._baseline_until:
            self._baseline_ready = True

        events: list[dict[str, Any]] = []
        proc_cache: dict[int, dict[str, Any]] = {}
        connections: list[dict[str, Any]] = []
        flow_map: dict[tuple[Any, ...], dict[str, Any]] = {}

        nic = self._nic_rates(now)

        try:
            conns = psutil.net_connections(kind="inet")
        except (psutil.Error, OSError, PermissionError) as exc:
            self._last_error = str(exc)
            conns = []

        pids_seen: set[int] = set()
        for c in conns:
            try:
                pid = c.pid
                if pid:
                    pids_seen.add(int(pid))
            except (TypeError, ValueError):
                pass

        try:
            from modules import net_rates as mod_rates

            # Prefer scoped rates via local method (faster than all-process iter)
            proc_rates = self._process_net_rates(now, pids_seen)
            nic["rate_source"] = mod_rates.rate_source()
            nic["rate_meta"] = mod_rates.meta()
        except Exception:
            proc_rates = self._process_net_rates(now, pids_seen)
            nic["rate_source"] = "approx"

        geo_budget = 25
        geo_done: set[str] = set()

        for c in conns:
            try:
                pid = c.pid
                meta = self._proc_info(pid, proc_cache)
                status = (c.status or "") if hasattr(c, "status") else ""
                proto = _proto_label(c)
                laddr = _fmt_addr(c.laddr)
                raddr = _fmt_addr(c.raddr)
                rip = getattr(getattr(c, "raddr", None), "ip", "") or ""
                rport = getattr(getattr(c, "raddr", None), "port", None)
                lport = getattr(getattr(c, "laddr", None), "port", None)

                row = {
                    "proto": proto,
                    "laddr": laddr,
                    "raddr": raddr,
                    "status": status,
                    "pid": pid or 0,
                    "name": meta["name"],
                    "path": meta["path"],
                    "loose": meta["loose"],
                    "remote_ip": rip,
                    "remote_port": int(rport) if rport is not None else 0,
                    "local_port": int(lport) if lport is not None else 0,
                    "outbound": bool(rip) and not _is_private_or_local(str(rip)),
                    "listening": status.upper() == "LISTEN" or (proto == "UDP" and not rip),
                    "country": None,
                    "country_name": None,
                }
                if row["outbound"] and rip and rip not in geo_done and len(geo_done) < geo_budget:
                    geo_done.add(str(rip))
                    try:
                        from modules import geoip as mod_geo

                        g = mod_geo.lookup(str(rip))
                        row["country"] = g.get("country")
                        row["country_name"] = g.get("country_name")
                    except Exception:
                        pass
                connections.append(row)

                key = (row["pid"], proto, rip or "", int(rport or 0), status.upper())
                if key not in flow_map:
                    pr = proc_rates.get(row["pid"] or -1, {})
                    flow_map[key] = {
                        **row,
                        "bps_up": float(pr.get("bps_up") or 0.0),
                        "bps_down": float(pr.get("bps_down") or 0.0),
                        "count": 1,
                    }
                else:
                    flow_map[key]["count"] += 1

                if row["outbound"] and rip:
                    self._dest_window.append((now, str(rip), row["pid"] or 0))

                identity = f"{meta['path']}|{meta['name']}".lower()
                if identity.strip("|") and identity not in self._seen_procs:
                    self._seen_procs.add(identity)
                    if self._baseline_ready and row["outbound"]:
                        events.append(
                            {
                                "rule": "new_network_process",
                                "severity": "warn",
                                "pid": row["pid"],
                                "name": meta["name"],
                                "path": meta["path"],
                                "detail": f"Nouveau processus réseau: {meta['name'] or pid}",
                                "remote": raddr,
                            }
                        )
            except (AttributeError, TypeError, ValueError):
                continue

        # Prune dest window (30s)
        cutoff = now - 30.0
        while self._dest_window and self._dest_window[0][0] < cutoff:
            self._dest_window.popleft()

        flows = list(flow_map.values())
        flows.sort(
            key=lambda f: (
                -(float(f.get("bps_up") or 0) + float(f.get("bps_down") or 0)),
                (f.get("name") or "").lower(),
            )
        )

        by_pid: dict[int, dict[str, Any]] = {}
        for f in flows:
            pid = int(f.get("pid") or 0)
            if pid <= 0:
                continue
            slot = by_pid.setdefault(
                pid,
                {
                    "pid": pid,
                    "name": f.get("name") or "",
                    "path": f.get("path") or "",
                    "bps_up": 0.0,
                    "bps_down": 0.0,
                    "flows": 0,
                },
            )
            slot["bps_up"] = max(slot["bps_up"], float(f.get("bps_up") or 0))
            slot["bps_down"] = max(slot["bps_down"], float(f.get("bps_down") or 0))
            slot["flows"] += 1
        tops = sorted(
            by_pid.values(),
            key=lambda x: -(x["bps_up"] + x["bps_down"]),
        )[:15]

        # Skip reverse DNS in hot path (use DNS cache panel instead)
        for f in flows:
            f.setdefault("hostname", "")

        stats = {
            "connection_count": len(connections),
            "flow_count": len(flows),
            "outbound_count": sum(1 for c in connections if c.get("outbound")),
            "listen_count": sum(1 for c in connections if c.get("listening")),
            "unique_remotes_30s": len({ip for _, ip, _ in self._dest_window}),
            "baseline_ready": self._baseline_ready,
            "error": self._last_error,
        }

        snap = Snapshot(
            ts=now,
            connections=connections,
            flows=flows,
            nic=nic,
            tops=tops,
            stats=stats,
            events=events,
        )
        self._history.append(snap)
        return snap

    def history_nic(self, limit: int = 60) -> list[dict[str, Any]]:
        items = list(self._history)[-max(1, min(limit, 300)) :]
        return [
            {
                "ts": s.ts,
                "bps_up": float(s.nic.get("bps_up") or 0),
                "bps_down": float(s.nic.get("bps_down") or 0),
            }
            for s in items
        ]

    def dest_fanout_by_pid(self, window_s: float = 30.0) -> dict[int, int]:
        now = time.time()
        cutoff = now - window_s
        seen: dict[int, set[str]] = {}
        for ts, ip, pid in self._dest_window:
            if ts < cutoff or pid <= 0:
                continue
            seen.setdefault(pid, set()).add(ip)
        return {pid: len(ips) for pid, ips in seen.items()}

    def to_dict(self, snap: Snapshot | None = None) -> dict[str, Any]:
        s = snap or (self._history[-1] if self._history else self.poll())
        return {
            "ok": True,
            "ts": s.ts,
            "connections": s.connections,
            "flows": s.flows,
            "nic": s.nic,
            "tops": s.tops,
            "stats": s.stats,
            "events": s.events,
            "history": self.history_nic(60),
            "fanout": self.dest_fanout_by_pid(30.0),
        }
