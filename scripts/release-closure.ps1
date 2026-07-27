param(
  [string]$ArtifactRoot = "F:\Codex_File\artifacts\contam-studio\agent-07",
  [switch]$SkipBuild,
  [switch]$ResetArtifacts
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$version = node -p "require('$($repo.Replace('\', '/'))/package.json').version"
$commit = git -C $repo rev-parse HEAD
$target = Join-Path $ArtifactRoot $version

if ($ResetArtifacts -and (Test-Path -LiteralPath $target)) {
  $rootFull = (Resolve-Path $ArtifactRoot).Path
  $targetFull = (Resolve-Path $target).Path
  if (-not $targetFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { throw "artifact target escaped artifact root" }
  Remove-Item -LiteralPath $targetFull -Recurse -Force
}

if (-not $SkipBuild) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-release.ps1") -ArtifactRoot $ArtifactRoot
  if ($LASTEXITCODE -ne 0) { throw "portable build failed" }
}

if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw "portable artifact directory is missing" }
$portable = Join-Path $target "portable\CONTAM-Studio.exe"
if (-not (Test-Path -LiteralPath $portable -PathType Leaf)) { throw "portable executable is missing" }

$tools = @{
  makensis = [bool](Get-Command makensis -ErrorAction SilentlyContinue)
  wix = [bool](Get-Command wix -ErrorAction SilentlyContinue)
  candle = [bool](Get-Command candle -ErrorAction SilentlyContinue)
  light = [bool](Get-Command light -ErrorAction SilentlyContinue)
}
$allPackagers = $tools.Values -notcontains $false
$installers = Join-Path $target "installers"
New-Item -ItemType Directory -Path $installers -Force | Out-Null
if ($allPackagers) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-installers.ps1") -ArtifactRoot $ArtifactRoot
  if ($LASTEXITCODE -ne 0) { throw "installer build failed" }
  $bundleRoot = Join-Path $repo "src-tauri\target\release\bundle"
  if (Test-Path -LiteralPath $bundleRoot) {
    Get-ChildItem -LiteralPath $bundleRoot -File -Recurse | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $installers $_.Name) -Force
    }
  }
  $installerStatus = "built_unsigned"
} else {
  $installerStatus = "blocked_environment"
}

$manifestPath = Join-Path $target "manifest.json"
if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $manifest.installer_status = $installerStatus
  $manifest.clean_machine_acceptance = "blocked"
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}

$installerInfo = [ordered]@{
  schema_version = 1
  version = $version
  commit_sha = $commit
  status = $installerStatus
  unsigned_build = $true
  uploaded = $false
  packager_tools = $tools
}
$installerInfo | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $installers "installer-status.json") -Encoding UTF8

$status = [ordered]@{
  schema_version = 1
  version = $version
  commit_sha = $commit
  portable_build = "passed"
  installer_build = $installerStatus
  clean_windows_install = "blocked"
  signature = "unsigned"
  official_contamx_simread = "not_tested"
  packager_tools = $tools
}
$status | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $target "release-closure-status.json") -Encoding UTF8
$diagnostics = Join-Path $target "diagnostics\release-diagnostics.json"
New-Item -ItemType Directory -Path (Split-Path -Parent $diagnostics) -Force | Out-Null
if (Test-Path -LiteralPath $diagnostics) { Remove-Item -LiteralPath $diagnostics -Force }
node (Join-Path $repo "scripts\generate-release-diagnostics.mjs") $diagnostics $version $commit "not_tested" "not_tested"
if ($LASTEXITCODE -ne 0) { throw "sanitized diagnostics generation failed" }
node (Join-Path $repo "scripts\audit-release.mjs") $target
if ($LASTEXITCODE -ne 0) { throw "release artifact audit failed" }
$status | ConvertTo-Json -Depth 6
