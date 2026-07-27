Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceRoot = Join-Path $root "contracts\python-rust-bridge\v1.2"
$checker = Join-Path $PSScriptRoot "test-bridge-json-placeholder-contract.ps1"
$tempBase = if ($env:RUNNER_TEMP) { Join-Path $env:RUNNER_TEMP "contam-studio" } else { "F:\Codex_File\temp\contam-studio" }
$tempRoot = Join-Path $tempBase ("fnd-04-placeholders-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function New-CaseRoot {
    param([string]$Name)
    $caseRoot = Join-Path $tempRoot $Name
    Copy-Item -LiteralPath $sourceRoot -Destination $caseRoot -Recurse
    return $caseRoot
}

function Invoke-ExpectedFailure {
    param([string]$Name, [string]$Diagnostic, [scriptblock]$Mutate)
    $caseRoot = New-CaseRoot $Name
    & $Mutate $caseRoot
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& powershell.exe -NoProfile -File $checker -ContractRoot $caseRoot 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -eq 0) {
        throw "Mutation '${Name}' unexpectedly passed."
    }
    $normalizedOutput = (($output -join "`n") -replace '\s+', '')
    if ($normalizedOutput -notmatch [regex]::Escape($Diagnostic)) {
        throw "Mutation '${Name}' failed without ${Diagnostic}; output=$($output -join ' | ')"
    }
}

try {
    & powershell.exe -NoProfile -File $checker -ContractRoot $sourceRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Tracked bridge JSON placeholders did not pass before mutation testing."
    }
    Invoke-ExpectedFailure "escaped-undeclared" "placeholder_undeclared" {
        param($caseRoot)
        [System.IO.File]::WriteAllText((Join-Path $caseRoot "escaped.json"), '{"path":"\u0024\u007bUNDECLARED\u007d"}', [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "duplicate-declaration" "placeholder_duplicate_declaration" {
        param($caseRoot)
        $path = Join-Path $caseRoot "manifest.json"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $content = $content.Replace('    "${SOURCE_PRJ}"', ('    "${SOURCE_PRJ}",' + "`n" + '    "${SOURCE_PRJ}"'))
        [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "unused-declaration" "placeholder_unused_declaration" {
        param($caseRoot)
        $path = Join-Path $caseRoot "manifest.json"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $content = $content.Replace('    "${SOURCE_PRJ}"', ('    "${SOURCE_PRJ}",' + "`n" + '    "${UNUSED}"'))
        [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "malformed" "placeholder_malformed" {
        param($caseRoot)
        [System.IO.File]::WriteAllText((Join-Path $caseRoot "malformed.json"), '{"path":"${MALFORMED"}', [System.Text.UTF8Encoding]::new($false))
    }
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Bridge JSON placeholder mutation tests passed: escaped undeclared, duplicate, unused, and malformed values were rejected."
