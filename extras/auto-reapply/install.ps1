<#
.SYNOPSIS
  Installs the NeonDrift Spotify update helper for the current Windows user.

.DESCRIPTION
  Checks that the Spotify desktop app and Spicetify are installed, copies neondrift-startup.ps1 and
  "Open Spotify (NeonDrift).bat" to %LOCALAPPDATA%\NeonDrift and adds a "NeonDrift Spotify" shortcut
  to the Startup folder, so that the helper runs at every Windows sign-in. Running it again updates
  the copy and the shortcut. No administrator rights; nothing else on the system is changed.

  The shortcut starts the helper through "conhost --headless" (no window at all) when this Windows
  has it, else through a hidden PowerShell window.

  This file is UTF-8 with a BOM: Windows PowerShell 5.1 reads a file without one as ANSI.

.PARAMETER NoLaunch
  Only fix at sign-in, do not open Spotify (it is opened again only if it was running before the fix).
.PARAMETER Ask
  Ask whether to open Spotify at sign-in (install.bat passes it). -NoLaunch skips the question.
.PARAMETER Language
  auto (default: Portuguese when Windows' display language is Portuguese, English otherwise), en or pt.
.PARAMETER Target
  Testing: the folder to copy the helper to (default %LOCALAPPDATA%\NeonDrift).
.PARAMETER StartupDir
  Testing: the folder for the shortcut (default: this user's Startup folder).
.PARAMETER NoHeadless
  Testing: use the hidden PowerShell window even when conhost --headless is available.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -NoLaunch
#>
param(
  [switch]$NoLaunch,
  [switch]$Ask,
  [ValidateSet('auto', 'en', 'pt')][string]$Language = 'auto',
  [string]$Target = '',
  [string]$StartupDir = '',
  [switch]$NoHeadless
)

$ErrorActionPreference = 'Stop'

# ---- messages: the same keys in en and pt ---------------------------------------------------------
$Messages = @{
  en = @{
    Title            = 'NeonDrift: keep Spicetify applied after Spotify updates (Windows)'
    MissingFile      = 'Missing file: {0}. Run install.bat from the extras\auto-reapply folder.'
    NeedSetup        = 'Nothing installed. Install Spotify from spotify.com/download (not the Microsoft Store one) and Spicetify 2 first: https://github.com/irandsj/spicetify-neon/blob/main/docs/INSTALL.md'
    AskLaunchHint    = 'At every Windows sign-in the helper re-applies Spicetify if Spotify updated itself. It can also open Spotify for you (as "Open Spotify automatically" would). If you answer n, it only fixes: Spotify is opened again only if it was already open.'
    AskLaunch        = 'Open Spotify when you sign in to Windows? [Y/n]'
    Copied           = 'Copied the helper to {0}'
    ShortcutAdded    = 'Added the Startup shortcut {0}'
    ShortcutReplaced = 'Updated the Startup shortcut {0}'
    ModeLaunch       = 'At sign-in: re-applies Spicetify if Spotify updated, then opens Spotify.'
    ModeFixOnly      = 'At sign-in: re-applies Spicetify if Spotify updated (does not open Spotify).'
    Hidden           = 'This Windows has no "conhost --headless": the shortcut uses a hidden PowerShell window, which may flash for a moment.'
    FixNow           = 'Spicetify is not applied right now. Double-click "Open Spotify (NeonDrift).bat" to fix it now, or it is fixed at the next sign-in.'
    LogAt            = 'Log: {0}'
    HowToRemove      = 'To remove it: uninstall.bat, or delete "NeonDrift Spotify" from the Startup folder (Win+R, shell:startup).'
    Installed        = 'Installed.'
    LnkLaunch        = 'Opens Spotify and re-applies Spicetify if Spotify updated (NeonDrift)'
    LnkFixOnly       = 'Re-applies Spicetify if Spotify updated (NeonDrift)'
    Error            = 'Install failed: {0}'
  }
  pt = @{
    Title            = 'NeonDrift: manter o Spicetify aplicado depois das atualizações do Spotify (Windows)'
    MissingFile      = 'Arquivo faltando: {0}. Rode o install.bat de dentro da pasta extras\auto-reapply.'
    NeedSetup        = 'Nada foi instalado. Instale antes o Spotify do spotify.com/download (não o da Microsoft Store) e o Spicetify 2: https://github.com/irandsj/spicetify-neon/blob/main/docs/INSTALL.pt-BR.md'
    AskLaunchHint    = 'Em todo login do Windows o ajudante reaplica o Spicetify se o Spotify se atualizou. Ele também pode abrir o Spotify para você (como o "Abrir o Spotify automaticamente" faria). Se responder n, ele só conserta: o Spotify só é reaberto se já estava aberto.'
    AskLaunch        = 'Abrir o Spotify quando você entrar no Windows? [S/n]'
    Copied           = 'Ajudante copiado para {0}'
    ShortcutAdded    = 'Atalho de inicialização criado: {0}'
    ShortcutReplaced = 'Atalho de inicialização atualizado: {0}'
    ModeLaunch       = 'No login: reaplica o Spicetify se o Spotify atualizou e abre o Spotify.'
    ModeFixOnly      = 'No login: reaplica o Spicetify se o Spotify atualizou (não abre o Spotify).'
    Hidden           = 'Este Windows não tem o "conhost --headless": o atalho usa uma janela oculta do PowerShell, que pode piscar por um instante.'
    FixNow           = 'O Spicetify não está aplicado agora. Dê dois cliques em "Open Spotify (NeonDrift).bat" para consertar já, ou ele é consertado no próximo login.'
    LogAt            = 'Log: {0}'
    HowToRemove      = 'Para tirar: uninstall.bat, ou apague "NeonDrift Spotify" da pasta Inicializar (Win+R, shell:startup).'
    Installed        = 'Instalado.'
    LnkLaunch        = 'Abre o Spotify e reaplica o Spicetify se o Spotify atualizou (NeonDrift)'
    LnkFixOnly       = 'Reaplica o Spicetify se o Spotify atualizou (NeonDrift)'
    Error            = 'A instalação falhou: {0}'
  }
}
$Lang = $Language
if ($Lang -eq 'auto') {
  $Lang = 'en'
  try { if ((Get-UICulture).Name -like 'pt*') { $Lang = 'pt' } } catch { }
}
function T([string]$key) { return $Messages[$Lang][$key] }

$ShortcutName = 'NeonDrift Spotify.lnk'
$Files = @('neondrift-startup.ps1', 'Open Spotify (NeonDrift).bat')

try {
  Write-Host (T 'Title')
  Write-Host ''
  $main = Join-Path $PSScriptRoot 'neondrift-startup.ps1'
  foreach ($f in $Files) { $p = Join-Path $PSScriptRoot $f; if (-not (Test-Path -LiteralPath $p)) { throw ((T 'MissingFile') -f $p) } }

  # 1. the current state, which also checks that the Spotify desktop app and Spicetify are there
  #    (exit code 1: one of them is missing, 3: Spicetify has to be re-applied now)
  & $main -DryRun -Language $Lang
  $state = $LASTEXITCODE
  if ($state -eq 1) { Write-Host ''; Write-Host (T 'NeedSetup'); exit 1 }

  # 2. open Spotify at sign-in, or only fix?
  $launch = -not $NoLaunch
  if ($Ask -and $launch) {
    Write-Host ''
    Write-Host (T 'AskLaunchHint')
    $answer = Read-Host (T 'AskLaunch')
    if ($answer -and $answer.Trim() -match '^[nN]') { $launch = $false }
  }

  # 3. copy the helper
  if (-not $Target) { $Target = Join-Path $env:LOCALAPPDATA 'NeonDrift' }
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
  $Target = (Resolve-Path -LiteralPath $Target).Path
  foreach ($f in $Files) {
    $from = Join-Path $PSScriptRoot $f
    $to = Join-Path $Target $f
    if ([IO.Path]::GetFullPath($from) -ne [IO.Path]::GetFullPath($to)) { Copy-Item -LiteralPath $from -Destination $to -Force }
    Unblock-File -LiteralPath $to -ErrorAction SilentlyContinue   # drop the "downloaded from the internet" mark
  }

  # 4. the Startup shortcut
  if (-not $StartupDir) { $StartupDir = [Environment]::GetFolderPath('Startup') }
  New-Item -ItemType Directory -Force -Path $StartupDir | Out-Null
  $lnkPath = Join-Path $StartupDir $ShortcutName
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
  # conhost.exe --headless runs a console program with no window (Windows 10 2004 and later)
  $headless = (-not $NoHeadless) -and (Test-Path -LiteralPath $conhost) -and ([Environment]::OSVersion.Version.Build -ge 19041)
  $scriptArgs = '-ExecutionPolicy Bypass -File "' + (Join-Path $Target 'neondrift-startup.ps1') + '" -AtLogin'
  if (-not $launch) { $scriptArgs += ' -NoLaunch' }
  if ($headless) {
    $exe = $conhost
    $arguments = '--headless "' + $powershell + '" -NoProfile ' + $scriptArgs
  } else {
    $exe = $powershell
    $arguments = '-NoProfile -WindowStyle Hidden ' + $scriptArgs
  }
  $existed = Test-Path -LiteralPath $lnkPath
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($lnkPath)
  $lnk.TargetPath = $exe
  $lnk.Arguments = $arguments
  $lnk.WorkingDirectory = $Target
  $lnk.WindowStyle = 7   # minimized
  $spotifyIcon = Join-Path $env:APPDATA 'Spotify\Spotify.exe'
  if (Test-Path -LiteralPath $spotifyIcon) { $lnk.IconLocation = $spotifyIcon + ',0' }
  $lnk.Description = if ($launch) { T 'LnkLaunch' } else { T 'LnkFixOnly' }
  $lnk.Save()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)

  # 5. summary
  Write-Host ''
  Write-Host ((T 'Copied') -f $Target)
  if ($existed) { Write-Host ((T 'ShortcutReplaced') -f $lnkPath) } else { Write-Host ((T 'ShortcutAdded') -f $lnkPath) }
  if ($launch) { Write-Host (T 'ModeLaunch') } else { Write-Host (T 'ModeFixOnly') }
  if (-not $headless) { Write-Host (T 'Hidden') }
  if ($state -eq 3) { Write-Host ''; Write-Host (T 'FixNow') }
  Write-Host ((T 'LogAt') -f (Join-Path (Join-Path $env:LOCALAPPDATA 'NeonDrift') 'startup.log'))
  Write-Host (T 'HowToRemove')
  Write-Host ''
  Write-Host (T 'Installed')
  exit 0
} catch {
  Write-Host ''
  Write-Host ((T 'Error') -f $_.Exception.Message)
  exit 1
}
