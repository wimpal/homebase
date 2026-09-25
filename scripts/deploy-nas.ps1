# Deploy Homebase to the NAS.
#
# Default (fast / dev): git pull on the NAS SMB share, docker compose via SSH,
# migrations + health. No local preflight build, no mcp:smoke, no smoke purge.
# PC setup (SSH key, docker group): docs/nas-pc-setup.md
#
# Full (release gate): local npm run build, then deploy + household-scoped smoke
# purge (pre + post) + mcp:smoke against http://<NAS>:3000.
#
#   npm run deploy:nas              # fast (default)
#   npm run deploy:nas:full         # preflight + smoke + purge
#   npm run deploy:nas -- -Full     # same as deploy:nas:full
#   npm run deploy:nas -- -Push
#   npm run deploy:nas -- -UseScp
#   HOMEBASE_SMOKE_KEEP_DATA=1      # skip purge when -Full (debug)
param(
    [string]$NasHost,
    [string]$NasUser,
    [string]$NasPath,
    [string]$NasShare,
    [string]$Branch,
    [switch]$Push,
    [switch]$UseScp,
    [switch]$Full,
    [switch]$SkipPreflight,
    [switch]$SkipSmoke,
    [int]$SshPort = 0
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        if (-not $name) { return }
        if ($name -like "NAS_*") {
            Set-Item -Path "Env:$name" -Value $value
        }
        elseif (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

function Import-McpSmokeEnv {
    param(
        [string]$NasShare,
        [string]$RepoRoot,
        [switch]$AllowLocalRepo
    )
    # Prefer NAS share .env (same file docker compose reads). Local repo .env only
    # when AllowLocalRepo (legacy) - can diverge from the running app.
    $candidates = @(
        (Join-Path $NasShare ".env")
    )
    if ($AllowLocalRepo) {
        $candidates += (Join-Path $RepoRoot ".env")
    }
    foreach ($path in $candidates) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        Write-Host "Loading MCP smoke credentials from $path"
        Get-Content -LiteralPath $path | ForEach-Object {
            $line = $_.Trim()
            if ($line -eq "" -or $line.StartsWith("#")) { return }
            $eq = $line.IndexOf("=")
            if ($eq -lt 1) { return }
            $name = $line.Substring(0, $eq).Trim()
            $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
            if ($name -eq "SERVICE_TOKEN" -or $name -eq "MCP_HOUSEHOLD_ID") {
                if ($value) {
                    Set-Item -Path "Env:$name" -Value $value
                }
            }
        }
        if ($env:SERVICE_TOKEN -and $env:MCP_HOUSEHOLD_ID) {
            return $true
        }
    }
    return $false
}

function Import-McpSmokeEnvFromContainer {
    param(
        [string]$Remote,
        [int]$SshPort,
        [string]$NasPath
    )
    # Emit KEY=value lines (bare printenv A B prints values only - easy to mis-parse).
    $cmd = 'set -eu && cd ' + (ConvertTo-BashSingleQuoted $NasPath) +
        ' && docker compose exec -T app env | grep -E ''^(SERVICE_TOKEN|MCP_HOUSEHOLD_ID)='''
    Write-Host "Reading MCP smoke credentials from running app container on NAS..."
    $output = & ssh -p $SshPort $Remote $cmd 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not read SERVICE_TOKEN from container: $output"
        return $false
    }
    foreach ($line in @($output)) {
        $text = "$line".Trim()
        if ($text -match '^SERVICE_TOKEN=(.*)$') {
            $env:SERVICE_TOKEN = $Matches[1].Trim().Trim('"').Trim("'")
        }
        elseif ($text -match '^MCP_HOUSEHOLD_ID=(.*)$') {
            $env:MCP_HOUSEHOLD_ID = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    if ($env:SERVICE_TOKEN -and $env:MCP_HOUSEHOLD_ID) {
        Write-Host "MCP smoke credentials loaded from container (token length $($env:SERVICE_TOKEN.Length), household length $($env:MCP_HOUSEHOLD_ID.Length))"
        return $true
    }
    Write-Warning "Container did not return SERVICE_TOKEN and MCP_HOUSEHOLD_ID"
    return $false
}

function ConvertTo-BashSingleQuoted {
    param([string]$Value)
    # Wrap in single quotes; embed a literal ' as: '\''
    $q = [char]39
    $escaped = $Value.Replace([string]$q, ($q + '\' + $q + $q))
    return ($q + $escaped + $q)
}

function Invoke-NasSmokePurge {
    param(
        [string]$Remote,
        [int]$SshPort,
        [string]$NasPath,
        [string]$HouseholdId,
        [string]$Label
    )
    if ($env:HOMEBASE_SMOKE_KEEP_DATA -eq "1") {
        Write-Host "Skipping NAS smoke purge ($Label) - HOMEBASE_SMOKE_KEEP_DATA=1"
        return
    }
    if (-not $HouseholdId) {
        Write-Error "NAS smoke purge ($Label) requires MCP_HOUSEHOLD_ID (refusing unscoped purge)."
        exit 1
    }
    # Build remote sh command with PowerShell single-quoted fragments so && is never parsed here.
    $remoteCmd = 'set -eu && cd ' + (ConvertTo-BashSingleQuoted $NasPath) +
        ' && docker compose exec -T -e MCP_HOUSEHOLD_ID=' + (ConvertTo-BashSingleQuoted $HouseholdId) +
        ' worker npx tsx scripts/purge-smoke-data.ts --apply'
    Write-Host "NAS smoke purge ($Label) via SSH $Remote ..."
    & ssh -p $SshPort $Remote $remoteCmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "NAS smoke purge ($Label) failed."
        exit $LASTEXITCODE
    }
    Write-Host "NAS smoke purge ($Label) OK."
}

function Get-DeployTempFile {
    $tempDir = [Environment]::GetEnvironmentVariable("TEMP", "Process")
    if (-not $tempDir) { $tempDir = [Environment]::GetEnvironmentVariable("TMP", "Process") }
    if (-not $tempDir) { $tempDir = $repoRoot }
    return [System.IO.Path]::Combine($tempDir, "homebase-deploy.tar.gz")
}

function Get-ShareChildPath {
    param([string]$ShareRoot, [string]$Child)
    $root = $ShareRoot.TrimEnd('\')
    return "$root\$Child"
}

function Test-NasShareReady {
    param([string]$ShareRoot)
    if ([string]::IsNullOrWhiteSpace($ShareRoot)) { return $false }
    if (-not (Test-Path -LiteralPath $ShareRoot)) { return $false }
    $gitDir = Get-ShareChildPath $ShareRoot ".git"
    return Test-Path -LiteralPath $gitDir
}

function Get-DockerRemoteCmd {
    param([string]$TargetNasPath)
    return (
        "set -eu && " +
        "cd '$TargetNasPath' && " +
        "echo '==> Building and restarting HomeBase...' && " +
        "docker compose up --build -d && " +
        "echo '==> Migrating shopping slots (T-035)...' && " +
        "docker compose exec -T worker npx tsx scripts/migrate-shopping-slots.ts && " +
        "echo '==> Migrating project work items (T-082)...' && " +
        "docker compose exec -T worker npx tsx scripts/migrate-project-work-items.ts && " +
        "echo '==> Applying database schema (prisma db push)...' && " +
        "docker compose exec -T worker npx prisma db push --accept-data-loss && " +
        "echo '==> Ensuring product name index...' && " +
        "docker compose exec -T worker npx tsx scripts/ensure-product-ci-index.ts && " +
        "docker compose logs --tail=30 && " +
        "sleep 2 && " +
        "echo '==> Health check...' && " +
        "curl -sf http://127.0.0.1:3000/health"
    )
}

function Invoke-Git {
    param(
        [string]$WorkTree = $repoRoot,
        [string[]]$GitArgs
    )
    & git -C $WorkTree @GitArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Import-DotEnv (Join-Path $repoRoot ".env")

if (-not $NasHost) { $NasHost = $(if ($env:NAS_HOST) { $env:NAS_HOST } else { "192.168.1.142" }) }
if (-not $NasUser) { $NasUser = $(if ($env:NAS_USER) { $env:NAS_USER } else { "wim" }) }
if (-not $NasPath) { $NasPath = $(if ($env:NAS_PATH) { $env:NAS_PATH } else { "/volume1/docker/homebase" }) }
if (-not $NasShare) { $NasShare = $(if ($env:NAS_SHARE) { $env:NAS_SHARE } else { "\\192.168.1.142\docker\homebase" }) }
if (-not $Branch) { $Branch = $(if ($env:NAS_BRANCH) { $env:NAS_BRANCH } else { "main" }) }
if (-not $SshPort -or $SshPort -eq 0) {
    $SshPort = $(if ($env:NAS_SSH_PORT) { [int]$env:NAS_SSH_PORT } else { 22 })
}
if (-not $UseScp -and $env:NAS_USE_SCP -match '^(1|true|yes)$') {
    $UseScp = $true
}

$remote = "${NasUser}@${NasHost}"
$useShare = (-not $UseScp) -and (Test-NasShareReady $NasShare)

# Fast is default. -Full enables local preflight + smoke/purge gate.
$runPreflight = $Full -and -not $SkipPreflight
$runSmoke = $Full -and -not $SkipSmoke
# Purge only around a full gate (pre always on Full; post when smoke runs).
$runPurge = $Full

if ($Full) {
    Write-Host "Deploy mode: FULL (preflight=$runPreflight, smoke=$runSmoke, purge=$runPurge)"
}
else {
    Write-Host "Deploy mode: FAST (no local build, no mcp:smoke). Use -Full / npm run deploy:nas:full for the release gate."
}

if ($runPreflight) {
    Write-Host "Running pre-deploy build (deploy-preflight.ps1)..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "deploy-preflight.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Push) {
    Write-Host "Pushing $Branch to origin from $repoRoot ..."
    Invoke-Git -GitArgs @("push", "origin", $Branch)
}

if ($useShare) {
    Write-Host "Deploy mode: NAS share (git pull)"
    Write-Host "Pulling $Branch on NAS share $NasShare ..."
    $dirty = & git -C $NasShare status --porcelain
    if ($dirty) {
        Write-Host ""
        Write-Host "NAS share has local modifications (will block pull):" -ForegroundColor Yellow
        & git -C $NasShare status --short
        Write-Host ""
        Write-Error @"
Deploy aborted - the NAS share is not a clean git checkout.
Review the files above on $NasShare. Either:
  - commit and push them from the NAS (if intentional), or
  - discard manually: git -C '$NasShare' checkout -- .
  - stash: git -C '$NasShare' stash push -m 'pre-deploy'
Then re-run npm run deploy:nas
"@
        exit 1
    }
    Invoke-Git -WorkTree $NasShare -GitArgs @("fetch", "origin", $Branch)
    Invoke-Git -WorkTree $NasShare -GitArgs @("checkout", $Branch)
    Invoke-Git -WorkTree $NasShare -GitArgs @("pull", "--ff-only", "origin", $Branch)

    $remoteCmd = Get-DockerRemoteCmd -TargetNasPath $NasPath
    Write-Host "Building on NAS (${remote}:${NasPath})..."
    & ssh -p $SshPort $remote $remoteCmd
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
else {
    if ($UseScp) {
        Write-Host "Deploy mode: scp (explicit)"
    }
    else {
        Write-Warning "NAS share not reachable at $NasShare; falling back to scp upload."
    }

    $remoteTar = "/tmp/homebase-deploy.tar.gz"
    $localTar = Get-DeployTempFile

    $dirty = & git -C $repoRoot status --porcelain
    if ($dirty) {
        Write-Warning "Uncommitted changes are not included; only committed files on $Branch are deployed."
    }

    if (-not (git -C $repoRoot rev-parse --verify "$Branch^{commit}" 2>$null)) {
        Write-Error "Branch '$Branch' not found in $repoRoot. Commit first or pick another branch."
        exit 1
    }

    Write-Host "Packaging $Branch..."
    if (Test-Path -LiteralPath $localTar) { Remove-Item -LiteralPath $localTar -Force }
    Invoke-Git -GitArgs @("archive", "--format=tar.gz", "-o", $localTar, $Branch)

    try {
        Write-Host "Uploading to ${remote}:${remoteTar} ..."
        & scp -P $SshPort $localTar "${remote}:${remoteTar}"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        $remoteCmd = (
            "set -eu && " +
            "mkdir -p '$NasPath' && " +
            "cd '$NasPath' && " +
            "tar xzf '$remoteTar' && " +
            "rm -f '$remoteTar' && " +
            (Get-DockerRemoteCmd -TargetNasPath $NasPath)
        )

        Write-Host "Building on NAS (${remote}:${NasPath})..."
        & ssh -p $SshPort $remote $remoteCmd
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    finally {
        if (Test-Path -LiteralPath $localTar) { Remove-Item -LiteralPath $localTar -Force }
    }
}

if (-not $runPurge -and -not $runSmoke) {
    Write-Host "Skipping MCP smoke and purge (fast deploy). Run npm run deploy:nas:full before trusting a release."
}
else {
    # Load MCP credentials from the running app (required for smoke + household-scoped purge).
    $smokeCredsOk = Import-McpSmokeEnvFromContainer -Remote $remote -SshPort $SshPort -NasPath $NasPath
    if (-not $smokeCredsOk) {
        Write-Host "Container credential load failed; trying NAS share .env (same file compose reads)..."
        $smokeCredsOk = Import-McpSmokeEnv -NasShare $NasShare -RepoRoot $repoRoot
    }
    if (-not $smokeCredsOk -or -not $env:SERVICE_TOKEN -or -not $env:MCP_HOUSEHOLD_ID) {
        Write-Warning "No SERVICE_TOKEN / MCP_HOUSEHOLD_ID from app container or NAS share .env - skipping smoke and scoped purge."
    }
    else {
        Invoke-NasSmokePurge -Remote $remote -SshPort $SshPort -NasPath $NasPath `
            -HouseholdId $env:MCP_HOUSEHOLD_ID -Label "pre-smoke"

        if ($runSmoke) {
            Write-Host "Post-deploy MCP smoke (http://${NasHost}:3000)..."
            Push-Location $repoRoot
            $smokeFailed = $false
            try {
                $prevBase = $env:MCP_BASE_URL
                $env:MCP_BASE_URL = "http://${NasHost}:3000"
                $env:HOMEBASE_SMOKE_SKIP_DOTENV = "1"
                # Ensure remote smoke cleanup SSH targets the same NAS as this deploy.
                $env:NAS_HOST = $NasHost
                $env:NAS_USER = $NasUser
                $env:NAS_PATH = $NasPath
                $env:NAS_SSH_PORT = "$SshPort"
                # lights smoke is list-only on remote (T-038)
                & npm run mcp:smoke
                if ($LASTEXITCODE -ne 0) {
                    $smokeFailed = $true
                    Write-Error "Post-deploy mcp:smoke failed."
                }
                else {
                    Write-Host "Post-deploy MCP smoke OK."
                }
            }
            finally {
                if ($null -ne $prevBase) { $env:MCP_BASE_URL = $prevBase }
                else { Remove-Item Env:MCP_BASE_URL -ErrorAction SilentlyContinue }
                Remove-Item Env:HOMEBASE_SMOKE_SKIP_DOTENV -ErrorAction SilentlyContinue
                Pop-Location
                # Always purge after smoke attempt (smoke also self-cleans; this catches failures).
                Invoke-NasSmokePurge -Remote $remote -SshPort $SshPort -NasPath $NasPath `
                    -HouseholdId $env:MCP_HOUSEHOLD_ID -Label "post-smoke"
            }
            if ($smokeFailed) { exit 1 }
        }
        else {
            Write-Host "Skipping post-deploy MCP smoke (-SkipSmoke); pre-smoke purge already ran."
        }
    }
}

Write-Host ""
Write-Host "Deploy finished. App: http://${NasHost}:3000/"
