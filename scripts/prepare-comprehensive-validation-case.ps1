[CmdletBinding()]
param(
    [string]$DestinationRoot = "F:\Codex_File\CONTAM-Studio\comprehensive-validation-v1",
    [string]$CaseRunId = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$caseSourceRoot = Join-Path $repoRoot "examples\uat\comprehensive-validation-v1"
$manifestPath = Join-Path $caseSourceRoot "case-manifest.json"
$guidePath = Join-Path $repoRoot "docs\uat\comprehensive-validation-case-v1.md"

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Comprehensive validation case manifest is missing."
}
if (-not (Test-Path -LiteralPath $guidePath -PathType Leaf)) {
    throw "Comprehensive validation guide is missing."
}

$destinationFull = [IO.Path]::GetFullPath($DestinationRoot)
$repoPrefix = $repoRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if ($destinationFull.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $destinationFull.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The generated case must stay outside the repository."
}

if ([string]::IsNullOrWhiteSpace($CaseRunId)) {
    $CaseRunId = [DateTimeOffset]::Now.ToString("yyyyMMdd-HHmmss")
}
if ($CaseRunId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
    throw "CaseRunId must contain only letters, numbers, dot, underscore, or hyphen."
}

if (-not (Test-Path -LiteralPath $destinationFull -PathType Container)) {
    New-Item -ItemType Directory -Path $destinationFull | Out-Null
}

$outputRoot = Join-Path $destinationFull $CaseRunId
if (Test-Path -LiteralPath $outputRoot) {
    throw "Case output already exists: $outputRoot"
}

New-Item -ItemType Directory -Path $outputRoot | Out-Null
foreach ($relativeDirectory in @("projects", "attachments", "notices", "exports", "screenshots", "notes")) {
    New-Item -ItemType Directory -Path (Join-Path $outputRoot $relativeDirectory) | Out-Null
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schema_version -ne 1 -or @($manifest.projects).Count -ne 3) {
    throw "Comprehensive validation case manifest has an unsupported shape."
}

Copy-Item -LiteralPath (Join-Path $caseSourceRoot "README.md") -Destination (Join-Path $outputRoot "CASE-README.md")
Copy-Item -LiteralPath $guidePath -Destination (Join-Path $outputRoot "CASE-GUIDE.md")
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $outputRoot "case-manifest.json")
Copy-Item -LiteralPath (Join-Path $caseSourceRoot "manual-results-template.csv") -Destination (Join-Path $outputRoot "manual-results-template.csv")
Copy-Item -LiteralPath (Join-Path $caseSourceRoot "ux-observation-template.md") -Destination (Join-Path $outputRoot "ux-observation-template.md")

foreach ($project in @($manifest.projects)) {
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $repoRoot ([string]$project.repository_fixture)))
    if (-not $sourcePath.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Fixture escaped repository boundary: $($project.repository_fixture)"
    }
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Fixture is missing: $($project.repository_fixture)"
    }
    $sourceFile = Get-Item -LiteralPath $sourcePath
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sourceFile.Length -ne [long]$project.size_bytes -or $sourceHash -ne [string]$project.sha256) {
        throw "Fixture identity mismatch: $($project.id)"
    }

    $targetPath = Join-Path $outputRoot ([string]$project.prepared_relative_path)
    $targetParent = Split-Path -Parent $targetPath
    if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) {
        New-Item -ItemType Directory -Path $targetParent | Out-Null
    }
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath
    $targetHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($targetHash -ne $sourceHash -or (Get-Item -LiteralPath $targetPath).Length -ne $sourceFile.Length) {
        throw "Prepared fixture verification failed: $($project.id)"
    }
}

Copy-Item -LiteralPath (Join-Path $caseSourceRoot "attachments\project-brief.txt") -Destination (Join-Path $outputRoot "attachments\project-brief.txt")
Copy-Item -LiteralPath (Join-Path $caseSourceRoot "attachments\zone-observations.csv") -Destination (Join-Path $outputRoot "attachments\zone-observations.csv")
Copy-Item -LiteralPath (Join-Path $caseSourceRoot "attachments\expected-context.json") -Destination (Join-Path $outputRoot "attachments\expected-context.json")
Copy-Item -LiteralPath (Join-Path $repoRoot "src-tauri\icons\128x128.png") -Destination (Join-Path $outputRoot "attachments\studio-icon-reference.png")

$utf8NoBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText(
    (Join-Path $outputRoot "attachments\invalid-signature.png"),
    "This is intentionally plain UTF-8 text, not a PNG. It must be rejected by magic-byte validation.`n",
    $utf8NoBom
)

$zipInputs = @(
    (Join-Path $outputRoot "attachments\project-brief.txt"),
    (Join-Path $outputRoot "attachments\expected-context.json")
)
Compress-Archive -LiteralPath $zipInputs -DestinationPath (Join-Path $outputRoot "attachments\safe-reference.zip")

Copy-Item -LiteralPath (Join-Path $repoRoot "fixtures\contam\official-contamxpy\LICENSE.txt") -Destination (Join-Path $outputRoot "notices\contamxpy-LICENSE.txt")
Copy-Item -LiteralPath (Join-Path $repoRoot "fixtures\contam\official-contamxpy\README.md") -Destination (Join-Path $outputRoot "notices\contamxpy-fixture-source.md")
Copy-Item -LiteralPath (Join-Path $repoRoot "fixtures\contam\official-nist-tutorials\README.md") -Destination (Join-Path $outputRoot "notices\nist-demo1c-source.md")

$sourceCommit = "unknown"
try {
    $candidateCommit = (& git -C $repoRoot rev-parse HEAD 2>$null).Trim()
    if ($candidateCommit -match '^[0-9a-f]{40}$') {
        $sourceCommit = $candidateCommit
    }
}
catch {
    $sourceCommit = "unknown"
}

$generatedCase = [ordered]@{
    schema_version = 1
    case_id = [string]$manifest.case_id
    case_run_id = $CaseRunId
    prepared_at_utc = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ")
    source_commit = $sourceCommit
    application_version = [string]$manifest.baseline.application_version
    source_projects_immutable = $true
    contains_real_credentials = $false
    contains_real_user_data = $false
}
[IO.File]::WriteAllText(
    (Join-Path $outputRoot "generated-case.json"),
    ($generatedCase | ConvertTo-Json -Depth 4) + "`n",
    $utf8NoBom
)

$checksumLines = [System.Collections.Generic.List[string]]::new()
$outputPrefix = $outputRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
foreach ($file in @(Get-ChildItem -LiteralPath $outputRoot -Recurse -File | Sort-Object FullName)) {
    if ($file.Name -eq "SHA256SUMS.txt") {
        continue
    }
    if (-not $file.FullName.StartsWith($outputPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Generated file escaped case output boundary."
    }
    $relative = $file.FullName.Substring($outputPrefix.Length).Replace("\", "/")
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $checksumLines.Add("$hash  $relative")
}
[IO.File]::WriteAllLines((Join-Path $outputRoot "SHA256SUMS.txt"), $checksumLines, $utf8NoBom)

Write-Host "Comprehensive validation case prepared."
Write-Host "CASE_ROOT=$outputRoot"
Write-Host "PROJECTS=$(@($manifest.projects).Count)"
Write-Host "ATTACHMENTS=$(@($manifest.attachments).Count)"
