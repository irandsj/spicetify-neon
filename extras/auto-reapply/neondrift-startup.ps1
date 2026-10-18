<#
.SYNOPSIS
  Re-applies Spicetify when Spotify has updated itself, then opens Spotify.
  Part of NeonDrift (https://github.com/irandsj/spicetify-neon); works with any Spicetify setup.

.DESCRIPTION
  A Spotify update replaces the files Spicetify patched, so the theme and the extensions are gone.
  This script looks for the signs of an update:
    - Spotify.exe's version is not the one in the [Backup] section of Spicetify's config-xpui.ini;
    - Spotify's original Apps\xpui.spa is back;
    - Apps\xpui\index.html is missing or does not load Spicetify.
  If it finds one, it closes Spotify and runs "spicetify backup apply" on a clean (just updated)
  Spotify or "spicetify apply" on an already patched one (Spicetify refuses to back up patched
  files). If Spotify is still not patched, it runs "spicetify update" and tries once more. Then it
  opens Spotify again and shows a notification.

  It runs only on this computer and sends nothing. The only network access is Spicetify's own
  updater on that retry ("spicetify update"), which is skipped when Spicetify's
  check_spicetify_update setting is 0. It never touches Spotify's account, settings or volume.

  Messages are in Portuguese when Windows' display language is Portuguese, in English otherwise.
  This file is UTF-8 with a BOM: Windows PowerShell 5.1 reads a file without one as ANSI.

  Log: %LOCALAPPDATA%\NeonDrift\startup.log

.PARAMETER AtLogin
  Used by the Startup shortcut: waits 20 s for the desktop and the network, writes only to the log.
.PARAMETER NoLaunch
  Only fix, do not open Spotify. Spotify is opened again only if it was running before the fix.
.PARAMETER DryRun
  Only report whether Spicetify has to be re-applied; changes nothing and opens nothing.
  Exit code 0: nothing to do, 3: a re-apply is needed, 1: no Spotify desktop app or no Spicetify.
.PARAMETER Force
  Re-apply even if everything looks patched.
.PARAMETER Language
  auto (default), en or pt.
.PARAMETER SpotifyExe
  Advanced / testing: Spotify.exe to check (default: Spicetify's spotify_path, else %APPDATA%\Spotify).
.PARAMETER SpicetifyExe
  Advanced / testing: spicetify.exe to run (default: %LOCALAPPDATA%\spicetify, else the one on PATH).
.PARAMETER AppsPath
  Advanced / testing: Spotify's Apps folder (default: next to Spotify.exe).
.PARAMETER ConfigPath
  Advanced / testing: Spicetify's config-xpui.ini (default: %SPICETIFY_CONFIG% or %APPDATA%\spicetify).
.PARAMETER LogPath
  Advanced / testing: the log file.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File neondrift-startup.ps1 -DryRun
#>
param(
  [switch]$AtLogin,
  [switch]$NoLaunch,
  [switch]$DryRun,
  [switch]$Force,
  [ValidateSet('auto', 'en', 'pt')][string]$Language = 'auto',
  [string]$SpotifyExe = '',
  [string]$SpicetifyExe = '',
  [string]$AppsPath = '',
  [string]$ConfigPath = '',
  [string]$LogPath = ''
)

$ErrorActionPreference = 'Continue'
$ESC = [char]27

# ---- messages: the same keys in en and pt ---------------------------------------------------------
$Messages = @{
  en = @{
    SpotifyMissing       = 'Spotify (the desktop app from spotify.com) was not found; nothing to do.'
    SpotifyStore         = 'Only the Microsoft Store version of Spotify is installed, and Spicetify does not support it: install Spotify from spotify.com/download, then Spicetify. Nothing to do.'
    SpicetifyMissing     = 'Spicetify was not found; nothing to do.'
    SpicetifyMissingOpen = 'Spicetify was not found; opening Spotify without it.'
    NoBackup             = 'none'
    ReasonVersion        = 'Spotify {0}, Spicetify backup {1}'
    ReasonSpa            = 'Spotify''s original files are back (xpui.spa)'
    ReasonIndex          = 'Spotify without Spicetify (index.html)'
    ReasonForce          = 'forced re-apply (-Force)'
    DryNothing           = '[dry run] Spotify {0} has Spicetify: nothing to do.'
    DryWould             = '[dry run] would re-apply Spicetify: {0}'
    OkOpen               = 'OK: Spotify {0} already has Spicetify. Opening Spotify.'
    OkStay               = 'OK: Spotify {0} already has Spicetify.'
    Reapplying           = 'Re-applying Spicetify: {0}'
    Retry                = 'Still missing: {0}. Updating Spicetify and trying again.'
    RetryNoUpdate        = 'Still missing: {0}. Trying again (Spicetify updates are off: check_spicetify_update = 0).'
    Done                 = 'Done: Spotify {0} with Spicetify re-applied.'
    DoneNote             = 'Spotify updated to {0}. Theme and extensions re-applied.'
    Failed               = 'FAILED: {0}'
    FailedNote           = 'Spotify updated, but Spicetify could not be re-applied. See {0}'
  }
  pt = @{
    SpotifyMissing       = 'Spotify (o aplicativo para computador do spotify.com) não encontrado; nada a fazer.'
    SpotifyStore         = 'Só o Spotify da Microsoft Store está instalado, e o Spicetify não funciona com ele: instale o Spotify de spotify.com/download e depois o Spicetify. Nada a fazer.'
    SpicetifyMissing     = 'Spicetify não encontrado; nada a fazer.'
    SpicetifyMissingOpen = 'Spicetify não encontrado; abrindo o Spotify sem tema.'
    NoBackup             = 'nenhum'
    ReasonVersion        = 'Spotify {0}, backup do Spicetify {1}'
    ReasonSpa            = 'arquivos originais do Spotify voltaram (xpui.spa)'
    ReasonIndex          = 'Spotify sem Spicetify (index.html)'
    ReasonForce          = 'reaplicação forçada (-Force)'
    DryNothing           = '[teste] Spotify {0} com Spicetify: nada a fazer.'
    DryWould             = '[teste] precisaria reaplicar: {0}'
    OkOpen               = 'OK: Spotify {0} já está com o Spicetify. Abrindo o Spotify.'
    OkStay               = 'OK: Spotify {0} já está com o Spicetify.'
    Reapplying           = 'Reaplicando o Spicetify: {0}'
    Retry                = 'Ainda falta: {0}. Atualizando o Spicetify e tentando de novo.'
    RetryNoUpdate        = 'Ainda falta: {0}. Tentando de novo (atualização do Spicetify desligada: check_spicetify_update = 0).'
    Done                 = 'Pronto: Spotify {0} com o Spicetify reaplicado.'
    DoneNote             = 'O Spotify atualizou para {0}. Tema e extensões reaplicados.'
    Failed               = 'FALHOU: {0}'
    FailedNote           = 'O Spotify atualizou, mas não consegui reaplicar o Spicetify. Veja {0}'
  }
}
$Lang = $Language
if ($Lang -eq 'auto') {
  $Lang = 'en'
  try { if ((Get-UICulture).Name -like 'pt*') { $Lang = 'pt' } } catch { }
}
function T([string]$key) { return $Messages[$Lang][$key] }

# ---- log -------------------------------------------------------------------------------------------
if (-not $LogPath) { $LogPath = Join-Path (Join-Path $env:LOCALAPPDATA 'NeonDrift') 'startup.log' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
if ((Test-Path -LiteralPath $LogPath) -and (Get-Item -LiteralPath $LogPath).Length -gt 512KB) { Remove-Item -LiteralPath $LogPath -Force }
function Log([string]$m) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $m
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  if (-not $AtLogin) { Write-Host $m }
}

# ---- where things are ------------------------------------------------------------------------------
function Get-IniValue([string]$path, [string]$section, [string]$key) {
  if (-not $path -or -not (Test-Path -LiteralPath $path)) { return '' }
  $inSection = $false
  foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
    if ($line -match '^\s*\[(.+?)\]') { $inSection = ($Matches[1] -eq $section); continue }
    if ($inSection -and $line -match ('^\s*' + [regex]::Escape($key) + '\s*=\s*(.*?)\s*$')) { return $Matches[1] }
  }
  return ''
}

if (-not $ConfigPath) {
  $configDir = if ($env:SPICETIFY_CONFIG) { $env:SPICETIFY_CONFIG } else { Join-Path $env:APPDATA 'spicetify' }
  $ConfigPath = Join-Path $configDir 'config-xpui.ini'
}
if (-not $SpotifyExe) {
  $SpotifyExe = Join-Path $env:APPDATA 'Spotify\Spotify.exe'
  $configured = Get-IniValue $ConfigPath 'Setting' 'spotify_path'
  if ($configured -and (Test-Path -LiteralPath (Join-Path $configured 'Spotify.exe'))) { $SpotifyExe = Join-Path $configured 'Spotify.exe' }
}
if (-not $SpicetifyExe) {
  $SpicetifyExe = Join-Path $env:LOCALAPPDATA 'spicetify\spicetify.exe'   # the official installer
  if (-not (Test-Path -LiteralPath $SpicetifyExe)) {                        # Scoop, winget, Chocolatey...
    $onPath = Get-Command spicetify -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($onPath) { $SpicetifyExe = $onPath.Path }
  }
}
if (-not $AppsPath) { $AppsPath = Join-Path (Split-Path -Parent $SpotifyExe) 'Apps' }
$spotifyProcess = [IO.Path]::GetFileNameWithoutExtension($SpotifyExe)   # "Spotify"

function Test-StoreSpotify {
  try { return [bool](Get-AppxPackage -Name 'SpotifyAB.SpotifyMusic' -ErrorAction SilentlyContinue) } catch { return $false }
}

function Get-SpotifyVersion {
  $v = (Get-Item -LiteralPath $SpotifyExe).VersionInfo.ProductVersion
  if ($v) { return $v.Trim() }
  return '?'
}

function Get-BackupVersion { return (Get-IniValue $ConfigPath 'Backup' 'version') }

# reasons why Spicetify has to be applied again (empty = everything is patched)
function Get-PatchReasons {
  $reasons = @()
  $sv = Get-SpotifyVersion
  $bv = Get-BackupVersion
  if (-not $bv -or -not $bv.StartsWith($sv)) {
    $shown = if ($bv) { $bv } else { T 'NoBackup' }
    $reasons += ((T 'ReasonVersion') -f $sv, $shown)
  }
  if (Test-Path -LiteralPath (Join-Path $AppsPath 'xpui.spa')) { $reasons += (T 'ReasonSpa') }
  $index = Join-Path $AppsPath 'xpui\index.html'
  if (-not (Test-Path -LiteralPath $index) -or -not (Select-String -LiteralPath $index -Pattern 'spicetify' -Quiet)) { $reasons += (T 'ReasonIndex') }
  return ,$reasons
}

# A freshly updated (clean) Spotify needs a new backup first ("backup apply");
# a Spotify that is already patched only accepts "apply" (Spicetify refuses to
# back up modified files).
function Test-CleanSpotify {
  $bv = Get-BackupVersion
  return (-not $bv) -or (-not $bv.StartsWith((Get-SpotifyVersion))) -or (Test-Path -LiteralPath (Join-Path $AppsPath 'xpui.spa'))
}

$noRestart = $false   # pass -n so that Spicetify does not start Spotify (set below for -NoLaunch)
function Invoke-Spicetify([string[]]$cmdArgs) {
  if ($noRestart) { $cmdArgs = @('-n') + $cmdArgs }
  # answers "y" to any prompt (e.g. "clear the outdated backup?"), keeps only the result lines
  # (the last state of each spinner line, without colour codes)
  $out = "y`ny`ny`n" | & $SpicetifyExe @cmdArgs 2>&1
  $lines = foreach ($o in $out) {
    foreach ($part in (([string]$o) -split "`r")) {
      $s = ($part -replace "$ESC\[[0-9;]*m", '').Trim()
      if ($s -match '\b(success|error|warning|info|fatal)\b') { $s }
    }
  }
  $text = ($lines | Select-Object -Unique) -join ' | '
  Log ('spicetify ' + ($cmdArgs -join ' ') + ' -> ' + $text)
}

function Invoke-Patch {
  if (Test-CleanSpotify) { Invoke-Spicetify @('backup', 'apply') } else { Invoke-Spicetify @('apply') }
}

function Show-Note([string]$text) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($SpotifyExe)
    $n.BalloonTipTitle = 'NeonDrift'
    $n.BalloonTipText = $text
    $n.Visible = $true
    $n.ShowBalloonTip(8000)
    Start-Sleep -Seconds 9
    $n.Dispose()
  } catch { }
}

