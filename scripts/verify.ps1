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

    foreach ($lockPath in @($baseline.lock_files)) {
        if (-not (Assert-TrackedFile ([string]$lockPath))) {
            continue
        }

        & git -C $Root diff --quiet -- $lockPath
        if ($LASTEXITCODE -ne 0) {
            Add-Failure "lock file ${lockPath}" "Working-tree lockfile changes are present."
        }
        else {
            & git -C $Root diff --cached --quiet -- $lockPath
            if ($LASTEXITCODE -ne 0) {
                Add-Failure "lock file ${lockPath}" "Staged lockfile changes are present."
            }
            else {
                Add-Passed "lock file ${lockPath}"
            }
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
    Check-ToolVersion "Rust host toolchain" "rustup" @("show", "active-toolchain") ([string]$Baseline.tools.rustup_toolchain.version) "^$([regex]::Escape([string]$Baseline.tools.rustup_toolchain.version))\s" | Out-Null
    return $pythonPath
}

function Check-Fast {
    param([string]$PythonPath)

    Write-Host "== Fast ==" -ForegroundColor Cyan
    Invoke-Tool "Python pytest" $PythonPath @("-m", "pytest", "python\tests") | Out-Null
    Invoke-Tool "Python Ruff" $PythonPath @("-m", "ruff", "check", "python") | Out-Null
    Invoke-Tool "Frontend tests" "pnpm" @("test") | Out-Null
    Invoke-Tool "Rust tests" "cargo" @("test", "--locked") (Join-Path $Root "src-tauri") | Out-Null
}

function Check-Full {
    param([string]$PythonPath)

    Write-Host "== Full ==" -ForegroundColor Cyan
    Invoke-Tool "Frontend production build" "pnpm" @("build") | Out-Null
    Invoke-Tool "Rust format check" "cargo" @("fmt", "--check") (Join-Path $Root "src-tauri") | Out-Null
    Invoke-Tool "Cargo check" "cargo" @("check", "--locked") (Join-Path $Root "src-tauri") | Out-Null
}

Write-Host "QA-01 verification mode: ${Mode}" -ForegroundColor Cyan
$baseline = Check-Docs
if ($null -ne $baseline -and $Mode -in @("Fast", "Full")) {
    $pythonPath = Check-Toolchain $baseline
    if ($Failures.Count -eq 0 -or $null -ne $pythonPath) {
        Check-Fast $pythonPath
        if ($Mode -eq "Full") {
            Check-Full $pythonPath
        }
    }
}

if ($Failures.Count -gt 0) {
    Write-Host "QA-01 failed: $($Failures.Count) check(s) failed; $($Passed.Count) passed." -ForegroundColor Red
    $Failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "QA-01 passed: $($Passed.Count) checks passed." -ForegroundColor Green
exit 0
