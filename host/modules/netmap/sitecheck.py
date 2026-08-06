"""SiteCheck — HTTP/HTTPS site health (absorbed into NetMap)."""

from __future__ import annotations

import json
import os
import re
import socket
import ssl
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


DEFAULT_ACCENT = "#e03545"
ENV_ACCENT = "MRAUREVOX_ACCENT"
ENV_LANG = "MRAUREVOX_LANG"
USER_AGENT = "Mr-Aurevo-X-SiteCheck/1.0"
WEBSITE_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
)
HTTP_TIMEOUT = 20
TCP_TIMEOUT = 8
MAX_REDIRECTS = 8
MAX_HISTORY = 120




def _local_appdata() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(local) / "Mr-Aurevo-X"


def data_dir() -> Path:
    path = _local_appdata() / "SiteCheck"
    path.mkdir(parents=True, exist_ok=True)
    return path



def resolve_suite_language(default: str = "fr") -> str:
    env = (os.environ.get(ENV_LANG) or "").strip().lower()
    if env in ("fr", "en"):
        return env
    path = _local_appdata() / "user-settings.json"
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            lang = str((loaded or {}).get("language") or "").strip().lower()
            if lang in ("fr", "en"):
                return lang
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return default if default in ("fr", "en") else "fr"


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _load_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError, TypeError):
        return default


def _save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def normalize_url(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        raise ValueError("URL requise")
    if len(text) > 2048:
        raise ValueError("URL trop longue")
    if re.search(r"[\s<>\"'`]", text):
        raise ValueError("URL invalide")
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", text):
        text = "https://" + text
    parsed = urlparse(text)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Seuls http et https sont supportés")
    if not parsed.netloc:
        raise ValueError("Nom d'hôte manquant")
    host = parsed.hostname or ""
    if not host or len(host) > 253:
        raise ValueError("Hôte invalide")
    if re.search(r"[^\w.\-:\[\]]", host):
        raise ValueError("Hôte invalide")
    return text


def _host_port(parsed) -> tuple[str, int]:
    host = parsed.hostname or ""
    if parsed.port:
        return host, int(parsed.port)
    return host, 443 if parsed.scheme == "https" else 80


def _dns_lookup(host: str) -> dict[str, Any]:
    t0 = time.perf_counter()
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        ips: list[str] = []
        for info in infos:
            addr = info[4][0]
            if addr not in ips:
                ips.append(addr)
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": True, "ips": ips[:8], "ms": ms, "error": None}
    except socket.gaierror as exc:
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "ips": [], "ms": ms, "error": str(exc)}


def _tcp_probe(host: str, port: int) -> dict[str, Any]:
    t0 = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=TCP_TIMEOUT):
            ms = int((time.perf_counter() - t0) * 1000)
            return {"ok": True, "ms": ms, "error": None}
    except OSError as exc:
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "ms": ms, "error": str(exc)}


def _ssl_info(host: str, port: int = 443) -> dict[str, Any]:
    t0 = time.perf_counter()
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=TCP_TIMEOUT) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert() or {}
        ms = int((time.perf_counter() - t0) * 1000)
        subject = dict(x[0] for x in cert.get("subject", ())) if cert else {}
        issuer = dict(x[0] for x in cert.get("issuer", ())) if cert else {}
        not_after = cert.get("notAfter")
        days_left = None
        if not_after:
            try:
                exp = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                days_left = (exp - datetime.utcnow()).days
            except ValueError:
                pass
        return {
            "ok": True,
            "ms": ms,
            "subject": subject.get("commonName") or subject.get("CN") or "",
            "issuer": issuer.get("organizationName") or issuer.get("O") or "",
            "notAfter": not_after,
            "daysLeft": days_left,
            "error": None,
        }
    except Exception as exc:
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "ms": ms, "subject": "", "issuer": "", "notAfter": None, "daysLeft": None, "error": str(exc)}


