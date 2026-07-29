param(
  [string]$ArtifactRoot = "F:\Codex_File\artifacts\contam-studio\release",
  [switch]$RequireInstallers
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256Hex([string]$FilePath) {
  $stream = [IO.File]::OpenRead($FilePath)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") })
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$version = (node -p "require('$($repo.Replace('\', '/'))/package.json').version").Trim()
$commit = (git -C $repo rev-parse HEAD).Trim()
$target = Join-Path $ArtifactRoot $version
$portable = Join-Path $target "portable"
$installers = Join-Path $target "installers"
$manifestPath = Join-Path $target "manifest.json"
$statusPath = Join-Path $target "release-closure-status.json"
$installerStatusPath = Join-Path $installers "installer-status.json"

foreach ($required in @($portable, $manifestPath, $statusPath, $installerStatusPath)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "release input is missing: $required" }
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
$installerStatus = Get-Content -LiteralPath $installerStatusPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -ne $version -or $manifest.commit_sha -ne $commit) {
  throw "release manifest does not match the current version and commit"
}
if ($status.version -ne $version -or $status.commit_sha -ne $commit) {
  throw "release closure status does not match the current version and commit"
}
if ($RequireInstallers -and $installerStatus.status -ne "built_unsigned") {
  throw "complete NSIS/MSI assets are required"
}

$assets = Join-Path $target "release-assets"
if (Test-Path -LiteralPath $assets) {
  $targetFull = [IO.Path]::GetFullPath($target).TrimEnd("\") + "\"
  $assetsFull = [IO.Path]::GetFullPath($assets)
  if (-not $assetsFull.StartsWith($targetFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "release asset directory escaped the version target"
  }
  Remove-Item -LiteralPath $assetsFull -Recurse -Force
}
New-Item -ItemType Directory -Path $assets -Force | Out-Null

$portableZipName = "CONTAM-Studio-v$($version)-windows-x64-portable.zip"
$portableZip = Join-Path $assets $portableZipName
Compress-Archive -Path (Join-Path $portable "*") -DestinationPath $portableZip -CompressionLevel Optimal

$nsisInstaller = @(Get-ChildItem -LiteralPath $installers -File | Where-Object { $_.Extension -eq ".exe" })
$msiInstaller = @(Get-ChildItem -LiteralPath $installers -File | Where-Object { $_.Extension -eq ".msi" })
if ($nsisInstaller.Count -ne 1 -or $msiInstaller.Count -ne 1) {
  throw "release inputs must contain exactly one NSIS installer and one MSI"
}
$nsisAssetName = "CONTAM-Studio-v$($version)-windows-x64-setup.exe"
$msiAssetName = "CONTAM-Studio-v$($version)-windows-x64.msi"
Copy-Item -LiteralPath $nsisInstaller[0].FullName -Destination (Join-Path $assets $nsisAssetName)
Copy-Item -LiteralPath $msiInstaller[0].FullName -Destination (Join-Path $assets $msiAssetName)
if ($RequireInstallers -and
    @(Get-ChildItem -LiteralPath $assets -File | Where-Object { $_.Extension -in @(".exe", ".msi") }).Count -ne 2) {
  throw "release assets must contain exactly one NSIS installer and one MSI"
}

Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $assets "manifest.json")
Copy-Item -LiteralPath $statusPath -Destination (Join-Path $assets "release-closure-status.json")
$checksumTargets = @(
  Get-ChildItem -LiteralPath $assets -File |
    Where-Object { $_.Name -ne "SHA256SUMS.txt" } |
    Sort-Object Name
)
$checksumLines = @(
  $checksumTargets | ForEach-Object {
    $hash = Get-Sha256Hex $_.FullName
    "$hash  $($_.Name)"
  }
)
$checksumLines | Set-Content -LiteralPath (Join-Path $assets "SHA256SUMS.txt") -Encoding ASCII

[ordered]@{
  schema_version = 1
  version = $version
  commit_sha = $commit
  unsigned_build = $true
  release_asset_count = @(Get-ChildItem -LiteralPath $assets -File).Count
  assets = @(
    Get-ChildItem -LiteralPath $assets -File |
      Sort-Object Name |
      ForEach-Object {
        [ordered]@{
          name = $_.Name
          size_bytes = $_.Length
          sha256 = (Get-Sha256Hex $_.FullName)
        }
      }
  )
} | ConvertTo-Json -Depth 5
