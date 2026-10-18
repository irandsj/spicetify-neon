# Spotify update helper (Windows)

Applies Spicetify again after Spotify updates itself, at every Windows sign-in, then opens Spotify (or only fixes).
Works with any Spicetify setup.

- `install.bat`: install for this Windows user (`install.bat -NoLaunch`: only fix, never open Spotify).
- `uninstall.bat`: remove it.
- `Open Spotify (NeonDrift).bat`: check and fix right away, then open Spotify (`-DryRun`: only check).
- `neondrift-startup.ps1`: the helper itself (`Get-Help .\neondrift-startup.ps1 -Full` lists its options).

What it does, privacy, log: [README](../../README.md#keep-neondrift-after-spotify-updates-windows).

**Em português:** ajudante que reaplica o Spicetify depois das atualizações do Spotify, em todo login do Windows.
Dois cliques em `install.bat` para instalar, `uninstall.bat` para tirar. Detalhes no
[README em português](../../README.pt-BR.md#manter-o-neondrift-depois-das-atualizações-do-spotify-windows).