def _cloudflare_trace(base_url: str) -> dict[str, str] | None:
    """Try to query /cdn-cgi/trace to detect Cloudflare colo/region hints."""
    try:
        trace_url = base_url.rstrip("/") + "/cdn-cgi/trace"
        req_headers = {
            "User-Agent": WEBSITE_UA,
            "Accept": "text/plain,*/*;q=0.8",
            "Connection": "close",
        }
        req = Request(trace_url, method="GET", headers=req_headers)
        with urlopen(req, timeout=12) as resp:
            if int(getattr(resp, "status", 0) or 0) not in (0, 200):
                return None
            text = resp.read(8192).decode("utf-8", errors="replace")
        out: dict[str, str] = {}
        for line in (text or "").splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
        return out or None
    except Exception:
        return None


def _colo_to_region(colo: str | None) -> str | None:
    c = str(colo or "").upper()
    if not c:
        return None

    eu = [
        "AMS",
        "FRA",
        "LHR",
        "CDG",
        "DUB",
        "MAD",
        "BCN",
        "BER",
        "MUC",
        "VIE",
        "ZRH",
        "LIS",
        "CPH",
        "IST",
        "HEL",
        "OSL",
        "MAN",
        "ATH",
    ]
    us = [
        "LAX",
        "SFO",
        "SJC",
        "IAD",
        "JFK",
        "EWR",
        "ORD",
        "DFW",
        "SEA",
        "DEN",
        "PHX",
        "ATL",
        "MIA",
        "BOS",
        "DTW",
        "IAH",
        "LAS",
    ]
    oceania = [
        "SYD",
        "MEL",
        "PER",
        "AKL",
        "WLG",
    ]

    if any(m in c for m in eu):
        return "eu"
    if any(m in c for m in us):
        return "us"
    if any(m in c for m in oceania):
        return "oceania"
    return None


def _http_probe(url: str, method: str = "GET", browser_headers: bool = False) -> dict[str, Any]:
    redirects: list[dict[str, Any]] = []
    current = url
    t0 = time.perf_counter()
    status = None
    headers: dict[str, str] = {}
    body_preview = ""
    final_url = url
    error = None

    try:
        for _ in range(MAX_REDIRECTS + 1):
            req_headers = {"User-Agent": WEBSITE_UA if browser_headers else USER_AGENT, "Accept": "*/*"}
            if browser_headers:
                req_headers.update(
                    {
                        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
                        "Accept-Encoding": "gzip, deflate",
                        "Connection": "close",
                    }
                )
            req = Request(current, method=method, headers=req_headers)
            try:
                with urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                    status = int(getattr(resp, "status", None) or resp.getcode())
                    final_url = resp.geturl() or current
                    headers = {k: v for k, v in resp.headers.items()}
                    if method == "GET":
                        chunk = resp.read(4096)
                        try:
                            body_preview = chunk.decode("utf-8", errors="replace")[:500]
                        except Exception:
                            body_preview = ""
                    loc = headers.get("Location") or headers.get("location")
                    if status in (301, 302, 303, 307, 308) and loc:
                        nxt = urljoin(current, loc)
                        redirects.append({"from": current, "status": status, "to": nxt})
                        current = nxt
                        continue
                    break
            except HTTPError as exc:
                status = int(exc.code)
                final_url = exc.geturl() or current
                headers = {k: v for k, v in (exc.headers.items() if exc.headers else [])}
                loc = headers.get("Location") or headers.get("location")
                if status in (301, 302, 303, 307, 308) and loc:
                    nxt = urljoin(current, loc)
                    redirects.append({"from": current, "status": status, "to": nxt})
                    current = nxt
                    continue
                error = str(exc.reason or exc)
                break
        ms = int((time.perf_counter() - t0) * 1000)
        server_hdr = str(headers.get("Server") or headers.get("server") or "")
        body_lc = (body_preview or "").lower()
        cloudflare = bool(
            status in (403, 503, 429)
            and (
                "cloudflare" in server_hdr.lower()
                or _header_has(headers, "cf-mitigated")
                or _header_has(headers, "cf-ray")
                or "just a moment" in body_lc
                or "checking your browser" in body_lc
                or "challenge-platform" in body_lc
                or "cf-browser-verification" in body_lc
                or "cf-challenge" in body_lc
                or "attention required" in body_lc
                or "cloudflare" in body_lc
            )
        )
        return {
            "ok": status is not None and status < 500,
            "status": status,
            "ms": ms,
            "finalUrl": final_url,
            "redirects": redirects,
            "headers": headers,
            "bodyPreview": body_preview,
            "error": error,
            "cloudflareChallenge": cloudflare,
        }
    except URLError as exc:
        ms = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": False,
            "status": status,
            "ms": ms,
            "finalUrl": final_url,
            "redirects": redirects,
            "headers": headers,
            "bodyPreview": "",
            "error": str(exc.reason or exc),
            "cloudflareChallenge": False,
        }
    except Exception as exc:
        ms = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": False,
            "status": status,
            "ms": ms,
            "finalUrl": final_url,
            "redirects": redirects,
            "headers": headers,
            "bodyPreview": "",
            "error": str(exc),
            "cloudflareChallenge": False,
        }


