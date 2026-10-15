@echo off
REM ============================================================
REM   Aternos AFK bot - Windows one-click start.
REM
REM   Double-click this file. It uses the copy of Node.js in the
REM   runtime folder next to it when there is one - the
REM   ready-to-run download brings one - and otherwise the
REM   Node.js installed on this PC. Then it downloads the bot's
REM   parts on the first run, starts the bot and opens the
REM   dashboard for you.
REM ============================================================
setlocal
title Aternos AFK bot
cd /d "%~dp0"

REM The ready-to-run download carries its own copy of Node.js. Prefer it: it is
REM the exact version the bot's parts were installed with, so nothing has to be
REM installed on this PC at all.
set "AFK_NODE="
if exist "%~dp0runtime\node.exe" set "PATH=%~dp0runtime;%PATH%"
if exist "%~dp0runtime\node.exe" set "AFK_NODE=%~dp0runtime\node.exe"

REM Otherwise fall back to the Node.js installed on this PC.
if not defined AFK_NODE where node >nul 2>nul
if not defined AFK_NODE if not errorlevel 1 set "AFK_NODE=node"

if not defined AFK_NODE (
  echo.
  echo   Node.js is not installed yet - or it was installed without
  echo   ticking the "Add to PATH" box - and there is no runtime folder
  echo   next to this file either.
  echo.
  echo   1. Your browser is opening https://nodejs.org
  echo   2. Download the LTS version and install it
  echo   3. Tick the box that says "Add to PATH" during setup
  echo   4. Restart this PC, then double-click start.bat again
  echo.
  echo   Rather not install Node.js at all? Double-click
  echo   start-no-install.bat instead - it brings its own copy.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

"%AFK_NODE%" "%~dp0scripts\launch.js" %*

echo.
echo   The bot has stopped. You can close this window.
pause
