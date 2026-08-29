Param(
    [switch]$NoBrowser
)

$root = $PSScriptRoot

Write-Host "Starting backend (Django) on http://localhost:8000 ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root\backend'; venv\Scripts\python.exe manage.py runserver 8000"
)

Write-Host "Starting frontend (Vite) on http://localhost:5173 ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root\frontend'; npm run dev -- --host"
)

if (-not $NoBrowser) {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:5173"
}

Write-Host "Backend and frontend are starting in separate windows. Close those windows to stop them." -ForegroundColor Green
