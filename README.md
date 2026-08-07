# Hub-Reseau — L'Atelier PC Command

Hub catégorie — Couche B + H7 native + flatten `host.py` / `backend/`.

## Modules

| Module | Rôle |
|--------|------|
| NetAdmin | Adaptateurs, hosts, firewall |
| NetMap | Connexions · ping · proxy · partages |
| RoadWay-X | Trafic live · alertes |
| WifiKey | Profils Wi-Fi (ConfirmGate) |

## Lancer

```bat
Lancer.cmd
```

Nécessite Python + `pywebview` (+ deps hub). Admin hérité du launcher ; UAC aussi dans `main()`.

## Structure

```text
host.py                 # entry + UAC + webview
backend/
  bridge.py             # Api + namespaces
  security.py / window_chrome.py / suite_launch.py
  tools/                # logique métier
ui/                     # pas de ui/embedded/
```

Titres HWND : `L'Atelier PC Command — Réseau` / `[Module|Segment]`.
