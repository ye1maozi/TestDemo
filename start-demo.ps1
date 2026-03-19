$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$port = 8080

Write-Host "[Demo] Starting local server on http://127.0.0.1:$port" -ForegroundColor Cyan
Start-Process "http://127.0.0.1:$port/"

if (Get-Command python -ErrorAction SilentlyContinue) {
  python ".\code\dev_server.py" --port $port --root "."
  exit 0
}

if (Get-Command py -ErrorAction SilentlyContinue) {
  py ".\code\dev_server.py" --port $port --root "."
  exit 0
}

if (Get-Command node -ErrorAction SilentlyContinue) {
  npx --yes http-server . -p $port -c-1
  exit 0
}

Write-Host "[Demo] Python/Node not found. Please install Python or Node.js first." -ForegroundColor Red
