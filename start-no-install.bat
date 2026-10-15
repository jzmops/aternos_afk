@echo off
REM ============================================================
REM   Aternos AFK bot - start WITHOUT installing Node.js.
REM
REM   The first run downloads an official Windows build of
REM   Node.js into the runtime folder next to this file and
REM   runs the bot with it. Nothing is installed system-wide,
REM   no Administrator rights are needed, and nothing outside
REM   this folder is changed.
REM
REM   Already have Node.js? Double-click start.bat instead.
REM ============================================================
setlocal EnableExtensions
title Aternos AFK bot - no install needed
cd /d "%~dp0"

REM Bump this line when you want a newer Node.js.
set "AFK_NODE_VERSION=v24.22.0"

set "AFK_RUNTIME=%~dp0runtime"
set "AFK_ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "AFK_ARCH=arm64"
set "AFK_URL=https://nodejs.org/dist/%AFK_NODE_VERSION%/node-%AFK_NODE_VERSION%-win-%AFK_ARCH%.zip"
set "AFK_ZIP=%TEMP%\afk-node-%AFK_ARCH%.zip"

set "AFK_NEED=1"
if exist "%AFK_RUNTIME%\node.exe" set "AFK_NEED=0"

REM Which tool does the download? Answered up here, because a value set inside a
REM bracket block is not visible to the same block.
set "AFK_DOWNLOADER=curl"
where curl >nul 2>nul
if errorlevel 1 set "AFK_DOWNLOADER=powershell"

if "%AFK_NEED%"=="1" (
  echo.
  echo   Node.js is not installed, so this will download an official copy
  echo   of Node.js %AFK_NODE_VERSION% for Windows %AFK_ARCH% - about 36 MB -
  echo   into the runtime folder. It is a one-off download and nothing is
  echo   installed system-wide.
  echo.

  if "%AFK_DOWNLOADER%"=="curl" (
    curl -L --fail -# -o "%AFK_ZIP%" "%AFK_URL%"
  ) else (
    powershell -NoProfile -Command "Invoke-WebRequest -Uri '%AFK_URL%' -OutFile '%AFK_ZIP%'"
  )

  if errorlevel 1 (
    echo.
    echo   [!] The download failed. Check that this PC is online, then
    echo       double-click this file again.
    echo.
    del /f /q "%AFK_ZIP%" 2>nul
    pause
    exit /b 1
  )

  REM Unpack it, then leave the contents directly in runtime, because the
  REM archive wraps them in a node-version-win folder. Two ways are tried -
  REM the built-in tar, then PowerShell - and the result is checked either way.
  echo   Unpacking...
  rmdir /s /q "%AFK_RUNTIME%" 2>nul
  mkdir "%AFK_RUNTIME%" 2>nul
  tar -xf "%AFK_ZIP%" -C "%AFK_RUNTIME%" --strip-components=1 2>nul

  if not exist "%AFK_RUNTIME%\node.exe" (
    rmdir /s /q "%AFK_RUNTIME%" 2>nul
    mkdir "%AFK_RUNTIME%" 2>nul
    powershell -NoProfile -Command "Expand-Archive -LiteralPath '%AFK_ZIP%' -DestinationPath '%AFK_RUNTIME%' -Force; $inner = Get-ChildItem -LiteralPath '%AFK_RUNTIME%' -Directory | Select-Object -First 1; if ($inner) { Get-ChildItem -LiteralPath $inner.FullName -Force | Move-Item -Destination '%AFK_RUNTIME%' -Force }"
  )

  del /f /q "%AFK_ZIP%" 2>nul

  if not exist "%AFK_RUNTIME%\node.exe" (
    echo.
    echo   [!] Could not unpack the download, so nothing was installed.
    echo       Install Node.js from https://nodejs.org and use start.bat.
    echo.
    rmdir /s /q "%AFK_RUNTIME%" 2>nul
    pause
    exit /b 1
  )

  echo.
  echo   Done. The bot will use the private copy of Node.js in the runtime
  echo   folder from now on, and this download will not happen again.
  echo.
)

REM The private runtime goes first on PATH so the bot's "npm ci" step finds the
REM npm that comes with it.
set "PATH=%AFK_RUNTIME%;%PATH%"

"%AFK_RUNTIME%\node.exe" "%~dp0scripts\launch.js" %*

echo.
echo   The bot has stopped. You can close this window.
pause
