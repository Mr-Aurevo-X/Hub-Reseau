# Hub-Reseau — L'Atelier PC Command

Hub catégorie — Couche B + H7 native + flatten `host.py` / `backend/`.

## Aperçu

| Accueil | Module |
|---------|--------|
| ![Dashboard](docs/screenshots/dashboard.png) | ![NetMap](docs/screenshots/netmap.png) |

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

`_source_apps/` = clones référence des anciennes mini-apps (non shippés). SoT runtime = `backend/tools/`.

## Soutien

Coups de pouce volontaires (PC Command reste gratuit) :

[![PayPal](https://img.shields.io/badge/PayPal-Donate-39ff14?style=for-the-badge&logo=paypal&logoColor=00f0ff&labelColor=050807)](https://www.paypal.com/paypalme/aurevo1)
[![Revolut](https://img.shields.io/badge/Revolut-mr__aurevo__x-00f0ff?style=for-the-badge&logo=revolut&logoColor=39ff14&labelColor=050807)](https://revolut.me/mr_aurevo_x)
