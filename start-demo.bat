@echo off
setlocal

cd /d "%~dp0"
set PORT=8080

echo [Demo] Starting local server on http://127.0.0.1:%PORT%

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:%PORT%/"
  python ".\code\dev_server.py" --port %PORT% --root "."
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:%PORT%/"
  py ".\code\dev_server.py" --port %PORT% --root "."
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:%PORT%/"
  npx --yes http-server . -p %PORT% -c-1
  goto :eof
)

echo [Demo] Python/Node not found. Please install Python or Node.js first.
pause
