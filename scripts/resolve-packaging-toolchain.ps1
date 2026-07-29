param(
  [string]$ToolchainRoot = "F:\Codex_File\toolchains\contam-studio-packaging",
  [string]$ManifestPath = ""
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
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
  $ManifestPath = Join-Path $repo "docs\release\agent-08-packaging-toolchain.json"
}

function Assert-UnderRoot {
  param([string]$Candidate, [string]$Root)
  $candidateFull = [IO.Path]::GetFullPath($Candidate).TrimEnd("\")
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd("\")
  if (-not $candidateFull.StartsWith($rootFull + "\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "packaging tool path escaped the toolchain root"
  }
  return $candidateFull
}

function Get-VerifiedFile {
  param([string]$RelativePath, [string]$ExpectedHash)
  $candidate = Assert-UnderRoot (Join-Path $ToolchainRoot ($RelativePath -replace "/", "\")) $ToolchainRoot
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "missing packaging tool file: $RelativePath" }
  $actual = Get-Sha256Hex $candidate
  if ($actual -ne $ExpectedHash.ToUpperInvariant()) { throw "packaging tool hash mismatch: $RelativePath" }
  return $candidate
}

if (-not (Test-Path -LiteralPath $ToolchainRoot -PathType Container)) { throw "packaging toolchain root is missing: $ToolchainRoot" }
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "packaging toolchain manifest is missing" }
$manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$nsis = Get-VerifiedFile ([string]$manifest.tools.nsis.executable_relative_path) ([string]$manifest.tools.nsis.executable_sha256)
$candle = Get-VerifiedFile ([string]$manifest.tools.wix.candle_relative_path) ([string]$manifest.tools.wix.candle_sha256)
$light = Get-VerifiedFile ([string]$manifest.tools.wix.light_relative_path) ([string]$manifest.tools.wix.light_sha256)
$tauriPlugin = Get-VerifiedFile ([string]$manifest.tools.tauri_nsis_utils.relative_path) ([string]$manifest.tools.tauri_nsis_utils.sha256)

$nsisVersion = ((& $nsis /VERSION 2>&1) | ForEach-Object { $_.ToString() } | Where-Object { $_.Trim() } | Select-Object -Last 1).Trim()
if ($nsisVersion -ne "v$($manifest.tools.nsis.version)") { throw "unexpected NSIS version: $nsisVersion" }
$candleVersionText = ((& $candle -? 2>&1) | ForEach-Object { $_.ToString() }) -join "`n"
$lightVersionText = ((& $light -? 2>&1) | ForEach-Object { $_.ToString() }) -join "`n"
if ($candleVersionText -notmatch [regex]::Escape([string]$manifest.tools.wix.version)) { throw "unexpected WiX candle version" }
if ($lightVersionText -notmatch [regex]::Escape([string]$manifest.tools.wix.version)) { throw "unexpected WiX light version" }

[pscustomobject]@{
  toolchain_root = [IO.Path]::GetFullPath($ToolchainRoot).TrimEnd("\")
  nsis = [pscustomobject]@{ path = $nsis; version = $nsisVersion; root = (Split-Path -Parent (Split-Path -Parent $nsis)) }
  candle = [pscustomobject]@{ path = $candle; version = [string]$manifest.tools.wix.version; root = (Split-Path -Parent $candle) }
  light = [pscustomobject]@{ path = $light; version = [string]$manifest.tools.wix.version; root = (Split-Path -Parent $light) }
  tauri_nsis_utils = [pscustomobject]@{ path = $tauriPlugin; version = [string]$manifest.tools.tauri_nsis_utils.version; root = (Split-Path -Parent $tauriPlugin) }
} | ConvertTo-Json -Depth 5 -Compress
