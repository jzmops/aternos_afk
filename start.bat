@echo off
REM ============================================================
REM   Aternos AFK bot - Windows one-click start.
REM   Double-click this file. It checks that Node.js is
REM   installed, downloads the bot's parts on the first run,
REM   then starts the bot and opens the dashboard for you.
REM ============================================================
setlocal
title Aternos AFK bot
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet - or it was installed without
  echo   ticking the "Add to PATH" box.
  echo.
  echo   1. Your browser is opening https://nodejs.org
  echo   2. Download the LTS version and install it
  echo   3. Tick the box that says "Add to PATH" during setup
  echo   4. Restart this PC, then double-click start.bat again
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

node "%~dp0scripts\launch.js"

echo.
echo   The bot has stopped. You can close this window.
pause
