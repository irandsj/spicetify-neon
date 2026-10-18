@echo off
title NeonDrift - Spotify update helper - install
rem Installs the helper for this Windows user: copies it to %LOCALAPPDATA%\NeonDrift and adds a
rem "NeonDrift Spotify" shortcut to the Startup folder. install.bat -NoLaunch: only fix at sign-in;
rem Spotify is opened again only if it had to be closed.
rem Instala o ajudante para este usuario do Windows. install.bat -NoLaunch: so conserta no login;
rem so reabre o Spotify se precisou fecha-lo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Ask %*
echo.
pause
