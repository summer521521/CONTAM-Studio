Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceRoot = Join-Path $root "docs\development\task-log"
$checker = Join-Path $PSScriptRoot "test-task-log-contract.ps1"
$tempBase = if ($env:RUNNER_TEMP) { Join-Path $env:RUNNER_TEMP "contam-studio" } else { "F:\Codex_File\temp\contam-studio" }
$tempRoot = Join-Path $tempBase ("fnd-04-task-log-" + [Guid]::NewGuid().ToString("N"))
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
        $output = @(& powershell.exe -NoProfile -File $checker -TaskLogRoot $caseRoot 2>&1)
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
    & powershell.exe -NoProfile -File $checker -TaskLogRoot $sourceRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Tracked task log did not pass before mutation testing."
    }
    Invoke-ExpectedFailure "missing-key" "task_log_missing_key" {
        param($caseRoot)
        $path = Join-Path $caseRoot "records\fnd-03-ci-workflow-parser-remediation.md"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $updated = $content -replace '(?m)^base_commit:[^\r\n]*\r?\n', ''
        if ($updated -eq $content) {
            throw "Mutation 'missing-key' did not modify the task record."
        }
        [System.IO.File]::WriteAllText($path, $updated, [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "nan-duration" "task_log_duration" {
        param($caseRoot)
        $path = Join-Path $caseRoot "records\fnd-03-ci-workflow-parser-remediation.md"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        [System.IO.File]::WriteAllText($path, $content.Replace("duration_seconds: 3786", "duration_seconds: NaN"), [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "non-utc-time" "task_log_utc" {
        param($caseRoot)
        $path = Join-Path $caseRoot "records\fnd-03-ci-workflow-parser-remediation.md"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        [System.IO.File]::WriteAllText($path, $content.Replace("ended_at_utc: 2026-07-23T10:05:33.1898205Z", "ended_at_utc: 2026-07-23T18:05:33+08:00"), [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "unknown-status" "task_log_status" {
        param($caseRoot)
        $path = Join-Path $caseRoot "records\fnd-03-ci-workflow-parser-remediation.md"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        [System.IO.File]::WriteAllText($path, $content.Replace("status: automated_verified", "status: invented"), [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "false-completed" "task_log_utc" {
        param($caseRoot)
        $path = Join-Path $caseRoot "records\fnd-03-ci-workflow-parser-remediation.md"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        [System.IO.File]::WriteAllText($path, $content.Replace("ended_at_utc: 2026-07-23T10:05:33.1898205Z", "ended_at_utc: null"), [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "index-mismatch" "task_log_index" {
        param($caseRoot)
        $path = Join-Path $caseRoot "index.md"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $updated = $content.Replace("automated_verified", "completed")
        if ($updated -eq $content) {
            throw "Mutation 'index-mismatch' did not modify index.md."
        }
        [System.IO.File]::WriteAllText($path, $updated, [System.Text.UTF8Encoding]::new($false))
    }
    Invoke-ExpectedFailure "duplicate-key" "task_log_duplicate_key" {
        param($caseRoot)
        $path = Join-Path $caseRoot "records\fnd-03-ci-workflow-parser-remediation.md"
        $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        [System.IO.File]::WriteAllText($path, $content.Replace("record_origin: live", "record_origin: live`nrecord_origin: live"), [System.Text.UTF8Encoding]::new($false))
    }
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Task log mutation tests passed: missing keys, time, duration, status, index, and duplicate-key bypasses were rejected."
