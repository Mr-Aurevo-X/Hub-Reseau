:: Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
:: SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
:: Author: Mr-Aurevo-X

@echo off
REM Mr-Aurevo-X-LAUNCHER-ID: Mr-Aurevo-X
cd /d "%~dp0"
if not exist "host.py" (
  echo [PC Command] host.py manquant dans %cd%
  pause
  exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
  echo [PC Command] Python introuvable dans le PATH.
  pause
  exit /b 1
)
REM Prefer pythonw (no console). On failure, re-run with python to show the error.
pythonw host.py %*
if errorlevel 1 (
  echo.
  echo [PC Command] Echec - relance avec console pour voir l'erreur:
  python host.py %*
  echo.
  pause
  exit /b 1
)