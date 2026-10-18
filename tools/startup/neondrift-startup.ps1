<#
  NeonDrift - abre o Spotify e reaplica o Spicetify quando o Spotify se atualiza.

  Uso:
    neondrift-startup.ps1            (manual: checa, reaplica se precisar, abre o Spotify)
    neondrift-startup.ps1 -AtLogin   (no login do Windows: espera a rede/desktop antes)
    neondrift-startup.ps1 -DryRun    (so diagnostica: diz se precisa reaplicar, nao mexe em nada)
    neondrift-startup.ps1 -Force     (reaplica mesmo que pareca tudo certo)

  Log: %LOCALAPPDATA%\NeonDrift\startup.log
#>
param([switch]$AtLogin, [switch]$DryRun, [switch]$Force, [string]$AppsPath = '')

$ErrorActionPreference = 'Continue'
$ESC = [char]27

$logDir = Join-Path $env:LOCALAPPDATA 'NeonDrift'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'startup.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 512KB) { Remove-Item $log -Force }
function Log([string]$m) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $m
  Add-Content -Path $log -Value $line -Encoding UTF8
  if (-not $AtLogin) { Write-Host $m }
}

$spotifyExe = Join-Path $env:APPDATA 'Spotify\Spotify.exe'
$spicetify  = Join-Path $env:LOCALAPPDATA 'spicetify\spicetify.exe'
$apps       = if ($AppsPath) { $AppsPath } else { Join-Path $env:APPDATA 'Spotify\Apps' }
$cfg        = Join-Path $env:APPDATA 'spicetify\config-xpui.ini'

if ($AtLogin) { Start-Sleep -Seconds 20 }   # let the desktop and the network settle

if (-not (Test-Path $spotifyExe)) { Log 'Spotify nao encontrado; nada a fazer.'; exit 1 }
if (-not (Test-Path $spicetify)) { Log 'Spicetify nao encontrado; abrindo o Spotify sem tema.'; Start-Process $spotifyExe; exit 1 }

function Get-SpotifyVersion { (Get-Item $spotifyExe).VersionInfo.ProductVersion }

function Get-BackupVersion {
  if (-not (Test-Path $cfg)) { return '' }
  $inBackup = $false
  foreach ($line in Get-Content $cfg) {
    if ($line -match '^\s*\[Backup\]') { $inBackup = $true; continue }
    if ($line -match '^\s*\[') { $inBackup = $false; continue }
    if ($inBackup -and $line -match '^\s*version\s*=\s*(\S+)') { return $Matches[1] }
  }
  return ''
}

# reasons why Spicetify has to be applied again (empty = everything is patched)
function Get-PatchReasons {
  $reasons = @()
  $sv = Get-SpotifyVersion
  $bv = Get-BackupVersion
  if (-not $bv -or -not $bv.StartsWith($sv)) { $reasons += "Spotify $sv, backup do Spicetify $bv" }
  if (Test-Path (Join-Path $apps 'xpui.spa')) { $reasons += 'arquivos originais do Spotify voltaram (xpui.spa)' }
  $index = Join-Path $apps 'xpui\index.html'
  if (-not (Test-Path $index) -or -not (Select-String -Path $index -Pattern 'spicetify' -Quiet)) { $reasons += 'Spotify sem Spicetify (index.html)' }
  return ,$reasons
}

function Invoke-Spicetify([string[]]$cmdArgs) {
  # answers "y" to any prompt (e.g. "clear the outdated backup?") and strips colour codes
  $out = "y`ny`ny`n" | & $spicetify @cmdArgs 2>&1
  $lines = $out | ForEach-Object { ([string]$_) -replace "$ESC\[[0-9;]*m", '' } |
    Where-Object { $_ -match '\b(success|error|warning|info|fatal)\b' } | ForEach-Object { $_.Trim() }
  $text = ($lines | Select-Object -Unique) -join ' | '
  Log ('spicetify ' + ($cmdArgs -join ' ') + ' -> ' + $text)
}

function Show-Note([string]$text) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($spotifyExe)
    $n.BalloonTipTitle = 'NeonDrift'
    $n.BalloonTipText = $text
    $n.Visible = $true
    $n.ShowBalloonTip(8000)
    Start-Sleep -Seconds 9
    $n.Dispose()
  } catch { }
}

function Start-SpotifyIfClosed {
  if (-not (Get-Process -Name Spotify -ErrorAction SilentlyContinue)) { Start-Process $spotifyExe }
}

$reasons = Get-PatchReasons
if ($Force -and $reasons.Count -eq 0) { $reasons = @('reaplicacao forcada (-Force)') }
if ($DryRun) {
  if ($reasons.Count -eq 0) { Log ('[teste] Spotify ' + (Get-SpotifyVersion) + ' com Spicetify: nada a fazer.') }
  else { Log ('[teste] precisaria reaplicar: ' + ($reasons -join '; ')) }
  exit 0
}
if ($reasons.Count -eq 0) {
  Log ('OK: Spotify ' + (Get-SpotifyVersion) + ' ja esta com o Spicetify. Abrindo o Spotify.')
  Start-SpotifyIfClosed
  exit 0
}

Log ('Reaplicando o Spicetify: ' + ($reasons -join '; '))
Get-Process -Name Spotify -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# A freshly updated (clean) Spotify needs a new backup first ("backup apply");
# a Spotify that is already patched only accepts "apply" (Spicetify refuses to
# back up modified files).
function Test-CleanSpotify {
  $bv = Get-BackupVersion
  return (-not $bv) -or (-not $bv.StartsWith((Get-SpotifyVersion))) -or (Test-Path (Join-Path $apps 'xpui.spa'))
}
function Invoke-Patch {
  if (Test-CleanSpotify) { Invoke-Spicetify @('backup', 'apply') } else { Invoke-Spicetify @('apply') }
}

Invoke-Patch
$after = Get-PatchReasons

if ($after.Count -gt 0) {
  # a brand-new Spotify may need a newer Spicetify
  Log ('Ainda falta: ' + ($after -join '; ') + '. Atualizando o Spicetify e tentando de novo.')
  Get-Process -Name Spotify -ErrorAction SilentlyContinue | Stop-Process -Force
  Invoke-Spicetify @('update')
  Get-Process -Name Spotify -ErrorAction SilentlyContinue | Stop-Process -Force
  Invoke-Patch
  $after = Get-PatchReasons
}

Start-Sleep -Seconds 3
Start-SpotifyIfClosed

if ($after.Count -eq 0) {
  Log ('Pronto: Spotify ' + (Get-SpotifyVersion) + ' com o NeonDrift reaplicado.')
  Show-Note ('O Spotify atualizou para ' + (Get-SpotifyVersion) + '. Tema e extensao reaplicados.')
  exit 0
} else {
  Log ('FALHOU: ' + ($after -join '; '))
  Show-Note ('O Spotify atualizou, mas nao consegui reaplicar o NeonDrift. Veja ' + $log)
  exit 2
}
