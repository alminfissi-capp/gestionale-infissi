# Installa (o aggiorna) il ponte FP PRO -> WinStudio su questo PC.
# Rilanciarlo dopo ogni modifica al codice del ponte: ferma, copia, riavvia.
param([string]$Destinazione = 'C:\WinStudioPonte')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$avvioAutomatico = Join-Path ([Environment]::GetFolderPath('Startup')) 'WinStudioPonte.vbs'

# 1. Ferma il ponte se sta girando (prima il ciclo di riavvio, poi node)
foreach ($nome in 'wscript.exe', 'node.exe') {
  Get-CimInstance Win32_Process -Filter "Name='$nome'" |
    Where-Object { $_.CommandLine -like '*WinStudioPonte*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

# 2. Copia il codice (solo i file che servono al ponte)
New-Item -ItemType Directory -Force "$Destinazione\ponte\src", "$Destinazione\lib\fppro", "$Destinazione\log" | Out-Null
Copy-Item "$repo\ponte\package.json", "$repo\ponte\package-lock.json" "$Destinazione\ponte\" -Force
Copy-Item "$repo\ponte\src\*.ts" "$Destinazione\ponte\src\" -Force
Copy-Item "$repo\lib\fppro\sync-tabelle.ts", "$repo\lib\fppro\ponte-regole.ts" "$Destinazione\lib\fppro\" -Force
# Fuori dal repository non c'e' un package.json sopra lib/: lo dichiariamo ESM.
Set-Content "$Destinazione\lib\package.json" '{ "type": "module" }' -Encoding ascii

# 3. Dipendenze
Push-Location "$Destinazione\ponte"
try { npm ci --omit=dev --no-audit --no-fund | Out-Null } finally { Pop-Location }

# 4. Segreti
& "$PSScriptRoot\crea-env.ps1" -Uscita "$Destinazione\.env" -LogDir "$Destinazione\log"

# 5. Avvio nascosto con riavvio automatico se il ponte si ferma
$node = (Get-Command node).Source
$vbs = @"
' Avvia il ponte WinStudio nascosto e lo riavvia se si ferma.
Set sh = CreateObject("WScript.Shell")
Do
  sh.Run """$node"" --env-file=""$Destinazione\.env"" ""$Destinazione\ponte\src\ponte.ts""", 0, True
  WScript.Sleep 30000
Loop
"@
Set-Content "$Destinazione\avvia.vbs" $vbs -Encoding ascii
Set-Content $avvioAutomatico "CreateObject(""WScript.Shell"").Run ""wscript.exe """"$Destinazione\avvia.vbs"""""", 0, False" -Encoding ascii

# 6. Avvio subito
Start-Process wscript.exe -ArgumentList "`"$Destinazione\avvia.vbs`""
Write-Output "Ponte installato in $Destinazione e avviato. Avvio automatico: $avvioAutomatico"
