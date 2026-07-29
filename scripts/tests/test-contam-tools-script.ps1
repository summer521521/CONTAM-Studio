[CmdletBinding()]
param(
    [string]$TaskRoot = "F:\Codex_File\phase-6c-user-first-runtime"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$root = [IO.Path]::GetFullPath($TaskRoot).TrimEnd("\")
$caseRoot = Join-Path $root ("tests\contam-tools-script-" + [Guid]::NewGuid().ToString("N"))
$badRoot = Join-Path $caseRoot "bad"
$goodRoot = Join-Path $caseRoot "good"
New-Item -ItemType Directory -Path $badRoot, $goodRoot | Out-Null

try {
    $payloadRoot = Join-Path $badRoot "payload"
    New-Item -ItemType Directory -Path $payloadRoot | Out-Null
    Set-Content -LiteralPath (Join-Path $payloadRoot "not-a-nist-file.txt") -Value "fixture" -Encoding UTF8
    $badZip = Join-Path $badRoot "bad.zip"
    Compress-Archive -Path (Join-Path $payloadRoot "*") -DestinationPath $badZip
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $badOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-contam-tools.ps1") -DestinationRoot $badRoot -SkipDownload -ZipPath $badZip 2>&1)
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
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\build-contam-tools.ps1") -DestinationRoot $goodRoot -SkipDownload -ZipPath $cachedZip
        if ($LASTEXITCODE -ne 0) { throw "cached official NIST ZIP did not pass the acquisition script" }
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
