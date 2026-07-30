[CmdletBinding()]
param(
    [string]$PythonPath = "",
    [string]$VerificationRoot = "F:\Codex_File\CONTAM-Studio\comprehensive-validation-contract"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$manifestPath = Join-Path $repoRoot "examples\uat\comprehensive-validation-v1\case-manifest.json"
$prepareScript = Join-Path $repoRoot "scripts\prepare-comprehensive-validation-case.ps1"
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $repoRoot "python\.venv\Scripts\python.exe"
}

foreach ($requiredPath in @($manifestPath, $prepareScript, $PythonPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required case validation input is missing: $requiredPath"
    }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schema_version -ne 1) {
    throw "Unexpected case manifest schema."
}
if ([string]$manifest.case_id -ne "contam-studio-comprehensive-validation-v1") {
    throw "Unexpected case manifest id."
}
if (@($manifest.projects).Count -ne 3 -or @($manifest.attachments).Count -ne 6) {
    throw "Case manifest must declare three projects and six attachments."
}
if (-not $manifest.policy.source_projects_are_immutable -or
    -not $manifest.policy.prepared_cases_are_copies -or
    $manifest.policy.real_credentials_required -or
    $manifest.policy.real_appdata_required) {
    throw "Case safety policy is invalid."
}

$semanticSnapshots = @{}
foreach ($project in @($manifest.projects)) {
    $sourcePath = Join-Path $repoRoot ([string]$project.repository_fixture)
    $sourceFile = Get-Item -LiteralPath $sourcePath
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sourceFile.Length -ne [long]$project.size_bytes -or $sourceHash -ne [string]$project.sha256) {
        throw "Fixture identity mismatch: $($project.id)"
    }

    $readerText = & $PythonPath -m contam_studio_core.prj_zone_reader $sourcePath --json
    if ($LASTEXITCODE -ne 0) {
        throw "Strict reader failed: $($project.id)"
    }
    $reader = $readerText | ConvertFrom-Json
    if ($reader.source_sha256 -ne [string]$project.sha256 -or
        $reader.header_version -ne [string]$project.expected_semantic_view.header_version -or
        $reader.declared_zone_count -ne [int]$project.expected_semantic_view.zone_count -or
        -not $reader.source_unchanged) {
        throw "Strict reader expectation mismatch: $($project.id)"
    }

    $semanticRequest = @{
        protocol_version = "1.2"
        request_id = "case-contract-$($project.id)"
        operation = "read_semantic_project"
        source_path = $sourceFile.FullName
    } | ConvertTo-Json -Compress
    $semanticText = $semanticRequest | & $PythonPath -m contam_studio_core.zone_bridge
    if ($LASTEXITCODE -ne 0) {
        throw "Semantic bridge process failed: $($project.id)"
    }
    $semanticEnvelope = $semanticText | ConvertFrom-Json
    if (-not $semanticEnvelope.ok) {
        throw "Semantic bridge rejected fixture: $($project.id)"
    }
    $semantic = $semanticEnvelope.result
    $semanticSnapshots[[string]$project.id] = $semantic
    if ($semantic.revision_state -ne [string]$project.expected_semantic_view.revision_state -or
        @($semantic.levels).Count -ne [int]$project.expected_semantic_view.level_count -or
        @($semantic.zones).Count -ne [int]$project.expected_semantic_view.zone_count -or
        @($semantic.flow_paths).Count -ne [int]$project.expected_semantic_view.flow_path_count -or
        @($semantic.flow_paths | Where-Object { $_.editable }).Count -ne [int]$project.expected_semantic_view.editable_flow_path_count -or
        @($semantic.species).Count -ne [int]$project.expected_semantic_view.species_count) {
        throw "Semantic snapshot expectation mismatch: $($project.id)"
    }
    if ($project.expected_semantic_view.PSObject.Properties.Name -contains "read_only_reason" -and
        $semantic.read_only_reason -ne [string]$project.expected_semantic_view.read_only_reason) {
        throw "Read-only reason mismatch: $($project.id)"
    }
}

$editableProject = @($manifest.projects | Where-Object { $_.id -eq "editable-three-zone" })[0]
$editableSnapshot = $semanticSnapshots["editable-three-zone"]
$patchOperations = @(
    @{
        operation = "set_zone_volume"
        object_id = [string]$editableSnapshot.zones[0].object_id
        new_value = "350"
        unit = "m3"
    },
    @{
        operation = "set_zone_name"
        object_id = [string]$editableSnapshot.zones[1].object_id
        new_value = "studio-two"
        unit = $null
    },
    @{
        operation = "set_flow_path_multiplier"
        object_id = [string]$editableSnapshot.flow_paths[0].object_id
        new_value = "1.25"
        unit = "1"
    }
)
$patchRequest = @{
    protocol_version = "1.2"
    request_id = "case-contract-patch"
    operation = "plan_semantic_patch"
    source_path = (Get-Item -LiteralPath (Join-Path $repoRoot ([string]$editableProject.repository_fixture))).FullName
    revision_id = "00000000-0000-4000-8000-000000000001"
    operations = $patchOperations
} | ConvertTo-Json -Compress -Depth 8
$patchText = $patchRequest | & $PythonPath -m contam_studio_core.zone_bridge
$patchEnvelope = $patchText | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $patchEnvelope.ok -or
    @($patchEnvelope.result.transaction.operations).Count -ne 3 -or
    @($patchEnvelope.result.diff).Count -ne 3) {
    throw "Editable case three-operation Patch plan failed."
}

