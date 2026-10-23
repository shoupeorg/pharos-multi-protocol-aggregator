$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project
$name = "pharos-multi-protocol-aggregator"
$dbList = npx.cmd wrangler d1 list --json | ConvertFrom-Json
$matches = @($dbList | Where-Object { $_.name -eq $name })
if ($matches.Count -eq 0) {
  npx.cmd wrangler d1 create $name --location apac --update-config=false
  if ($LASTEXITCODE -ne 0) { throw "D1 creation failed." }
  $dbList = npx.cmd wrangler d1 list --json | ConvertFrom-Json
  $matches = @($dbList | Where-Object { $_.name -eq $name })
}
if ($matches.Count -ne 1) { throw "Expected exactly one D1 database named $name; found $($matches.Count)." }
$databaseId = [string]$matches[0].uuid
if ($databaseId -notmatch '^[0-9a-fA-F-]{36}$') { throw "D1 database ID is invalid." }
$configPath = Join-Path $project "wrangler.jsonc"
$config = Get-Content -Raw $configPath
$config = $config -replace '"database_id"\s*:\s*"[^"]+"', ('"database_id": "' + $databaseId + '"')
[System.IO.File]::WriteAllText($configPath, $config, [System.Text.UTF8Encoding]::new($false))
$previousCi=$env:CI;$env:CI="true"
try { npx.cmd wrangler d1 migrations apply $name --remote; if ($LASTEXITCODE -ne 0) { throw "D1 migration failed." } } finally { $env:CI=$previousCi }
npm.cmd run deploy
if ($LASTEXITCODE -ne 0) { throw "Deployment failed." }
