[CmdletBinding()]
param(
    [string]$TaskRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\lib\contam-temp-root.ps1")
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$integrityHelper = Join-Path $repo "scripts\lib\contam-integrity.ps1"
. $integrityHelper
$builderSource = Get-Content -LiteralPath (Join-Path $repo "scripts\build-contam-tools.ps1") -Raw -Encoding UTF8
$prepareSource = Get-Content -LiteralPath (Join-Path $repo "scripts\prepare-contam-tools-runtime.ps1") -Raw -Encoding UTF8
if ($builderSource -match "Get-FileHash" -or $prepareSource -match "Get-FileHash") {
    throw "CONTAM tool scripts must not depend on Get-FileHash module auto-loading."
}
if ($builderSource -notmatch "contam-integrity\.ps1" -or $prepareSource -notmatch "contam-integrity\.ps1") {
    throw "Build and prepare scripts must share the CONTAM integrity helper."
}
$root = if ([string]::IsNullOrWhiteSpace($TaskRoot)) { Resolve-ContamTempRoot } else { Resolve-ContamAbsolutePath $TaskRoot }
$caseRoot = Join-Path $root ("tests\contam-tools-script-" + [Guid]::NewGuid().ToString("N"))
$badRoot = Join-Path $caseRoot "bad"
$goodRoot = Join-Path $caseRoot "good"
New-Item -ItemType Directory -Force -Path $root, $badRoot, $goodRoot | Out-Null

try {
    $payloadRoot = Join-Path $badRoot "payload"
    New-Item -ItemType Directory -Path $payloadRoot | Out-Null
    Set-Content -LiteralPath (Join-Path $payloadRoot "not-a-nist-file.txt") -Value "fixture" -Encoding UTF8
    $directDigest = Get-ContamSha256Hex (Join-Path $payloadRoot "not-a-nist-file.txt")
    if ($directDigest -notmatch "^[0-9A-F]{64}$") { throw "shared SHA-256 helper did not return uppercase hexadecimal" }
    $badZip = Join-Path $badRoot "bad.zip"
    Compress-Archive -Path (Join-Path $payloadRoot "*") -DestinationPath $badZip
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $badOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-contam-tools.ps1") -DestinationRoot $badRoot -ApprovedTempRoot $root -SkipDownload -ZipPath $badZip 2>&1)
        $badExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($badExitCode -eq 0 -or (($badOutput -join "\n") -notmatch "SHA-256 mismatch")) {
        throw "tampered ZIP did not fail at the hash gate"
    }
    $extracted = @(Get-ChildItem -LiteralPath (Join-Path $badRoot "extracted") -Recurse -File -ErrorAction SilentlyContinue)
    if ($extracted.Count -ne 0) { throw "tampered ZIP was extracted before the hash failure" }

    $cachedZip = Join-Path $root "contam-tools\download\contam-x-3.4.0.3-win64.zip"
    if (Test-Path -LiteralPath $cachedZip -PathType Leaf) {
        $staleRuntime = Join-Path $goodRoot "runtime"
        New-Item -ItemType Directory -Path $staleRuntime -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $staleRuntime "simread.log") -Value "stale local path evidence" -Encoding UTF8
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-contam-tools.ps1") -DestinationRoot $goodRoot -ApprovedTempRoot $root -SkipDownload -ZipPath $cachedZip
        if ($LASTEXITCODE -ne 0) { throw "cached official NIST ZIP did not pass the acquisition script" }
        if (Test-Path -LiteralPath (Join-Path $staleRuntime "simread.log")) { throw "stale runtime output survived verified extraction" }
        $manifest = Get-Content -LiteralPath (Join-Path $goodRoot "contam-tools.manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($manifest.zip_sha256 -ne "3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052") { throw "official NIST ZIP digest was not preserved" }
        if (@($manifest.files).Count -lt 4) { throw "official NIST manifest is incomplete" }
        Write-Host "Contam tools script test passed: hash gate and cached official ZIP verification."
    } else {
        Write-Host "Contam tools script hash-gate test passed; cached official ZIP was not present, so success extraction was not rerun."
    }
}
finally {
    Remove-Item -LiteralPath $caseRoot -Recurse -Force -ErrorAction SilentlyContinue
}
