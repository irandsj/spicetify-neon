@echo off
title NeonDrift - Spotify
rem Re-applies Spicetify (theme and extensions) if Spotify updated itself, then opens Spotify.
rem Reaplica o Spicetify (tema e extensoes) se o Spotify se atualizou e abre o Spotify.
rem Switches are passed on: -DryRun only checks, -NoLaunch does not open Spotify, -Force re-applies anyway.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0neondrift-startup.ps1" %*
if errorlevel 1 (pause) else ("%SystemRoot%\System32\timeout.exe" /t 5 >nul)
