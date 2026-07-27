param(
  [string]$ArtifactRoot = "F:\Codex_File\artifacts\contam-studio\agent-06",
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$version = node -p "require('$($repo.Replace('\', '/'))/package.json').version"
$commit = git -C $repo rev-parse HEAD
$target = Join-Path $ArtifactRoot $version
if (-not (Test-Path $ArtifactRoot)) { New-Item -ItemType Directory -Path $ArtifactRoot -Force | Out-Null }
if (Test-Path $target) {
  $resolvedRoot = (Resolve-Path $ArtifactRoot).Path
  $resolvedTarget = (Resolve-Path $target).Path
  if (-not $resolvedTarget.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "artifact target escaped artifact root" }
  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $target "portable") -Force | Out-Null
Push-Location $repo
try {
  pnpm verify:release
  if (-not $SkipBuild) { pnpm tauri build --no-bundle --ci --no-sign }
  $binary = Join-Path $repo "src-tauri\target\release\contam-studio.exe"
  if (-not (Test-Path $binary)) { throw "Tauri release binary was not produced" }
  Copy-Item -LiteralPath $binary -Destination (Join-Path $target "portable\CONTAM-Studio.exe")
  $manifest = [ordered]@{
    schema_version = 1
    product = "CONTAM Studio"
    version = $version
    commit_sha = $commit
    build_kind = "release"
    unsigned_build = $true
    installer_status = "not_built_without_verified_windows_packager"
    clean_machine_acceptance = "blocked"
    files = @(@{ path = "portable/CONTAM-Studio.exe"; sha256 = (node (Join-Path $repo "scripts\file-sha256.mjs") (Join-Path $target "portable\CONTAM-Studio.exe")).Trim().ToLowerInvariant() })
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $target "manifest.json") -Encoding UTF8
  node scripts/audit-release.mjs $target
  Write-Host "Portable artifact: $target"
  Write-Host "unsigned_build=true; no installer signing/upload was performed."
} finally { Pop-Location }
