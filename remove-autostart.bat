@echo off
REM ============================================================
REM   Aternos AFK bot - remove "start at login".
REM
REM   Double-click this file once to undo install-autostart.bat.
REM   It only removes the shortcut; the bot and your settings
REM   are left exactly as they are.
REM ============================================================
setlocal
title Aternos AFK bot - remove autostart

set "AFK_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AFK Bot.lnk"

if not exist "%AFK_LNK%" (
  echo.
  echo   Nothing to remove - the bot is not set to start at login.
  echo.
  pause
  exit /b 0
)

del /f /q "%AFK_LNK%"

if exist "%AFK_LNK%" (
  echo.
  echo   [!] The shortcut could not be deleted. Remove it by hand:
  echo       press Win+R, type shell:startup, and delete "AFK Bot".
  echo.
) else (
  echo.
  echo   Done - the bot will no longer start when you log in.
  echo   Nothing else changed: double-click start.bat to run it by hand.
  echo.
)

pause