def _header_has(headers: dict[str, str], name: str) -> bool:
    target = name.lower()
    return any(str(k).lower() == target for k in (headers or {}))


def _compute_confidence(
    steps: dict[str, Any],
    http: dict[str, Any],
    ssl_result: dict[str, Any] | None,
    verdict_code: str,
    lang: str,
) -> dict[str, str]:
    dns_ok = steps.get("dns", {}).get("ok")
    tcp_ok = steps.get("tcp", {}).get("ok")
    http_ok = steps.get("http", {}).get("ok")
    status = http.get("status")
    challenge = bool(http.get("cloudflareChallenge"))

    if not dns_ok or not tcp_ok:
        return {
            "level": "low",
            "label": "Faible" if lang == "fr" else "Low",
            "explain": (
                "Le site n'est pas joignable au niveau réseau (DNS ou port web). Le diagnostic est fiable pour « hors ligne »."
                if lang == "fr"
                else "The site is not reachable at network level (DNS or web port). Diagnosis is reliable for « offline »."
            ),
        }
    if challenge or verdict_code == "cloudflare":
        return {
            "level": "medium",
            "label": "Moyenne" if lang == "fr" else "Medium",
            "explain": (
                "Le serveur répond mais bloque l'accès automatisé (Cloudflare). Le site peut être opérationnel pour les visiteurs humains."
                if lang == "fr"
                else "The server responds but blocks automated access (Cloudflare). The site may work for human visitors."
            ),
        }
    if verdict_code in ("offline", "error") or status is None:
        return {
            "level": "low",
            "label": "Faible" if lang == "fr" else "Low",
            "explain": (
                "Connexion partielle : réseau OK mais HTTP en échec. Vérifiez certificat, timeout ou erreur serveur."
                if lang == "fr"
                else "Partial connection: network OK but HTTP failed. Check certificate, timeout or server error."
            ),
        }
    tls_ok = ssl_result is None or ssl_result.get("ok")
    if dns_ok and tcp_ok and tls_ok and http_ok and status and status < 400:
        return {
            "level": "high",
            "label": "Élevée" if lang == "fr" else "High",
            "explain": (
                "DNS, port web, TLS et HTTP OK sans challenge anti-bot. Le site est fonctionnel depuis votre connexion."
                if lang == "fr"
                else "DNS, web port, TLS and HTTP OK with no anti-bot challenge. Site is functional from your connection."
            ),
        }
    return {
        "level": "medium",
        "label": "Moyenne" if lang == "fr" else "Medium",
        "explain": (
            "Le site répond mais avec une anomalie (code 4xx, certificat bientôt expiré ou lenteur). L'hébergement est actif."
            if lang == "fr"
            else "The site responds but with an issue (4xx code, cert expiring soon or slow). Hosting is active."
        ),
    }


def _action_advice(code: str, lang: str) -> str:
    fr = {
        "offline": "Vérifiez l’URL, votre DNS local, puis si le domaine / l’hébergement est toujours actif.",
        "error": "Retentez plus tard. Si ça persiste : certificat, pare-feu, ou erreur côté serveur.",
        "cloudflare": "Ouvrez le site dans un navigateur. Comparez avec/sans VPN (onglet Route).",
        "degraded": "Le service répond : regardez le code HTTP et le certificat pour corriger la page ou le TLS.",
        "online": "Rien à faire — le site répond correctement depuis votre PC.",
    }
    en = {
        "offline": "Check the URL, your local DNS, then whether the domain / hosting is still active.",
        "error": "Retry later. If it persists: certificate, firewall, or server-side error.",
        "cloudflare": "Open the site in a browser. Compare with/without VPN (Route tab).",
        "degraded": "The service responds: check HTTP code and certificate to fix the page or TLS.",
        "online": "Nothing to do — the site responds correctly from your PC.",
    }
    pack = fr if lang == "fr" else en
    return pack.get(code, pack["error"])


