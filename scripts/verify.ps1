[CmdletBinding()]
param(
    [ValidateSet("Docs", "Fast", "Full")]
    [string]$Mode = "Fast"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDirectory "..")).Path
$Failures = New-Object System.Collections.Generic.List[string]
$Passed = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param(
        [string]$Name,
        [string]$Message
    )

    $Failures.Add("${Name}: ${Message}")
    Write-Host "[FAIL] ${Name}: ${Message}" -ForegroundColor Red
}

function Add-Passed {
    param([string]$Name)

    $Passed.Add($Name)
    Write-Host "[PASS] ${Name}" -ForegroundColor Green
}

function Get-TrackedPaths {
    param([string]$Pattern)

    $paths = @(git -C $Root ls-files -- $Pattern)
    if ($LASTEXITCODE -ne 0) {
        Add-Failure "git ls-files ${Pattern}" "Git could not enumerate tracked paths."
        return @()
    }

    return @($paths | Where-Object { $_ -and $_.Trim().Length -gt 0 })
}

function Assert-TrackedFile {
    param([string]$RelativePath)

    $fullPath = Join-Path $Root ($RelativePath -replace "/", "\")
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        Add-Failure "tracked file ${RelativePath}" "File is missing."
        return $false
    }

    $tracked = @(git -C $Root ls-files --error-unmatch -- $RelativePath 2>$null)
    if ($LASTEXITCODE -ne 0 -or $tracked.Count -ne 1 -or $tracked[0] -ne $RelativePath) {
        Add-Failure "tracked file ${RelativePath}" "File is not tracked by Git."
        return $false
    }

    return $true
}

function Test-GitPathChanged {
    param([string]$RelativePath)

    & git -C $Root diff --quiet -- $RelativePath
    if ($LASTEXITCODE -ne 0) {
        return $true
    }
    & git -C $Root diff --cached --quiet -- $RelativePath
    return $LASTEXITCODE -ne 0
}

function Invoke-Tool {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory = $Root
    )

    Write-Host "[RUN ] ${Name}"
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        Push-Location $WorkingDirectory
        try {
            $toolOutput = @(& $FilePath @Arguments 2>&1)
            $exitCode = $LASTEXITCODE
            $toolOutput | ForEach-Object { Write-Host $_.ToString() }
        }
        finally {
            Pop-Location
        }
    }
    catch {
        Add-Failure $Name $_.Exception.Message
        return $false
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        Add-Failure $Name "Process exited with code ${exitCode}."
        return $false
    }

    Add-Passed $Name
    return $true
}

function Get-ToolOutput {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& $FilePath @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    catch {
        Add-Failure $Name $_.Exception.Message
        return $null
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        Add-Failure $Name "Process exited with code ${exitCode}."
        return $null
    }

    return (($output | ForEach-Object { $_.ToString() }) -join "`n").Trim()
}

function Check-ToolVersion {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$Expected,
        [string]$Pattern = ""
    )

    $actual = Get-ToolOutput $Name $FilePath $Arguments
    if ($null -eq $actual) {
        return $false
    }

    $matchPattern = $Pattern
    if ([string]::IsNullOrWhiteSpace($matchPattern)) {
        $matchPattern = [regex]::Escape($Expected)
    }

    if ($actual -notmatch $matchPattern) {
        Add-Failure $Name "Expected ${Expected}; got ${actual}."
        return $false
    }

    Add-Passed $Name
    return $true
}

