# Security Policy — PC Command | Network

## Scope (EN)

**PC Command | Network** is a **local Windows** desktop hub (pywebview / WebView2, UAC admin).  
There is **no** Mr-Aurevo-X backend and **no** telemetry.

Outbound network (when it happens):
- **Optional** read-only GitHub **Latest release** check (opt-out in About)
- **Support links** (Discord / PayPal / Revolut) only when the user clicks
- **Module actions the user starts**, for example:
  - hosts / URLs / targets **you enter** (ping, SiteCheck, DNS, etc.)
  - Traffic **reputation** lookups **only if you enable** that option

Unused modules do not phone home.

Official builds: only Releases on **https://github.com/Mr-Aurevo-X/Hub-Reseau**  
Forks / modified copies are **not** covered by this policy.

## Périmètre (FR)

Hub **local** Windows (admin UAC). Pas de serveur Mr-Aurevo-X, pas de télémétrie.

Sorties réseau possibles :
- vérif. version GitHub **désactivable** (À propos)
- dons / Discord **au clic**
- actions **module** que **tu** lances : cibles / URL saisies · réputation Traffic **seulement si activée**

Module non utilisé = pas de sortie liée.

Builds officiels uniquement : Releases de ce dépôt. Les forks modifiés ne sont **pas** couverts.

## Threat model

**In scope:** issues in **this** repository’s code / official zip that could lead to unexpected network egress, path traversal, command injection, or privilege misuse **beyond** the intended admin UI.

**Out of scope:** malware already on the user’s machine, fake downloads from third parties, Windows / SmartScreen reputation on unsigned binaries, misuse of intentional network / admin features.

## Reporting / Signalement

Prefer a **private GitHub Security Advisory** on this repository.  
Do **not** open a public issue with exploit details.  
Préférez une **advisory privée** GitHub. Ne publiez pas de détails d’exploit en issue publique.

## Hardening (high level)

- Destructive / system-changing actions use confirmation (ConfirmGate) where applicable
- Support / release URLs are allowlisted in code
- Paths and process arguments are validated before use where applicable

## Dependencies

Review Dependabot / dependency alerts on this repo when enabled. No auto-install of updates in-app.
