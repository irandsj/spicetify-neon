@echo off
title NeonDrift - Spotify update helper - uninstall
rem Removes the "NeonDrift Spotify" Startup shortcut and, if you say so, the helper files and the log.
rem Remove o atalho "NeonDrift Spotify" da inicializacao e, se voce quiser, os arquivos e o log.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" -Ask %*
echo.
pause
