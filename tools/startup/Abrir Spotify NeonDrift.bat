@echo off
title NeonDrift - Spotify
rem Checa se o Spotify atualizou, reaplica o Spicetify (tema + extensao) se precisar e abre o Spotify.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0neondrift-startup.ps1"
timeout /t 5 >nul