function Test-SpotifyRunning { return [bool](Get-Process -Name $spotifyProcess -ErrorAction SilentlyContinue) }
function Stop-Spotify { Get-Process -Name $spotifyProcess -ErrorAction SilentlyContinue | Stop-Process -Force }
function Start-SpotifyIfClosed { if (-not (Test-SpotifyRunning)) { Start-Process -FilePath $SpotifyExe } }

# ---- run -------------------------------------------------------------------------------------------
if ($AtLogin) { Start-Sleep -Seconds 20 }   # let the desktop and the network settle

if (-not (Test-Path -LiteralPath $SpotifyExe)) {
  if (Test-StoreSpotify) { Log (T 'SpotifyStore') } else { Log (T 'SpotifyMissing') }
  exit 1
}
if (-not (Test-Path -LiteralPath $SpicetifyExe)) {
  if ($DryRun -or $NoLaunch) { Log (T 'SpicetifyMissing') }
  else { Log (T 'SpicetifyMissingOpen'); Start-SpotifyIfClosed }
  exit 1
}

$reasons = Get-PatchReasons
if ($Force -and $reasons.Count -eq 0) { $reasons = @(T 'ReasonForce') }
if ($DryRun) {
  if ($reasons.Count -eq 0) { Log ((T 'DryNothing') -f (Get-SpotifyVersion)); exit 0 }
  Log ((T 'DryWould') -f ($reasons -join '; '))
  exit 3
}
if ($reasons.Count -eq 0) {
  if ($NoLaunch) { Log ((T 'OkStay') -f (Get-SpotifyVersion)) }
  else { Log ((T 'OkOpen') -f (Get-SpotifyVersion)); Start-SpotifyIfClosed }
  exit 0
}