def _verdict(steps: dict[str, Any], lang: str) -> dict[str, str]:
    dns_ok = steps.get("dns", {}).get("ok")
    tcp_ok = steps.get("tcp", {}).get("ok")
    http = steps.get("http", {})
    status = http.get("status")
    ssl_step = steps.get("ssl", {})
    days = ssl_step.get("daysLeft")

    if not dns_ok:
        return {
            "code": "offline",
            "label": "Hors ligne (DNS)" if lang == "fr" else "Offline (DNS)",
            "explain": (
                "Le nom de domaine ne se résout pas. Vérifiez l'orthographe, le DNS local, ou si le domaine existe encore."
                if lang == "fr"
                else "The domain name does not resolve. Check spelling, local DNS, or whether the domain still exists."
            ),
            "actionAdvice": _action_advice("offline", lang),
        }
    if not tcp_ok:
        return {
            "code": "offline",
            "label": "Hors ligne (réseau)" if lang == "fr" else "Offline (network)",
            "explain": (
                "Le serveur ne répond pas sur le port web. Site arrêté, pare-feu, ou mauvais port."
                if lang == "fr"
                else "The server does not answer on the web port. Site down, firewall, or wrong port."
            ),
            "actionAdvice": _action_advice("offline", lang),
        }
    if http.get("cloudflareChallenge"):
        return {
            "code": "cloudflare",
            "label": "Protégé (Cloudflare)" if lang == "fr" else "Protected (Cloudflare)",
            "explain": (
                "Votre PC atteint le serveur, mais Cloudflare renvoie un challenge anti-bot. "
                "Ce n’est pas forcément une panne : le site peut marcher dans un navigateur."
                if lang == "fr"
                else "Your PC reaches the server, but Cloudflare returns an anti-bot challenge. "
                "This is not necessarily downtime: the site may work in a browser."
            ),
            "actionAdvice": _action_advice("cloudflare", lang),
        }
    if status is None:
        return {
            "code": "error",
            "label": "Erreur HTTP" if lang == "fr" else "HTTP error",
            "explain": (
                "Connexion TCP OK mais la requête HTTP a échoué (timeout, reset, certificat)."
                if lang == "fr"
                else "TCP works but the HTTP request failed (timeout, reset, certificate)."
            ),
            "actionAdvice": _action_advice("error", lang),
        }
    if status >= 500:
        return {
            "code": "error",
            "label": f"Erreur serveur ({status})" if lang == "fr" else f"Server error ({status})",
            "explain": (
                "Le serveur a répondu mais signale une erreur interne (5xx). Le site est joignable mais défaillant."
                if lang == "fr"
                else "The server answered but reports an internal error (5xx). Reachable but broken."
            ),
            "actionAdvice": _action_advice("error", lang),
        }
    if status >= 400:
        return {
            "code": "degraded",
            "label": f"Accès refusé / introuvable ({status})" if lang == "fr" else f"Client error ({status})",
            "explain": (
                "Le serveur répond ; la page demandée n'est pas accessible (404, 403…). L'hébergement est actif."
                if lang == "fr"
                else "The server responds; the requested page is not available (404, 403…). Hosting is up."
            ),
            "actionAdvice": _action_advice("degraded", lang),
        }
    if days is not None and days < 14:
        return {
            "code": "degraded",
            "label": "En ligne — certificat bientôt expiré" if lang == "fr" else "Online — cert expiring soon",
            "explain": (
                f"Le site répond (HTTP {status}) mais le certificat TLS expire dans {days} jour(s)."
                if lang == "fr"
                else f"Site responds (HTTP {status}) but TLS certificate expires in {days} day(s)."
            ),
            "actionAdvice": _action_advice("degraded", lang),
        }
    if http.get("ms", 0) > 3000:
        return {
            "code": "degraded",
            "label": "En ligne — lent" if lang == "fr" else "Online — slow",
            "explain": (
                f"Le site répond (HTTP {status}) mais la latence est élevée ({http.get('ms')} ms)."
                if lang == "fr"
                else f"Site responds (HTTP {status}) but latency is high ({http.get('ms')} ms)."
            ),
            "actionAdvice": _action_advice("degraded", lang),
        }
    return {
        "code": "online",
        "label": f"En ligne (HTTP {status})" if lang == "fr" else f"Online (HTTP {status})",
        "explain": (
            "DNS, port web et HTTP OK. Le site est actif depuis votre machine."
            if lang == "fr"
            else "DNS, web port and HTTP OK. The site is active from your PC."
        ),
        "actionAdvice": _action_advice("online", lang),
    }


