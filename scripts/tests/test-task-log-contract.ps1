[CmdletBinding()]
param(
    [string]$TaskLogRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($TaskLogRoot)) {
    $TaskLogRoot = Join-Path $root "docs\development\task-log"
}
else {
    $TaskLogRoot = (Resolve-Path $TaskLogRoot).Path
}
$recordsRoot = Join-Path $TaskLogRoot "records"
$indexPath = Join-Path $TaskLogRoot "index.md"
$failures = [System.Collections.Generic.List[string]]::new()
$requiredKeys = @(
    "task_id", "phase", "title", "status", "record_origin", "started_at_utc", "ended_at_utc", "duration_seconds",
    "base_commit", "branch", "task_source", "task_summary", "goals", "allowed_scope", "forbidden_scope", "validation",
    "delivery_status", "token_usage", "notes"
)
$statusVocabulary = @("in_progress", "completed", "blocked", "automated_verified", "pending_user")

function Fail-TaskLog {
    param([string]$Class, [string]$Message)
    $failures.Add("[${Class}] ${Message}")
}

function Get-RecordYaml {
    param([System.IO.FileInfo]$Record)
    $text = Get-Content -LiteralPath $Record.FullName -Raw -Encoding UTF8
    $match = [regex]::Match($text, '(?s)```yaml\s*\r?\n(?<yaml>.*?)\r?\n```')
    if (-not $match.Success) {
        Fail-TaskLog "task_log_yaml" "$($Record.Name) must contain exactly one YAML code block."
        return $null
    }
    if ([regex]::Matches($text, '(?s)```yaml\s*\r?\n.*?\r?\n```').Count -ne 1) {
        Fail-TaskLog "task_log_yaml" "$($Record.Name) must not contain multiple YAML code blocks."
        return $null
    }
    $values = [ordered]@{}
    $activeBlockKey = $null
    foreach ($line in @($match.Groups["yaml"].Value -split "\r?\n")) {
        if ($line -notmatch '^(?<key>[A-Za-z_][A-Za-z0-9_]*):(?<value>.*)$') {
            if ($null -ne $activeBlockKey -and $line -match '^\s+\S') {
                if ([string]::IsNullOrWhiteSpace([string]$values[$activeBlockKey])) {
                    $values[$activeBlockKey] = "<block>"
                }
            }
            continue
        }
        $key = $Matches.key
        if ($values.Contains($key)) {
            Fail-TaskLog "task_log_duplicate_key" "$($Record.Name) duplicates top-level key '${key}'."
            continue
        }
        $values[$key] = $Matches.value.Trim()
        $activeBlockKey = if ([string]::IsNullOrWhiteSpace([string]$values[$key])) { $key } else { $null }
    }
    return $values
}

function Try-ParseUtc {
    param([string]$Value, [ref]$Parsed)
    if ($Value -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$') {
        return $false
    }
    $parsedValue = [DateTimeOffset]::MinValue
    $ok = [DateTimeOffset]::TryParse(
        $Value,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::AssumeUniversal,
        [ref]$parsedValue
    )
    if ($ok -and $parsedValue.Offset -eq [TimeSpan]::Zero) {
        $Parsed.Value = $parsedValue
        return $true
    }
    return $false
}

if (-not (Test-Path -LiteralPath $recordsRoot -PathType Container)) {
    Fail-TaskLog "task_log_structure" "records directory is missing."
}
if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    Fail-TaskLog "task_log_index" "index.md is missing."
}

