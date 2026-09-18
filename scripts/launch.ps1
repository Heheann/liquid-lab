$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Host 'Node.js is required to open this local website.'
  Read-Host 'Press Enter to close'
  exit 1
}
$existing = $false
try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -TimeoutSec 2 -UseBasicParsing; $existing = $response.StatusCode -eq 200 } catch {}
if (-not $existing) {
  Start-Process -FilePath $nodeCommand.Source -ArgumentList 'scripts/serve.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden
  Start-Sleep -Milliseconds 1200
}
Start-Process 'http://127.0.0.1:4173/'
