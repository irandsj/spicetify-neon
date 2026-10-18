@echo off
title NeonDrift - Spotify update helper - uninstall
rem Removes the "NeonDrift Spotify" Startup shortcut and, if you say so, the helper files and the log.
rem Remove o atalho "NeonDrift Spotify" da inicializacao e, se voce quiser, os arquivos e o log.
rem One line after "(goto)": the copy of this file in the helper folder may delete itself, and cmd.exe
rem reads a batch file line by line. pushd: a folder cannot be deleted while it is the current one.
(goto) 2>nul & pushd "%TEMP%" & powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" -Ask %* & popd 2>nul & echo. & pause
