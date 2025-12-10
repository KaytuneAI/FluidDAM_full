# PowerShell version of Nginx startup script
param(
    [string]$NginxDir = "C:\nginx-1.28.0"
)

Write-Host "============================================" -ForegroundColor Green
Write-Host "Starting Nginx Server (PowerShell)" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

# Check if Nginx directory exists
if (-not (Test-Path $NginxDir)) {
    Write-Host "[ERROR] Nginx directory not found: $NginxDir" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Set-Location $NginxDir

# Test Nginx configuration
Write-Host "[INFO] Testing Nginx configuration..." -ForegroundColor Yellow
$testResult = & ".\nginx" -t 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Nginx configuration test failed" -ForegroundColor Red
    Write-Host $testResult -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Nginx is already running
$pidFile = ".\logs\nginx.pid"
if (Test-Path $pidFile) {
    $pid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($pid) {
        Write-Host "[INFO] Nginx master PID: $pid. Reloading..." -ForegroundColor Yellow
        $reloadResult = & ".\nginx" -s reload 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[WARN] Reload failed. Restarting Nginx..." -ForegroundColor Yellow
            Stop-Process -Name "nginx" -Force -ErrorAction SilentlyContinue
            Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
            & ".\nginx" -p $NginxDir -c "conf\nginx.conf"
        }
    }
} else {
    Write-Host "[INFO] Starting Nginx fresh..." -ForegroundColor Yellow
    Stop-Process -Name "nginx" -Force -ErrorAction SilentlyContinue
    & ".\nginx" -p $NginxDir -c "conf\nginx.conf"
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Nginx is running" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to start Nginx" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "============================================" -ForegroundColor Green
Write-Host "Nginx started successfully!" -ForegroundColor Green
Write-Host "Check your nginx.conf for configured ports" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Green

Read-Host "Press Enter to continue"
