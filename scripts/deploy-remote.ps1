# Deploy HomeBase from your dev machine to the NAS via SSH.
# Usage:
#   .\scripts\deploy-remote.ps1 -NasHost 192.168.1.50 -NasUser admin -NasPath /volume1/docker/homebase
#
# Requires: SSH access to the NAS, git repo cloned at $NasPath on the NAS.

param(
    [Parameter(Mandatory = $true)]
    [string]$NasHost,

    [Parameter(Mandatory = $true)]
    [string]$NasUser,

    [Parameter(Mandatory = $true)]
    [string]$NasPath
)

$ErrorActionPreference = "Stop"

Write-Host "==> Pushing local commits (if any)..."
git push 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "git push failed or no remote configured; continuing with NAS pull anyway."
}

$remoteCmd = "cd '$NasPath' && git pull && chmod +x scripts/deploy.sh && ./scripts/deploy.sh"

Write-Host "==> Deploying to ${NasUser}@${NasHost}:${NasPath}..."
ssh "${NasUser}@${NasHost}" $remoteCmd

Write-Host "==> Deploy complete."
