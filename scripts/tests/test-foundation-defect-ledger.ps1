[CmdletBinding()]
param(
    [string]$LedgerPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($LedgerPath)) {
    $LedgerPath = Join-Path $root "docs\development\foundation-defect-ledger.json"
}
$failures = [System.Collections.Generic.List[string]]::new()

function Add-LedgerFailure {
    param([string]$Class, [string]$Message)
    $failures.Add("[${Class}] ${Message}")
}

function Test-Property {
    param($Object, [string]$Name)
    return $null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]
}

function Get-RequiredText {
    param($Object, [string]$Name, [string]$Context)
    if (-not (Test-Property $Object $Name)) {
        Add-LedgerFailure "ledger_missing_field" "${Context} is missing required field '${Name}'."
        return ""
    }
    $value = [string]$Object.$Name
    if ([string]::IsNullOrWhiteSpace($value)) {
        Add-LedgerFailure "ledger_empty_field" "${Context}.${Name} must be nonempty."
        return ""
    }
    return $value
}

try {
    $ledger = Get-Content -LiteralPath $LedgerPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
catch {
    Write-Error "[ledger_invalid_json] $($_.Exception.Message)"
    exit 1
}

if (-not (Test-Property $ledger "schema_version") -or $ledger.schema_version -ne 1) {
    Add-LedgerFailure "ledger_schema" "schema_version must equal 1."
}
if (-not (Test-Property $ledger "review_target")) {
    Add-LedgerFailure "ledger_missing_field" "ledger is missing review_target."
}
else {
    $branch = Get-RequiredText $ledger.review_target "branch" "review_target"
    $commit = Get-RequiredText $ledger.review_target "commit" "review_target"
    $availability = Get-RequiredText $ledger.review_target "availability" "review_target"
    $reviewStatus = Get-RequiredText $ledger.review_target "status" "review_target"
    if ($branch -ne "codex/batch-03x-foundations") {
        Add-LedgerFailure "ledger_review_target" "review_target.branch is not the frozen BATCH-03X branch."
    }
    if ($commit -notmatch '^[0-9a-f]{40}$') {
        Add-LedgerFailure "ledger_review_target" "review_target.commit must be a lowercase full SHA-1."
    }
    if ($availability -notin @("available", "unavailable")) {
        Add-LedgerFailure "ledger_review_target" "review_target.availability is invalid."
    }
    if ($reviewStatus -ne "changes_requested") {
        Add-LedgerFailure "ledger_false_completion" "BATCH-03X must remain changes_requested until H0 admission."
    }
}

$expectedCards = [ordered]@{
    workflow_parser = "FND-03"
    cache_producer = "FND-04"
    placeholder_unicode = "FND-04"
    task_log_truth = "FND-04"
    module_visibility = "FND-05"
    process_callsite_inventory = "FND-05"
    safe_command_tests = "FND-06"
    data_mapping = "FND-06"
    result_labeling = "FND-06"
}
$findings = if (Test-Property $ledger "findings") { @($ledger.findings) } else { @() }
if ($findings.Count -ne $expectedCards.Count) {
    Add-LedgerFailure "ledger_finding_set" "Expected $($expectedCards.Count) findings; got $($findings.Count)."
}
$seen = @{}
foreach ($finding in $findings) {
    $id = Get-RequiredText $finding "id" "finding"
    if ($seen.ContainsKey($id)) {
        Add-LedgerFailure "ledger_duplicate_finding" "Duplicate finding '${id}'."
        continue
    }
    $seen[$id] = $true
    if (-not $expectedCards.Contains($id)) {
        Add-LedgerFailure "ledger_unknown_finding" "Unknown finding '${id}'."
        continue
    }
    Get-RequiredText $finding "title" "finding '${id}'" | Out-Null
    $severity = Get-RequiredText $finding "severity" "finding '${id}'"
    Get-RequiredText $finding "owner" "finding '${id}'" | Out-Null
    $status = Get-RequiredText $finding "status" "finding '${id}'"
    $regressionCard = Get-RequiredText $finding "regression_card" "finding '${id}'"
    Get-RequiredText $finding "reproduction_input" "finding '${id}'" | Out-Null
    Get-RequiredText $finding "expected_failure_reason" "finding '${id}'" | Out-Null
    Get-RequiredText $finding "h_rereview_criterion" "finding '${id}'" | Out-Null
    if ($severity -notin @("critical", "high", "medium", "low")) {
        Add-LedgerFailure "ledger_severity" "Finding '${id}' has invalid severity."
    }
    if ($regressionCard -ne $expectedCards[$id]) {
        Add-LedgerFailure "ledger_regression_card" "Finding '${id}' must map to $($expectedCards[$id])."
    }
    if ($status -notin @("open", "remediated_pending_h", "admitted")) {
        Add-LedgerFailure "ledger_status" "Finding '${id}' has invalid status."
    }
    if ($status -ne "open") {
        $resolution = if (Test-Property $finding "resolution") { $finding.resolution } else { $null }
        $resolutionComplete = $null -ne $resolution
        foreach ($field in @("commit", "focused_verification", "full_verification", "h_review_reference")) {
            if (-not $resolutionComplete -or -not (Test-Property $resolution $field) -or [string]::IsNullOrWhiteSpace([string]$resolution.$field)) {
                $resolutionComplete = $false
            }
        }
        $resolutionCommit = if ($resolutionComplete) { [string]$resolution.commit } else { "" }
        if (-not $resolutionComplete -or $resolutionCommit -notmatch '^[0-9a-f]{40}$') {
            Add-LedgerFailure "ledger_false_completion" "Finding '${id}' cannot leave open without complete commit, verification, and H review evidence."
        }
    }
}
foreach ($id in $expectedCards.Keys) {
    if (-not $seen.ContainsKey($id)) {
        Add-LedgerFailure "ledger_missing_finding" "Missing required finding '${id}'."
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}
Write-Host "Foundation defect ledger passed: $($findings.Count) changes_requested findings are complete and machine-checkable."
