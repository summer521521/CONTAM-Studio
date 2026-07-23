Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$checker = Join-Path $PSScriptRoot "test-foundation-defect-ledger.ps1"
$source = Join-Path $root "docs\development\foundation-defect-ledger.json"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("contam-ledger-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-ExpectedFailure {
    param($Ledger, [string]$Name, [string]$Diagnostic)
    $path = Join-Path $tempRoot "${Name}.json"
    $Ledger | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $path -Encoding UTF8
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& powershell.exe -NoProfile -File $checker -LedgerPath $path 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -eq 0) {
        throw "Mutation '${Name}' unexpectedly passed."
    }
    if (($output -join "`n") -notmatch [regex]::Escape($Diagnostic)) {
        throw "Mutation '${Name}' failed without diagnostic ${Diagnostic}; output=$($output -join ' | ')"
    }
}

try {
    & powershell.exe -NoProfile -File $checker -LedgerPath $source
    if ($LASTEXITCODE -ne 0) {
        throw "Tracked ledger did not pass before mutation testing."
    }

    $missingRegression = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
    $missingRegression.findings[0].PSObject.Properties.Remove("regression_card")
    Invoke-ExpectedFailure $missingRegression "missing-regression" "ledger_missing_field"

    $falseCompleted = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
    $falseCompleted.findings[0].status = "remediated_pending_h"
    Invoke-ExpectedFailure $falseCompleted "false-completed" "ledger_false_completion"
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Foundation defect ledger mutation tests passed: missing regression and false completion were rejected."
