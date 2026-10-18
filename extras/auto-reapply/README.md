# Spotify update helper (Windows)

Applies Spicetify again after Spotify updates itself, at every Windows sign-in, then opens Spotify (or only fixes).
Works with any Spicetify setup.

- `install.bat`: install for this Windows user. It asks whether to open Spotify at sign-in. From a terminal in this
  folder, `.\install.bat -NoLaunch` only fixes: Spotify is opened again only if it had to be closed.
- `uninstall.bat`: remove it (a copy is also in `%LOCALAPPDATA%\NeonDrift`).
- `Open Spotify (NeonDrift).bat`: check and fix right away, then open Spotify. To only check, in Command Prompt or
  PowerShell: `cmd /c call "%LOCALAPPDATA%\NeonDrift\Open Spotify (NeonDrift).bat" -DryRun`.
- `neondrift-startup.ps1`: the helper itself (`Get-Help .\neondrift-startup.ps1 -Full` lists its options).

Recommended for NeonDrift: `spicetify config check_spicetify_update 0`, so that the helper never runs
`spicetify update` (which can move you to Spicetify 3). Uninstall the helper before `spicetify restore`, or it applies
Spicetify again at the next sign-in.

What it does, privacy, log: [README](../../README.md#keep-neondrift-after-spotify-updates-windows).

**Em português:** ajudante que reaplica o Spicetify depois das atualizações do Spotify, em todo login do Windows.
Dois cliques em `install.bat` para instalar, `uninstall.bat` para tirar (`.\install.bat -NoLaunch`: só conserta; só
reabre o Spotify se precisou fechá-lo). Recomendado: `spicetify config check_spicetify_update 0`. Desinstale antes de
um `spicetify restore`. Detalhes no
[README em português](../../README.pt-BR.md#manter-o-neondrift-depois-das-atualizações-do-spotify-windows).
