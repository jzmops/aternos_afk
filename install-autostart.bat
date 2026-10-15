@echo off
REM ============================================================
REM   Aternos AFK bot - install "start at login".
REM
REM   Double-click this file once. It puts a shortcut in your
REM   Windows Startup folder so the bot starts by itself every
REM   time you log in. No PM2 and no administrator rights.
REM
REM   To undo it, double-click remove-autostart.bat.
REM ============================================================
setlocal
title Aternos AFK bot - install autostart

REM Can the bot start at all? Either Node.js is installed on this PC, or the
REM ready-to-run download brought its own copy in runtime\. Without one of the
REM two the shortcut would do nothing useful, so nothing is changed.
set "AFK_HAS_NODE="
where node >nul 2>nul
if not errorlevel 1 set "AFK_HAS_NODE=1"
if not defined AFK_HAS_NODE if exist "%~dp0runtime\node.exe" set "AFK_HAS_NODE=1"

if not defined AFK_HAS_NODE (
  echo.
  echo   Node.js is not installed yet, and there is no runtime folder next to
  echo   this file either, so the bot could not start at login.
  echo.
  echo   Your browser is opening https://nodejs.org - install the LTS version,
  echo   then double-click this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\mineflayer" (
  echo.
  echo   Note: the bot's parts are not downloaded yet, so the first login will
  echo   spend about a minute fetching them. Double-click start.bat once now if
  echo   you would rather get that out of the way.
  echo.
)

REM The shortcut runs start.bat, the same file you would double-click - it uses
REM the bundled runtime when there is one. The --no-browser argument stops the
REM dashboard opening a tab at every login. Values are handed to PowerShell
REM through environment variables so that a path containing spaces cannot break
REM the command line.
set "AFK_TARGET=%~dp0start.bat"
set "AFK_DIR=%~dp0"

powershell -NoProfile -Command "$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'; $link = Join-Path $startup 'AFK Bot.lnk'; $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($link); $shortcut.TargetPath = $env:AFK_TARGET; $shortcut.Arguments = '--no-browser'; $shortcut.WorkingDirectory = $env:AFK_DIR; $shortcut.Save()"

set "AFK_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AFK Bot.lnk"

if exist "%AFK_LNK%" (
  echo.
  echo   Done - the bot will start by itself every time you log in.
  echo.
  echo   A black window appears at each login: that is the bot running, and
  echo   closing it stops the bot.
  echo.
  echo   To undo this, double-click remove-autostart.bat.
  echo.
) else (
  echo.
  echo   [!] The shortcut could not be created, so nothing was changed.
  echo       Leave this window open and send the text above for help.
  echo.
)

pause