$caseRunId = "contract-$([DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss'))-$PID"
& $prepareScript -DestinationRoot $VerificationRoot -CaseRunId $caseRunId
if ($LASTEXITCODE -ne 0) {
    throw "Case preparation script failed."
}
$preparedRoot = Join-Path ([IO.Path]::GetFullPath($VerificationRoot)) $caseRunId
foreach ($requiredRelative in @(
    "CASE-GUIDE.md",
    "case-manifest.json",
    "generated-case.json",
    "SHA256SUMS.txt",
    "attachments\project-brief.txt",
    "attachments\zone-observations.csv",
    "attachments\expected-context.json",
    "attachments\studio-icon-reference.png",
    "attachments\safe-reference.zip",
    "attachments\invalid-signature.png"
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $preparedRoot $requiredRelative) -PathType Leaf)) {
        throw "Prepared case is missing: $requiredRelative"
    }
}

foreach ($project in @($manifest.projects)) {
    $preparedPath = Join-Path $preparedRoot ([string]$project.prepared_relative_path)
    $preparedHash = (Get-FileHash -LiteralPath $preparedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($preparedHash -ne [string]$project.sha256) {
        throw "Prepared project hash mismatch: $($project.id)"
    }
}

$checksumPath = Join-Path $preparedRoot "SHA256SUMS.txt"
$checksumLines = @(Get-Content -LiteralPath $checksumPath -Encoding UTF8)
$preparedFiles = @(Get-ChildItem -LiteralPath $preparedRoot -Recurse -File | Where-Object { $_.FullName -ne $checksumPath })
if ($checksumLines.Count -ne $preparedFiles.Count) {
    throw "Prepared checksum manifest does not cover every generated file."
}
$preparedPrefix = $preparedRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
foreach ($line in $checksumLines) {
    if ($line -notmatch '^(?<hash>[0-9a-f]{64})  (?<path>[^:]+)$') {
        throw "Prepared checksum line has an invalid shape."
    }
    $relativePath = $Matches.path.Replace("/", "\")
    if ([IO.Path]::IsPathRooted($relativePath) -or $relativePath -match '(^|\\)\.\.(\\|$)') {
        throw "Prepared checksum path escaped the case root."
    }
    $checkedPath = [IO.Path]::GetFullPath((Join-Path $preparedRoot $relativePath))
    if (-not $checkedPath.StartsWith($preparedPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $checkedPath -PathType Leaf)) {
        throw "Prepared checksum references a missing or escaped file."
    }
    $actualHash = (Get-FileHash -LiteralPath $checkedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $Matches.hash) {
        throw "Prepared checksum mismatch: $($Matches.path)"
    }
}

$quarantineRoot = Join-Path ([IO.Path]::GetFullPath($VerificationRoot)) "quarantine-$caseRunId"
New-Item -ItemType Directory -Path $quarantineRoot | Out-Null
foreach ($attachment in @($manifest.attachments)) {
    $attachmentPath = Join-Path $preparedRoot ([string]$attachment.relative_path)
    $attachmentRequest = @{
        protocol_version = "1.2"
        request_id = "case-attachment-$([IO.Path]::GetFileNameWithoutExtension([string]$attachment.relative_path))"
        operation = "import_attachment"
        source_path = $attachmentPath
        quarantine_root = $quarantineRoot
    } | ConvertTo-Json -Compress
    $attachmentText = $attachmentRequest | & $PythonPath -m contam_studio_core.zone_bridge
    $attachmentEnvelope = $attachmentText | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw "Attachment bridge process failed: $($attachment.relative_path)"
    }
    if ([string]$attachment.expected_status -eq "blocked") {
        $blockedAsSafeView = $attachmentEnvelope.ok -and
            $attachmentEnvelope.result.attachment.status -eq "blocked" -and
            $attachmentEnvelope.result.attachment.risk_summary -eq [string]$attachment.expected_error
        $blockedAsError = -not $attachmentEnvelope.ok -and
            $attachmentEnvelope.error.code -eq [string]$attachment.expected_error
        if (-not $blockedAsSafeView -and -not $blockedAsError) {
            throw "Blocked attachment expectation mismatch: $($attachment.relative_path)"
        }
    }
    elseif (-not $attachmentEnvelope.ok -or
        $attachmentEnvelope.result.attachment.status -ne [string]$attachment.expected_status -or
        $attachmentEnvelope.result.attachment.category -ne [string]$attachment.expected_category) {
        throw "Ready attachment expectation mismatch: $($attachment.relative_path)"
    }
}

$generated = Get-Content -LiteralPath (Join-Path $preparedRoot "generated-case.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if ($generated.contains_real_credentials -or $generated.contains_real_user_data -or
    -not $generated.source_projects_immutable) {
    throw "Generated case truth metadata is invalid."
}

Write-Host "Comprehensive validation case contract passed: 3 source projects, 3-operation Patch, 6 attachments, complete checksums."
Write-Host "PREPARED_CASE_ROOT=$preparedRoot"
