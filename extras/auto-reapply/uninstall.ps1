<#
.SYNOPSIS
  Removes the NeonDrift Spotify update helper for the current Windows user.

.DESCRIPTION
  Deletes the "NeonDrift Spotify" shortcut from the Startup folder, so the helper no longer runs at
  sign-in. With -RemoveFiles (or a "y" to the question that uninstall.bat asks) it also deletes the
  helper's own files and its log from %LOCALAPPDATA%\NeonDrift, and the folder if nothing else is in
  it. Spotify, Spicetify, the theme and the extensions are not touched.

  This file is UTF-8 with a BOM: Windows PowerShell 5.1 reads a file without one as ANSI.

.PARAMETER RemoveFiles
  Also delete the helper's files and its log.
.PARAMETER KeepFiles
  Keep the helper's files and its log (no question).
.PARAMETER Ask
  Ask whether to delete the files (uninstall.bat passes it).
.PARAMETER Language
  auto (default: Portuguese when Windows' display language is Portuguese, English otherwise), en or pt.
.PARAMETER Target
  Testing: the helper's folder (default %LOCALAPPDATA%\NeonDrift).
.PARAMETER StartupDir
  Testing: the folder of the shortcut (default: this user's Startup folder).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1 -RemoveFiles
#>
param(
  [switch]$RemoveFiles,
  [switch]$KeepFiles,
  [switch]$Ask,
  [ValidateSet('auto', 'en', 'pt')][string]$Language = 'auto',
  [string]$Target = '',
  [string]$StartupDir = ''
)

$ErrorActionPreference = 'Stop'

# ---- messages: the same keys in en and pt ---------------------------------------------------------
$Messages = @{
  en = @{
    Removed      = 'Removed the Startup shortcut {0}'
    NoShortcut   = 'There is no Startup shortcut to remove ({0}).'
    AskFiles     = 'Also delete the helper files and its log in {0}? [y/N]'
    FilesRemoved = 'Deleted the helper files from {0}'
    FilesKept    = 'Kept the helper files in {0}'
    Done         = 'Uninstalled. Spotify, Spicetify, the theme and the extensions are unchanged.'
    Error        = 'Uninstall failed: {0}'
  }
  pt = @{
    Removed      = 'Atalho de inicialização removido: {0}'
    NoShortcut   = 'Não há atalho de inicialização para remover ({0}).'
    AskFiles     = 'Apagar também os arquivos do ajudante e o log em {0}? [s/N]'
    FilesRemoved = 'Arquivos do ajudante apagados de {0}'
    FilesKept    = 'Arquivos do ajudante mantidos em {0}'
    Done         = 'Desinstalado. Spotify, Spicetify, tema e extensões continuam como estão.'
    Error        = 'A desinstalação falhou: {0}'
  }
}
$Lang = $Language
if ($Lang -eq 'auto') {
  $Lang = 'en'
  try { if ((Get-UICulture).Name -like 'pt*') { $Lang = 'pt' } } catch { }
}
function T([string]$key) { return $Messages[$Lang][$key] }

$ShortcutName = 'NeonDrift Spotify.lnk'
# only the files the helper itself puts there ("Abrir Spotify NeonDrift.bat": the name used before 1.0.1)
$Known = @('neondrift-startup.ps1', 'Open Spotify (NeonDrift).bat', 'Abrir Spotify NeonDrift.bat', 'startup.log')

try {
  if (-not $Target) { $Target = Join-Path $env:LOCALAPPDATA 'NeonDrift' }
  if (-not $StartupDir) { $StartupDir = [Environment]::GetFolderPath('Startup') }

  $lnkPath = Join-Path $StartupDir $ShortcutName
  if (Test-Path -LiteralPath $lnkPath) {
    Remove-Item -LiteralPath $lnkPath -Force
    Write-Host ((T 'Removed') -f $lnkPath)
  } else {
    Write-Host ((T 'NoShortcut') -f $lnkPath)
  }

  $present = @($Known | Where-Object { Test-Path -LiteralPath (Join-Path $Target $_) })
  if ($present.Count -gt 0) {
    $remove = [bool]$RemoveFiles
    if (-not $RemoveFiles -and -not $KeepFiles -and $Ask) {
      $answer = Read-Host ((T 'AskFiles') -f $Target)
      $remove = [bool]($answer -and $answer.Trim() -match '^[yYsS]')
    }
    if ($remove) {
      foreach ($f in $present) { Remove-Item -LiteralPath (Join-Path $Target $f) -Force }
      if (-not (Get-ChildItem -LiteralPath $Target -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $Target -Force }
      Write-Host ((T 'FilesRemoved') -f $Target)
    } else {
      Write-Host ((T 'FilesKept') -f $Target)
    }
  }
  Write-Host ''
  Write-Host (T 'Done')
  exit 0
} catch {
  Write-Host ''
  Write-Host ((T 'Error') -f $_.Exception.Message)
  exit 1
}