function Get-SafeRelativePath {
    param([string]$Candidate)

    if ([string]::IsNullOrWhiteSpace($Candidate)) {
        return "<missing>"
    }

    try {
        $fullCandidate = [System.IO.Path]::GetFullPath($Candidate).TrimEnd("\")
        $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd("\")
        if ($fullCandidate.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            return "."
        }
        $rootPrefix = $fullRoot + "\"
        if ($fullCandidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $fullCandidate.Substring($rootPrefix.Length).Replace("\", "/")
        }
    }
    catch {
        return "<invalid-path>"
    }

    return "<outside-clone>"
}

function Test-PathWithin {
    param(
        [string]$Candidate,
        [string]$ExpectedRoot
    )

    if ([string]::IsNullOrWhiteSpace($Candidate)) {
        return $false
    }

    try {
        $fullCandidate = [System.IO.Path]::GetFullPath($Candidate).TrimEnd("\")
        $fullExpectedRoot = [System.IO.Path]::GetFullPath($ExpectedRoot).TrimEnd("\")
        $prefix = $fullExpectedRoot + "\"
        return $fullCandidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
    }
    catch {
        return $false
    }
}

function Check-ProjectPythonOrigin {
    param([string]$PythonPath)

    Write-Host "[RUN ] Python package origin"
    $probe = 'import sys; import contam_studio_core; print(sys.executable); print(contam_studio_core.__file__)'
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $probeOutput = @(& $PythonPath -c $probe 2>&1)
        $exitCode = $LASTEXITCODE
    }
    catch {
        Add-Failure "Python package origin" "Origin probe failed."
        return $false
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        Add-Failure "Python package origin" "Origin probe failed."
        return $false
    }

    $probeLines = @($probeOutput | ForEach-Object { $_.ToString() } | Where-Object { $_.Trim().Length -gt 0 })
    if ($probeLines.Count -lt 2) {
        Add-Failure "Python package origin" "Origin probe returned invalid metadata."
        return $false
    }

    $executable = $probeLines[0].Trim()
    $package = $probeLines[1].Trim()

    $safeExecutable = Get-SafeRelativePath $executable
    $safePackage = Get-SafeRelativePath $package
    Write-Host "Python origin: executable=${safeExecutable}; package=${safePackage}"

    $venvRoot = Join-Path $Root "python\.venv"
    $sourceRoot = Join-Path $Root "python\src"
    $executableOk = Test-PathWithin $executable $venvRoot
    $packageOk = Test-PathWithin $package $sourceRoot
    if (-not $executableOk -or -not $packageOk) {
        Add-Failure "Python package origin" "Expected executable under python/.venv and package under python/src; actual executable=${safeExecutable}, package=${safePackage}."
        return $false
    }

    Add-Passed "Python package origin"
    return $true
}

function Check-Docs {
    Write-Host "== Docs ==" -ForegroundColor Cyan

    $baselinePath = "docs/development/toolchain-baseline.json"
    $baselineFullPath = Join-Path $Root ($baselinePath -replace "/", "\")
    if (-not (Assert-TrackedFile $baselinePath)) {
        return $null
    }

    $baseline = $null
    try {
        $baseline = Get-Content -LiteralPath $baselineFullPath -Raw -Encoding UTF8 | ConvertFrom-Json
        Add-Passed "baseline JSON"
    }
    catch {
        Add-Failure "baseline JSON" $_.Exception.Message
        return $null
    }

    $jsonPaths = @(Get-TrackedPaths "*.json")
    foreach ($relativePath in $jsonPaths) {
        try {
            $fullPath = Join-Path $Root ($relativePath -replace "/", "\")
            Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
        }
        catch {
            Add-Failure "JSON ${relativePath}" $_.Exception.Message
        }
    }
    if ($Failures.Count -eq 0 -or $jsonPaths.Count -gt 0) {
        $jsonFailure = @($Failures | Where-Object { $_ -like "JSON *" })
        if ($jsonFailure.Count -eq 0) {
            $jsonCount = $jsonPaths.Count
            Add-Passed "tracked JSON (${jsonCount} files)"
        }
    }

    Invoke-Tool "Foundation defect ledger" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-foundation-defect-ledger.ps1")) $Root | Out-Null
    Invoke-Tool "Foundation defect ledger mutations" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-foundation-defect-ledger-mutations.ps1")) $Root | Out-Null
    Invoke-Tool "Foundation admission contract" "node" @("scripts\tests\test-foundation-admission-contract.mjs", $Root) | Out-Null
    Invoke-Tool "V1 baseline contract" "node" @("scripts\tests\test-v1-baseline-contract.mjs", $Root) | Out-Null
    Invoke-Tool "V1 baseline contract mutations" "node" @("scripts\tests\test-v1-baseline-contract-mutations.mjs", $Root) | Out-Null
    Invoke-Tool "PatchTransaction contract" "node" @("scripts\tests\test-patch-transaction-contract.mjs", $Root) | Out-Null
    Invoke-Tool "PatchTransaction contract mutations" "node" @("scripts\tests\test-patch-transaction-contract-mutations.mjs", $Root) | Out-Null
    Invoke-Tool "Fixture manifest contract" "node" @("scripts\tests\test-fixture-manifest-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Fixture manifest contract mutations" "node" @("scripts\tests\test-fixture-manifest-contract-mutations.mjs", $Root) | Out-Null
    Invoke-Tool "DocumentEnvelope contract" "node" @("scripts\tests\test-document-envelope-contract.mjs", $Root) | Out-Null
    Invoke-Tool "SemanticGraph contract" "node" @("scripts\tests\test-semantic-graph-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Domain projection contract" "node" @("scripts\tests\test-domain-projection-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Supported domain contract" "node" @("scripts\tests\test-supported-domain-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Batch C contract" "node" @("scripts\tests\test-batch-c-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Attachment AI contract" "node" @("scripts\tests\test-attachment-ai-contract.mjs", $Root) | Out-Null
    Invoke-Tool "QA release contract" "node" @("scripts\tests\test-qa-release-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Rust authority contract" "node" @("scripts\tests\test-rust-authority-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Rust authority mutations" "node" @("scripts\tests\test-rust-authority-contract-mutations.mjs", $Root) | Out-Null
    Invoke-Tool "Bridge JSON placeholder contract" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-bridge-json-placeholder-contract.ps1")) $Root | Out-Null
    Invoke-Tool "Bridge JSON placeholder mutations" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-bridge-json-placeholder-contract-mutations.ps1")) $Root | Out-Null
    Invoke-Tool "Task log contract" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-task-log-contract.ps1")) $Root | Out-Null
    Invoke-Tool "Task log contract mutations" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-task-log-contract-mutations.ps1")) $Root | Out-Null
    Invoke-Tool "Data lifecycle contract" "node" @("scripts\tests\test-data-lifecycle-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Data lifecycle mutations" "node" @("scripts\tests\test-data-lifecycle-contract-mutations.mjs", $Root) | Out-Null
    Invoke-Tool "Phase 6C user-first runtime contract" "node" @("scripts\tests\test-phase-6c-user-first-contract.mjs", $Root) | Out-Null
    Invoke-Tool "R1-01 foundation contract" "node" @("scripts\tests\test-r1-01-foundation-contract.mjs", $Root) | Out-Null
    Invoke-Tool "R1-02 workbench contract" "node" @("scripts\tests\test-r1-02-workbench-contract.mjs", $Root) | Out-Null
    Invoke-Tool "R1-03 visual model contract" "node" @("scripts\tests\test-r1-03-visual-model-contract.mjs", $Root) | Out-Null
    Invoke-Tool "R1-04 results evidence AI contract" "node" @("scripts\tests\test-r1-04-results-evidence-ai-contract.mjs", $Root) | Out-Null
    Invoke-Tool "R1-05 final UAT release readiness contract" "node" @("scripts\tests\test-r1-05-final-uat-release-readiness-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Geometry Workbench foundation contract" "node" @("scripts\tests\test-geometry-workbench-foundation-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Geometry Editor Integration contract" "node" @("scripts\tests\test-geometry-editor-integration-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Spatial Command Deck contract" "node" @("scripts\tests\test-spatial-command-deck-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Vision to Geometry Draft contract" "node" @("scripts\tests\test-vision-to-geometry-draft-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Geometry Assistant Vision Integration contract" "node" @("scripts\tests\test-geometry-assistant-vision-integration-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Geometry Assistant Draft Evidence contract" "node" @("scripts\tests\test-geometry-assistant-draft-evidence-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Geometry Assistant Selective Approval contract" "node" @("scripts\tests\test-geometry-assistant-selective-approval-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Geometry Assistant Dependency-aware Selection contract" "node" @("scripts\tests\test-geometry-assistant-dependency-aware-selection-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Verified SketchPad Icon Round Trip contract" "node" @("scripts\tests\test-verified-sketchpad-icon-round-trip-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Project Geometry Document and SketchPad Preview contract" "node" @("scripts\tests\test-project-geometry-document-and-sketchpad-preview-contract.mjs", $Root) | Out-Null
    Invoke-Tool "SketchPad Projection Safe Draft Application contract" "node" @("scripts\tests\test-sketchpad-projection-safe-draft-application-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Geometry Direct Manipulation contract" "node" @("scripts\tests\test-geometry-direct-manipulation-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Wall and Opening Direct Manipulation contract" "node" @("scripts\tests\test-wall-opening-direct-manipulation-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Topology-aware Wall Intersections contract" "node" @("scripts\tests\test-topology-aware-wall-intersections-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Zone Boundaries and Room Partitioning contract" "node" @("scripts\tests\test-zone-boundaries-room-partitioning-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Multi-level Navigation and Construction Reuse contract" "node" @("scripts\tests\test-multi-level-navigation-construction-reuse-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Vertical Openings and Cross-level Airflow contract" "node" @("scripts\tests\test-vertical-openings-cross-level-airflow-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Wall Airflow Boundaries and Outdoor Context contract" "node" @("scripts\tests\test-wall-airflow-boundaries-outdoor-context-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Calibrated Plan Underlay and Building Tracing contract" "node" @("scripts\tests\test-calibrated-plan-underlay-contract.mjs", $Root) | Out-Null
    Invoke-Tool "CONTAM Semantic Authoring and Safe Draft Foundation contract" "node" @("scripts\tests\test-contam-semantic-authoring-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Geometry Workbench User Modeling Closure contract" "node" @("scripts\tests\test-geometry-user-modeling-closure-contract.mjs", $Root) | Out-Null
    Invoke-Tool "SimRead official output compatibility contract" "node" @("scripts\tests\test-simread-official-output-compatibility-contract.mjs", $Root) | Out-Null

    $markdownPaths = @(
        (Get-TrackedPaths "*.md")
        (Get-TrackedPaths "*.markdown")
    ) | Sort-Object -Unique
    $markdownPaths = @($markdownPaths)
    $linkPattern = [regex]'(?m)(?<!\!)\[[^\]]*\]\((?<target>[^)\r\n]+)\)'
    $linkFailures = 0
    foreach ($relativePath in $markdownPaths) {
        $fullPath = Join-Path $Root ($relativePath -replace "/", "\")
        try {
            $content = Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8
            foreach ($match in $linkPattern.Matches($content)) {
                $target = $match.Groups["target"].Value.Trim()
                if ($target.StartsWith("<")) {
                    $end = $target.IndexOf(">")
                    if ($end -gt 0) {
                        $target = $target.Substring(1, $end - 1)
                    }
                }
                else {
                    $target = ($target -split "\s+")[0]
                }

                if ([string]::IsNullOrWhiteSpace($target) -or
                    $target.StartsWith("#") -or
                    $target -match "^(?i:https?:|mailto:|data:|//|[a-z]:[\\/]|/)") {
                    continue
                }

                $target = ($target -split "[#?]")[0]
                if ([string]::IsNullOrWhiteSpace($target)) {
                    continue
                }

                $candidate = Join-Path (Split-Path -Parent $fullPath) ($target -replace "/", "\")
                if (-not (Test-Path -LiteralPath $candidate)) {
                    $linkFailures++
                    Add-Failure "Markdown link ${relativePath}" "Missing target ${target}."
                }
            }
        }
        catch {
            $linkFailures++
            Add-Failure "Markdown ${relativePath}" $_.Exception.Message
        }
    }
    if ($linkFailures -eq 0) {
        $markdownCount = $markdownPaths.Count
        Add-Passed "tracked Markdown links (${markdownCount} files)"
    }

    $lockCompanions = @{
        "pnpm-lock.yaml" = @("package.json")
        "src-tauri/Cargo.lock" = @("src-tauri/Cargo.toml")
        "python/requirements-ci.lock" = @("python/pyproject.toml")
    }
    foreach ($lockPath in @($baseline.lock_files)) {
        if (-not (Assert-TrackedFile ([string]$lockPath))) {
            continue
        }

        if (-not (Test-GitPathChanged $lockPath)) {
            Add-Passed "lock file ${lockPath}"
            continue
        }
        $pairedManifestChanged = $false
        foreach ($companion in @($lockCompanions[[string]$lockPath])) {
            if (Test-GitPathChanged $companion) {
                $pairedManifestChanged = $true
                break
            }
        }
        if ($pairedManifestChanged) {
            Add-Passed "lock file ${lockPath} paired with dependency manifest"
        }
        else {
            Add-Failure "lock file ${lockPath}" "Lockfile changes require a paired dependency manifest change."
        }
    }

    Invoke-Tool "git diff --check" "git" @("-C", $Root, "diff", "--check") | Out-Null
    Invoke-Tool "git diff --cached --check" "git" @("-C", $Root, "diff", "--cached", "--check") | Out-Null
    return $baseline
}

function Check-Toolchain {
    param($Baseline)

    Write-Host "== Toolchain ==" -ForegroundColor Cyan
    $pythonPath = Join-Path $Root ([string]$Baseline.tools.python.path -replace "/", "\")
    if (Test-Path -LiteralPath $pythonPath -PathType Leaf) {
        $pythonVersion = [regex]::Escape([string]$Baseline.tools.python.version)
        Check-ToolVersion "project Python" $pythonPath @("--version") ("Python " + $Baseline.tools.python.version) "^Python ${pythonVersion}$" | Out-Null
        Check-ProjectPythonOrigin $pythonPath | Out-Null
    }
    else {
        Add-Failure "project Python" "Expected interpreter ${pythonPath} is missing; install it outside this script."
    }

    $nodeVersion = [regex]::Escape([string]$Baseline.tools.node.version)
    $pnpmVersion = [regex]::Escape([string]$Baseline.tools.pnpm.version)
    $rustVersion = [regex]::Escape([string]$Baseline.tools.rustc.version)
    $cargoVersion = [regex]::Escape([string]$Baseline.tools.cargo.version)
    Check-ToolVersion "Node.js" "node" @("--version") ("v" + $Baseline.tools.node.version) "^v${nodeVersion}$" | Out-Null
    Check-ToolVersion "pnpm" "pnpm" @("--version") ([string]$Baseline.tools.pnpm.version) "^${pnpmVersion}$" | Out-Null
    Check-ToolVersion "rustc" "rustc" @("--version") ([string]$Baseline.tools.rustc.version) "^rustc ${rustVersion}(?:\s|$)" | Out-Null
    Check-ToolVersion "cargo" "cargo" @("--version") ([string]$Baseline.tools.cargo.version) "^cargo ${cargoVersion}(?:\s|$)" | Out-Null
    Check-RustToolchain $Baseline | Out-Null
    return $pythonPath
}

function Check-RustToolchain {
    param($Baseline)

    $rustInfo = Get-ToolOutput "rustc verbose" "rustc" @("--version", "--verbose")
    if ($null -eq $rustInfo) {
        return $false
    }

    $expectedRelease = [string]$Baseline.tools.rustc.version
    $expectedHost = [string]$Baseline.tools.rustc.host
    $expectedCommit = [string]$Baseline.tools.rustc.commit
    $releaseOk = $rustInfo -match "(?m)^release:\s+$([regex]::Escape($expectedRelease))$"
    $hostOk = $rustInfo -match "(?m)^host:\s+$([regex]::Escape($expectedHost))$"
    $commitOk = $rustInfo -match "(?m)^commit-hash:\s+$([regex]::Escape($expectedCommit))$"
    if (-not $releaseOk -or -not $hostOk -or -not $commitOk) {
        Add-Failure "Rust compiler identity" "Expected release=${expectedRelease}, host=${expectedHost}, commit=${expectedCommit}."
        return $false
    }
    Add-Passed "Rust compiler identity"

    $rustfmt = Get-ToolOutput "rustfmt" ([string]$Baseline.tools.rustfmt.command) @("--version")
    $rustfmtCommit = [regex]::Escape($expectedCommit.Substring(0, 10))
    if ($null -eq $rustfmt -or $rustfmt -notmatch $rustfmtCommit) {
        Add-Failure "rustfmt identity" "rustfmt is not from the pinned Rust compiler commit."
        return $false
    }
    Add-Passed "rustfmt identity"

    $clippy = Get-ToolOutput "clippy" "cargo" @("clippy", "--version")
    $expectedClippyVersion = [regex]::Escape([string]$Baseline.tools.clippy.version)
    if ($null -eq $clippy -or $clippy -notmatch "(?m)^clippy ${expectedClippyVersion}(?:\s|$)" -or $clippy -notmatch $rustfmtCommit) {
        Add-Failure "clippy identity" "Clippy is not the pinned version/compiler component."
        return $false
    }
    Add-Passed "clippy identity"
    return $true
}

function Check-Fast {
    param([string]$PythonPath)

    Write-Host "== Fast ==" -ForegroundColor Cyan
    Invoke-Tool "Python pytest" $PythonPath @("-m", "pytest", "python\tests") | Out-Null
    Invoke-Tool "Python Ruff" $PythonPath @("-m", "ruff", "check", "python") | Out-Null
    Invoke-Tool "Tauri command contract" "node" @("scripts\tests\test-tauri-command-contract.mjs", "--strict-generated-permissions") | Out-Null
    Invoke-Tool "AGENT-06 release contract" "node" @("scripts\tests\test-agent-06-release-contract.mjs", $Root) | Out-Null
    Invoke-Tool "AGENT-07 release closure contract" "node" @("scripts\tests\test-release-closure-contract.mjs", $Root) | Out-Null
    Invoke-Tool "AGENT-08 installer contract" "node" @("scripts\tests\test-agent-08-installer-clean-machine-contract.mjs", $Root) | Out-Null
    Invoke-Tool "EXPERT-FIX runtime/distribution contract" "node" @("scripts\tests\test-expert-fix-runtime-contract.mjs", $Root) | Out-Null
    Invoke-Tool "Release metadata" "node" @("scripts\check-release-metadata.mjs", $Root) | Out-Null
    Invoke-Tool "pnpm cache contract" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-pnpm-cache-contract.ps1")) $Root | Out-Null
    Invoke-Tool "pnpm cache contract mutations" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-pnpm-cache-contract-mutations.ps1")) $Root | Out-Null
    Invoke-Tool "Frontend tests" "pnpm" @("test") | Out-Null
    Invoke-Tool "Rust tests" "cargo" @("test", "--locked") (Join-Path $Root "src-tauri") | Out-Null
    Invoke-Tool "NIST CONTAM tools acquisition script" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-contam-tools-script.ps1")) $Root | Out-Null
    Invoke-Tool "NIST CONTAM temp-root contract" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-contam-temp-root.ps1"), "-RepoRoot", $Root) $Root | Out-Null
    Invoke-Tool "NIST CONTAM redirected-process contract" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-contam-tools-redirected-process.ps1")) $Root | Out-Null
}

function Check-Full {
    param([string]$PythonPath)

    Write-Host "== Full ==" -ForegroundColor Cyan
    Invoke-Tool "Windows CI contract" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-windows-ci-contract.ps1")) $Root | Out-Null
    Invoke-Tool "Windows CI contract mutations" "powershell.exe" @("-NoProfile", "-File", (Join-Path $Root "scripts\tests\test-windows-ci-contract-mutations.ps1")) $Root | Out-Null
    Invoke-Tool "Frontend production build" "pnpm" @("build") | Out-Null
    Invoke-Tool "Rust format check" "cargo" @("fmt", "--check") (Join-Path $Root "src-tauri") | Out-Null
    Invoke-Tool "Rust Clippy" "cargo" @("clippy", "--locked", "--all-targets", "--", "-D", "warnings") (Join-Path $Root "src-tauri") | Out-Null
    Invoke-Tool "Cargo check" "cargo" @("check", "--locked") (Join-Path $Root "src-tauri") | Out-Null
}

Write-Host "QA-01 verification mode: ${Mode}" -ForegroundColor Cyan
$baseline = Check-Docs
if ($null -ne $baseline -and $Mode -in @("Fast", "Full")) {
    $pythonPath = Check-Toolchain $baseline
    if ($Failures.Count -eq 0) {
        Check-Fast $pythonPath
        if ($Mode -eq "Full") {
            Check-Full $pythonPath
        }
    }
    else {
        Write-Host "Skipping Fast/Full checks because the toolchain gate failed." -ForegroundColor Yellow
    }
}

if ($Failures.Count -gt 0) {
    Write-Host "QA-01 failed: $($Failures.Count) check(s) failed; $($Passed.Count) passed." -ForegroundColor Red
    $Failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "QA-01 passed: $($Passed.Count) checks passed." -ForegroundColor Green
exit 0