def run_site_check(url: str, lang: str = "fr") -> dict[str, Any]:
    start_url = normalize_url(url)
    parsed = urlparse(start_url)
    host, port = _host_port(parsed)
    lang = "en" if lang == "en" else "fr"

    dns = _dns_lookup(host)
    primary_ip = dns["ips"][0] if dns.get("ips") else host
    tcp = _tcp_probe(primary_ip if dns.get("ok") else host, port)

    ssl_result: dict[str, Any] | None = None
    if parsed.scheme == "https":
        ssl_result = _ssl_info(host, port if port != 80 else 443)

    http = _http_probe(start_url, "HEAD" if parsed.scheme == "https" else "GET", browser_headers=True)
    if http.get("status") is None or http.get("status") == 405:
        http = _http_probe(start_url, "GET", browser_headers=True)

    # If Cloudflare challenge is detected, try to infer which edge is serving us.
    cf_trace: dict[str, str] | None = None
    cf_region: str | None = None
    try:
        server_hdr = str((http.get("headers") or {}).get("Server") or "")
        if http.get("cloudflareChallenge") or "cloudflare" in server_hdr.lower():
            base_url = f"{parsed.scheme}://{parsed.hostname}"
            cf_trace = _cloudflare_trace(base_url)
            cf_region = _colo_to_region((cf_trace or {}).get("colo"))
    except Exception:
        cf_trace = None
        cf_region = None

    steps = {
        "dns": {
            "id": "dns",
            "ok": dns["ok"],
            "title": "DNS",
            "detail": ", ".join(dns["ips"]) if dns["ok"] else (dns.get("error") or "—"),
            "ms": dns.get("ms"),
            "explainFr": "Résolution du nom de domaine en adresse IP.",
            "explainEn": "Resolves the domain name to an IP address.",
        },
        "tcp": {
            "id": "tcp",
            "ok": tcp["ok"],
            "title": f"TCP {port}",
            "detail": f"{primary_ip}:{port}" if tcp["ok"] else (tcp.get("error") or "—"),
            "ms": tcp.get("ms"),
            "explainFr": "Teste si le port web accepte une connexion.",
            "explainEn": "Tests whether the web port accepts a connection.",
        },
    }
    if ssl_result is not None:
        cert_line = ssl_result.get("subject") or "—"
        if ssl_result.get("daysLeft") is not None:
            cert_line += f" · {ssl_result['daysLeft']}j"
        steps["ssl"] = {
            "id": "ssl",
            "ok": ssl_result["ok"],
            "title": "TLS / certificat",
            "detail": cert_line if ssl_result["ok"] else (ssl_result.get("error") or "—"),
            "ms": ssl_result.get("ms"),
            "daysLeft": ssl_result.get("daysLeft"),
            "notAfter": ssl_result.get("notAfter"),
            "issuer": ssl_result.get("issuer"),
            "explainFr": "Vérifie le certificat HTTPS (validité, expiration).",
            "explainEn": "Checks the HTTPS certificate (validity, expiry).",
        }

    status = http.get("status")
    http_detail = f"HTTP {status}" if status else (http.get("error") or "—")
    if http.get("finalUrl") and http["finalUrl"] != start_url:
        http_detail += f" → {http['finalUrl']}"
    steps["http"] = {
        "id": "http",
        "ok": bool(http.get("ok") and status and status < 400),
        "title": "HTTP",
        "detail": http_detail,
        "ms": http.get("ms"),
        "status": status,
        "cloudflareChallenge": bool(http.get("cloudflareChallenge")),
        "explainFr": "Envoie une requête HTTP et lit le code de statut (200, 301, 404…).",
        "explainEn": "Sends an HTTP request and reads the status code (200, 301, 404…).",
    }

    verdict = _verdict({**steps, "ssl": ssl_result or {}, "http": http}, lang)
    checked_at = _now_iso()

    colo = (cf_trace or {}).get("colo") if cf_trace else None
    server_hdr = str((http.get("headers") or {}).get("Server") or "")
    cf_detected = bool(
        http.get("cloudflareChallenge")
        or "cloudflare" in server_hdr.lower()
        or _header_has(http.get("headers") or {}, "cf-ray")
        or cf_trace
    )
    cloudflare_info = {
        "detected": cf_detected,
        "challenge": bool(http.get("cloudflareChallenge")),
        "colo": colo,
        "region": cf_region,
        "traceAvailable": bool(cf_trace),
    }
    confidence = _compute_confidence(steps, http, ssl_result, verdict.get("code") or "", lang)

    interesting_headers = {}
    for key in ("Server", "Content-Type", "Date", "Cache-Control", "Location"):
        for hk, hv in (http.get("headers") or {}).items():
            if hk.lower() == key.lower():
                interesting_headers[hk] = hv

    def _led_for(code: str | None) -> str:
        c = str(code or "")
        if c == "online":
            return "green"
        if c in ("degraded", "cloudflare"):
            return "orange"
        return "red"

    local_led = _led_for(verdict.get("code"))
    ms = http.get("ms") or 0

    if lang == "fr":
        local_detail = (
            f"Cloudflare · colo {colo}" if colo else ("Cloudflare détecté" if cf_detected else "Mesure depuis votre PC")
        )
        region_labels = {"eu": "Europe", "us": "Amériques", "oceania": "Océanie"}
        edge_detail = f"Edge confirmé via /cdn-cgi/trace{f' · colo={colo}' if colo else ''}"
    else:
        local_detail = (
            f"Cloudflare · colo {colo}" if colo else ("Cloudflare detected" if cf_detected else "Measured from your PC")
        )
        region_labels = {"eu": "Europe", "us": "Americas", "oceania": "Oceania"}
        edge_detail = f"Edge confirmed via /cdn-cgi/trace{f' · colo={colo}' if colo else ''}"

    # Honest regions: only local + confirmed Cloudflare edge (no fake EU/US/Oceania copies).
    regions = [
        {
            "id": "local",
            "label": "Votre PC" if lang == "fr" else "Your PC",
            "led": local_led,
            "ms": ms,
            "detail": local_detail,
            "confirmed": True,
        }
    ]
    if cf_region and colo:
        regions.append(
            {
                "id": cf_region,
                "label": region_labels.get(cf_region, cf_region),
                "led": local_led,
                "ms": ms,
                "detail": edge_detail,
                "confirmed": True,
            }
        )

    return {
        "ok": True,
        "url": start_url,
        "host": host,
        "checkedAt": checked_at,
        "verdict": verdict,
        "confidence": confidence,
        "cloudflare": cloudflare_info,
        "regions": regions,
        "steps": list(steps.values()),
        "redirects": http.get("redirects") or [],
        "headers": interesting_headers,
        "summary": {
            "statusCode": status,
            "responseMs": http.get("ms"),
            "finalUrl": http.get("finalUrl") or start_url,
            "ip": primary_ip,
            "certDaysLeft": (ssl_result or {}).get("daysLeft"),
        },
    }