Log ((T 'Reapplying') -f ($reasons -join '; '))
$wasRunning = Test-SpotifyRunning
$noRestart = $NoLaunch -and -not $wasRunning
Stop-Spotify
Start-Sleep -Seconds 2

Invoke-Patch
$after = Get-PatchReasons

if ($after.Count -gt 0) {
  # a brand-new Spotify may need a newer Spicetify (unless Spicetify's own updates are turned off)
  if ((Get-IniValue $ConfigPath 'Setting' 'check_spicetify_update') -eq '0') {
    Log ((T 'RetryNoUpdate') -f ($after -join '; '))
  } else {
    Log ((T 'Retry') -f ($after -join '; '))
    Stop-Spotify
    Invoke-Spicetify @('update')
  }
  Stop-Spotify
  Invoke-Patch
  $after = Get-PatchReasons
}

Start-Sleep -Seconds 3
if (-not $NoLaunch -or $wasRunning) { Start-SpotifyIfClosed }

if ($after.Count -eq 0) {
  Log ((T 'Done') -f (Get-SpotifyVersion))
  Show-Note ((T 'DoneNote') -f (Get-SpotifyVersion))
  exit 0
}
Log ((T 'Failed') -f ($after -join '; '))
Show-Note ((T 'FailedNote') -f $LogPath)
exit 2