$recordStatus = @{}
if ($failures.Count -eq 0) {
    foreach ($record in @(Get-ChildItem -LiteralPath $recordsRoot -File -Filter "*.md" | Sort-Object Name)) {
        $values = Get-RecordYaml $record
        if ($null -eq $values) {
            continue
        }
        foreach ($key in $requiredKeys) {
            if (-not $values.Contains($key)) {
                Fail-TaskLog "task_log_missing_key" "$($record.Name) is missing '${key}'."
            }
        }
        if ($values.Contains("task_id") -and $values.task_id -notmatch '^[A-Za-z0-9][A-Za-z0-9-]*$') {
            Fail-TaskLog "task_log_task_id" "$($record.Name) has invalid task_id."
        }
        foreach ($key in @("phase", "title", "record_origin", "base_commit", "branch", "task_source", "task_summary", "delivery_status", "notes")) {
            if ($values.Contains($key) -and [string]::IsNullOrWhiteSpace([string]$values[$key])) {
                Fail-TaskLog "task_log_empty_key" "$($record.Name).${key} must be nonempty."
            }
        }
        if ($values.Contains("base_commit") -and $values.base_commit -notmatch '^[0-9a-f]{7,40}$') {
            Fail-TaskLog "task_log_base_commit" "$($record.Name).base_commit must be a lowercase Git SHA."
        }
        if ($values.Contains("record_origin") -and $values.record_origin -notin @("live", "reconstructed")) {
            Fail-TaskLog "task_log_origin" "$($record.Name).record_origin is invalid."
        }
        if (-not $values.Contains("status")) {
            continue
        }
        $status = [string]$values.status
        $recordStatus[$record.Name] = $status
        if ($status -notin $statusVocabulary) {
            Fail-TaskLog "task_log_status" "$($record.Name).status '${status}' is not in the approved vocabulary."
            continue
        }
        $started = [DateTimeOffset]::MinValue
        if (-not $values.Contains("started_at_utc") -or -not (Try-ParseUtc ([string]$values.started_at_utc) ([ref]$started))) {
            Fail-TaskLog "task_log_utc" "$($record.Name).started_at_utc must be an ISO 8601 UTC timestamp."
        }
        if ($status -eq "in_progress") {
            if ($values.Contains("ended_at_utc") -and $values.ended_at_utc -ne "null") {
                Fail-TaskLog "task_log_in_progress" "$($record.Name) may not declare an end time while in_progress."
            }
            if ($values.Contains("duration_seconds") -and $values.duration_seconds -ne "null") {
                Fail-TaskLog "task_log_in_progress" "$($record.Name) may not declare a duration while in_progress."
            }
            continue
        }
        $ended = [DateTimeOffset]::MinValue
        if (-not $values.Contains("ended_at_utc") -or -not (Try-ParseUtc ([string]$values.ended_at_utc) ([ref]$ended))) {
            Fail-TaskLog "task_log_utc" "$($record.Name).ended_at_utc must be an ISO 8601 UTC timestamp after completion."
        }
        if ($values.Contains("duration_seconds")) {
            $duration = 0.0
            $isNumber = [double]::TryParse(
                [string]$values.duration_seconds,
                [System.Globalization.NumberStyles]::Float,
                [System.Globalization.CultureInfo]::InvariantCulture,
                [ref]$duration
            )
            if (-not $isNumber -or [double]::IsNaN($duration) -or [double]::IsInfinity($duration) -or $duration -lt 0) {
                Fail-TaskLog "task_log_duration" "$($record.Name).duration_seconds must be finite and nonnegative."
            }
        }
        if ($started -ne [DateTimeOffset]::MinValue -and $ended -ne [DateTimeOffset]::MinValue -and $ended -lt $started) {
            Fail-TaskLog "task_log_time_order" "$($record.Name).ended_at_utc precedes started_at_utc."
        }
    }
}

if ($failures.Count -eq 0) {
    $indexRows = @{}
    $indexText = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
    foreach ($match in @([regex]::Matches($indexText, '(?m)^\|\s*\[[^\]]+\]\(records/(?<file>[^)]+)\)\s*\|\s*[^|]*\|\s*(?<status>[^|]+)\|\s*[^|]+\|\s*$'))) {
        $file = $match.Groups["file"].Value
        if ($indexRows.ContainsKey($file)) {
            Fail-TaskLog "task_log_index" "index.md references ${file} more than once."
        }
        else {
            $indexRows[$file] = $match.Groups["status"].Value.Trim()
        }
    }
    foreach ($recordName in $recordStatus.Keys) {
        if (-not $indexRows.ContainsKey($recordName)) {
            Fail-TaskLog "task_log_index" "index.md is missing ${recordName}."
        }
        elseif ($indexRows[$recordName] -ne $recordStatus[$recordName]) {
            Fail-TaskLog "task_log_index" "index.md status for ${recordName} does not equal the record status."
        }
    }
    foreach ($indexName in $indexRows.Keys) {
        if (-not $recordStatus.ContainsKey($indexName)) {
            Fail-TaskLog "task_log_index" "index.md references missing record ${indexName}."
        }
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}
Write-Host "Task log contract passed: $($recordStatus.Count) records have typed truth fields and matching index status."
