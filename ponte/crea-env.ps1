# Crea il file .env del ponte leggendo:
#  - MySQL di FP PRO da C:\FP_PRO\CONFIGS\EDILSIDER\CONF_FPP.INI
#  - Supabase da .env.local del repository
# Il file contiene segreti: non va mai nel repository.
param(
  [Parameter(Mandatory = $true)][string]$Uscita,
  [string]$Ini = 'C:\FP_PRO\CONFIGS\EDILSIDER\CONF_FPP.INI',
  [string]$LogDir = 'C:\WinStudioPonte\log'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

function Valore($righe, $chiave) {
  $r = $righe | Where-Object { $_ -match "^\s*$chiave\s*=" } | Select-Object -First 1
  if (-not $r) { throw "Chiave $chiave non trovata" }
  # Toglie eventuali virgolette gia' presenti in .env.local
  return ($r -replace "^\s*$chiave\s*=\s*", '').Trim().Trim('"')
}

$righeIni = Get-Content $Ini
$envLocal = Get-Content (Join-Path $repo '.env.local')

$righe = @(
  "SUPABASE_URL=`"$(Valore $envLocal 'NEXT_PUBLIC_SUPABASE_URL')`"",
  "SUPABASE_SERVICE_ROLE_KEY=`"$(Valore $envLocal 'SUPABASE_SERVICE_ROLE_KEY')`"",
  'ORGANIZATION_ID="00000000-0000-0000-0000-000000000001"',
  "FP_MYSQL_HOST=`"$(Valore $righeIni 'SERVER')`"",
  "FP_MYSQL_PORT=`"$(Valore $righeIni 'PORT')`"",
  "FP_MYSQL_USER=`"$(Valore $righeIni 'USER')`"",
  "FP_MYSQL_PASSWORD=`"$(Valore $righeIni 'PASSWORD')`"",
  "FP_MYSQL_DATABASE=`"$(Valore $righeIni 'DATABASE')`"",
  "PONTE_LOG_DIR=`"$LogDir`""
)
Set-Content -Path $Uscita -Value $righe -Encoding ascii
Write-Output "Creato $Uscita"
