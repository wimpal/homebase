# Pre-deploy: stop Node on port 3000 (Prisma DLL lock), then npm run build.
# Called from package.json before deploy-nas.ps1 — do not call npm from inside deploy-nas.ps1.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

$listeners = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
foreach ($conn in $listeners) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    if ($proc.Name -ne "node") {
        Write-Warning "Port 3000 is in use by $($proc.Name) (PID $($proc.Id)); not stopping."
        continue
    }
    Write-Host "Stopping dev server on port 3000 (PID $($proc.Id))..."
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Host "Pre-deploy build..."
Push-Location $repoRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Pre-deploy build failed. Fix errors before deploying to NAS."
        exit $LASTEXITCODE
    }
    Write-Host "Pre-deploy build OK."
}
finally {
    Pop-Location
}