class SiteCheckService:
    def __init__(self) -> None:
        self._window: Any = None
        self._watch_stop = threading.Event()
        self._watch_thread: threading.Thread | None = None
        self._watch_lock = threading.Lock()
        self._watch_results: dict[str, Any] = {}
        self._favorites_path = data_dir() / "favorites.json"
        self._history_path = data_dir() / "history.json"

    def set_window(self, window: Any = None) -> None:
        self._window = window

    def _load_favorites(self) -> list[dict]:
        data = _load_json(self._favorites_path, {"items": []})
        items = data.get("items") if isinstance(data, dict) else []
        return items if isinstance(items, list) else []

    def _save_favorites(self, items: list[dict]) -> None:
        _save_json(self._favorites_path, {"items": items})

    def _append_history(self, entry: dict) -> None:
        hist = _load_json(self._history_path, [])
        if not isinstance(hist, list):
            hist = []
        hist.insert(0, entry)
        _save_json(self._history_path, hist[:MAX_HISTORY])

    def get_favorites(self) -> dict:
        return {"ok": True, "items": self._load_favorites()}

    def add_favorite(self, url: str, label: str = "", interval_minutes: int = 0) -> dict:
        try:
            norm = normalize_url(url)
            items = self._load_favorites()
            if any(i.get("url") == norm for i in items):
                return {"ok": False, "error": "Déjà dans la liste"}
            item = {
                "id": str(uuid.uuid4()),
                "url": norm,
                "label": (label or "").strip() or norm,
                "intervalMinutes": max(0, min(int(interval_minutes or 0), 1440)),
                "createdAt": _now_iso(),
            }
            items.append(item)
            self._save_favorites(items)
            return {"ok": True, "item": item}
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}

    def remove_favorite(self, item_id: str) -> dict:
        items = [i for i in self._load_favorites() if i.get("id") != item_id]
        self._save_favorites(items)
        return {"ok": True}

    def get_history(self, limit: int = 40) -> dict:
        hist = _load_json(self._history_path, [])
        if not isinstance(hist, list):
            hist = []
        lim = max(1, min(int(limit or 40), MAX_HISTORY))
        return {"ok": True, "items": hist[:lim]}

    def check_site(self, url: str) -> dict:
        try:
            lang = resolve_suite_language()
            report = run_site_check(url, lang)
            self._append_history(
                {
                    "url": report["url"],
                    "checkedAt": report["checkedAt"],
                    "verdict": report["verdict"]["code"],
                    "label": report["verdict"]["label"],
                    "statusCode": report["summary"].get("statusCode"),
                    "responseMs": report["summary"].get("responseMs"),
                }
            )
            return report
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def check_all_favorites(self) -> dict:
        lang = resolve_suite_language()
        items = self._load_favorites()
        results: list[dict] = []
        for fav in items:
            try:
                rep = run_site_check(fav.get("url") or "", lang)
                row = {
                    "id": fav.get("id"),
                    "url": fav.get("url"),
                    "label": fav.get("label"),
                    "report": rep,
                }
                results.append(row)
            except Exception as exc:
                results.append(
                    {
                        "id": fav.get("id"),
                        "url": fav.get("url"),
                        "label": fav.get("label"),
                        "error": str(exc),
                    }
                )
        with self._watch_lock:
            self._watch_results = {"checkedAt": _now_iso(), "items": results}
        return {"ok": True, **self._watch_results}

    def get_watch_status(self) -> dict:
        with self._watch_lock:
            if not self._watch_results:
                return {"ok": True, "items": [], "checkedAt": None}
            return {"ok": True, **self._watch_results}

    def _watch_loop(self, interval_minutes: int) -> None:
        while not self._watch_stop.is_set():
            try:
                self.check_all_favorites()
            except Exception:
                pass
            self._watch_stop.wait(max(60, interval_minutes * 60))

    def start_watch(self, interval_minutes: int = 5) -> dict:
        interval = max(1, min(int(interval_minutes or 5), 60))
        self.stop_watch()
        self._watch_stop = threading.Event()
        self._watch_thread = threading.Thread(
            target=self._watch_loop, args=(interval,), daemon=True, name="SiteCheckWatch"
        )
        self._watch_thread.start()
        return {"ok": True, "intervalMinutes": interval}

    def stop_watch(self) -> dict:
        self._watch_stop.set()
        if self._watch_thread and self._watch_thread.is_alive():
            self._watch_thread.join(timeout=2)
        self._watch_thread = None
        return {"ok": True}


