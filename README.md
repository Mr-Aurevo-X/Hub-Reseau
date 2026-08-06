# Hub-Reseau — L'Atelier PC Command

Hub catégorie **Réseau** — **Vague H2 Couche B** (fusion in-process).

## Modules

| Module | Source fusionnée | ConfirmGate |
|--------|------------------|-------------|
| NetAdmin | NetAdmin | reset IP/Winsock, hosts, firewall, flush DNS |
| NetMap | NetMap | proxy env set/clear |
| RoadWay-X | Lab/RoadWay-X | kill process, block IP, startup |
| WifiKey | WifiKey | révélation clé Wi‑Fi |

Dashboard = KPIs lecture seule. Fallback « Fenêtre dédiée » via `suite_launch` encore disponible.

## Lancer

```bat
Lancer.cmd
```

Nécessite `pywebview` + `psutil`.
