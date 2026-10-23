$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
$safe = $project -replace '\\','/'
$remote = "https://github.com/shoupeorg/pharos-multi-protocol-aggregator.git"
Set-Location $project
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "Tests failed." }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }
node scripts/capture-live-evidence.mjs
if ($LASTEXITCODE -ne 0) { throw "Live evidence capture failed." }
& (Join-Path $PSScriptRoot "deploy-cloudflare.ps1")
if ($LASTEXITCODE -ne 0) { throw "Deployment failed." }
git -c "safe.directory=$safe" add .
git -c "safe.directory=$safe" commit -m "Deliver Pharos multi-protocol aggregator"
if ($LASTEXITCODE -ne 0) { throw "Git commit failed." }
$origin = git -c "safe.directory=$safe" remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) { git -c "safe.directory=$safe" remote add origin $remote } elseif ($origin -ne $remote) { throw "Unexpected origin: $origin" }
git -c "safe.directory=$safe" push -u origin main
if ($LASTEXITCODE -ne 0) { throw "GitHub publication failed." }
