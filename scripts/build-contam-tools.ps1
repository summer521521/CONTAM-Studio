[CmdletBinding()]
param(
    [string]$DestinationRoot = "",
    [string]$DownloadUri = "https://www.nist.gov/document/contam-x-3403-windows-64bitzip",
    [string]$ExpectedZipSha256 = "3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052",
    [string]$ZipPath = "",
    [string]$ApprovedTempRoot = "",
    [switch]$SkipDownload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "lib\contam-temp-root.ps1")
. (Join-Path $PSScriptRoot "lib\contam-integrity.ps1")

function Assert-NistDownloadUri([string]$Uri) {
    $parsed = [Uri]$Uri
    if ($parsed.Scheme -ne "https" -or $parsed.Host -notin @("www.nist.gov", "nist.gov")) {
        throw "Contam tools must be downloaded from the official NIST HTTPS host."
    }
}

function Get-SafeRelativePath([string]$Root, [string]$Candidate) {
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd("\") + "\"
    $candidateFull = [IO.Path]::GetFullPath($Candidate)
    if (-not $candidateFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Archive entry escaped the extraction directory."
    }
    return $candidateFull.Substring($rootFull.Length).Replace("\", "/")
}

Assert-NistDownloadUri $DownloadUri
$destinationFull = if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
    Resolve-ContamToolsTaskRoot
} else {
    Resolve-ContamAbsolutePath $DestinationRoot
}
$approvedTempRoot = if ([string]::IsNullOrWhiteSpace($ApprovedTempRoot)) {
    if ([string]::IsNullOrWhiteSpace($DestinationRoot)) { Resolve-ContamTempRoot } else { $destinationFull }
} else {
    Resolve-ContamAbsolutePath $ApprovedTempRoot
}
if (-not (Test-ContamPathWithinRoot $destinationFull $approvedTempRoot)) {
    throw "Contam tool download and extraction must stay under the approved task temporary directory."
}
New-Item -ItemType Directory -Force -Path $destinationFull | Out-Null
$downloadDirectory = Join-Path $destinationFull "download"
$extractDirectory = Join-Path $destinationFull "extracted"
$runtimeDirectory = Join-Path $destinationFull "runtime"
New-Item -ItemType Directory -Force -Path $downloadDirectory, $extractDirectory, $runtimeDirectory | Out-Null

# These two directories are generated exclusively from the verified archive.
# Clear stale solver outputs (for example simread.log) before extraction so a
# previous smoke run can never leak into a portable or installer payload.
foreach ($generatedDirectory in @($extractDirectory, $runtimeDirectory)) {
    Get-ChildItem -LiteralPath $generatedDirectory -Force |
        Remove-Item -Recurse -Force
}

if ([string]::IsNullOrWhiteSpace($ZipPath)) {
    $ZipPath = Join-Path $downloadDirectory "contam-x-3.4.0.3-win64.zip"
}
$ZipPath = [IO.Path]::GetFullPath($ZipPath)
if (-not (Test-ContamPathWithinRoot $ZipPath $approvedTempRoot)) {
    throw "NIST ZIP must stay under the approved task temporary directory."
}
if (-not $SkipDownload) {
    if (-not (Test-ContamPathWithinRoot $ZipPath $downloadDirectory)) {
        throw "Downloaded ZIP must stay under the task temporary directory."
    }
    Invoke-WebRequest -Uri $DownloadUri -OutFile $ZipPath -UseBasicParsing
}
if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
    throw "The NIST ZIP is missing: $ZipPath"
}

# Check the digest before Expand-Archive so an untrusted or partial ZIP never
# creates a runtime tree.
$actualZipSha256 = Get-ContamSha256Hex $ZipPath
if ($actualZipSha256 -ne $ExpectedZipSha256.ToUpperInvariant()) {
    throw "NIST ZIP SHA-256 mismatch. Expected $ExpectedZipSha256, got $actualZipSha256."
}

Expand-Archive -LiteralPath $ZipPath -DestinationPath $extractDirectory -Force
$files = @(Get-ChildItem -LiteralPath $extractDirectory -Recurse -File | Sort-Object FullName)
if ($files.Count -eq 0) { throw "The verified NIST ZIP contained no files." }
$requiredNames = @("contamx3.exe", "contamx.exe", "simread.exe", "simcomp.exe", "prjup.exe")
$foundNames = @($files | Where-Object { $requiredNames -contains $_.Name.ToLowerInvariant() } | ForEach-Object Name | Sort-Object -Unique)
foreach ($required in @("simread.exe", "simcomp.exe", "prjup.exe")) {
    if ($foundNames -notcontains $required) { throw "The NIST archive did not contain required tool $required." }
}
if (-not ($foundNames -contains "contamx3.exe" -or $foundNames -contains "contamx.exe")) {
    throw "The NIST archive did not contain ContamX."
}

foreach ($file in $files) {
    $relative = Get-SafeRelativePath $extractDirectory $file.FullName
    $target = Join-Path $runtimeDirectory $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

$entries = @($files | ForEach-Object {
    [ordered]@{
        file = Get-SafeRelativePath $extractDirectory $_.FullName
        sha256 = Get-ContamSha256Hex $_.FullName
        source = "NIST official ContamX 3.4.0.3 Windows x64 ZIP"
    }
})
$manifest = [ordered]@{
    schema_version = 1
    product = "NIST CONTAM"
    release_version = "3.4.0.8"
    contamx_version = "3.4.0.3"
    platform = "windows"
    architecture = "x86_64"
    official_page = "https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/download-contam"
    download_url = $DownloadUri
    zip_sha256 = $actualZipSha256
    acquired_at_utc = ((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"))
    programs_used = @("contamx3.exe", "simread.exe", "simcomp.exe", "prjup.exe")
    files = $entries
}
$manifestPath = Join-Path $destinationFull "contam-tools.manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "Verified NIST ZIP: $actualZipSha256"
Write-Host "Runtime files: $($files.Count); manifest: $manifestPath"
