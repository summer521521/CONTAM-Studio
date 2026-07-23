[CmdletBinding()]
param(
    [string]$ExpectedRoot = "F:\Codex_File\temp\contam-studio-v1-complete",
    [string]$ExpectedBranch = "codex/contam-studio-v1-complete",
    [string]$ExpectedOriginSha = "81205f49301859007e39b193e6a5b6ff0b5aebb4",
    [switch]$AllowCardChanges
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-Equal {
    param([string]$Name, [string]$Actual, [string]$Expected)
    if (-not $Actual.Equals($Expected, [System.StringComparison]::OrdinalIgnoreCase)) {
        $failures.Add("${Name}: expected '${Expected}', got '${Actual}'")
    }
}

function Invoke-Git {
    param([string[]]$Arguments)
    $output = @(& git -C $root @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return ($output -join "`n").Trim()
}

Assert-Equal "clone root" $root ([System.IO.Path]::GetFullPath($ExpectedRoot).TrimEnd("\"))
Assert-Equal "branch" (Invoke-Git @("branch", "--show-current")) $ExpectedBranch
Assert-Equal "origin/main" (Invoke-Git @("rev-parse", "origin/main")) $ExpectedOriginSha
Assert-Equal "clone base" (Invoke-Git @("merge-base", "HEAD", "origin/main")) $ExpectedOriginSha
Assert-Equal "origin URL" (Invoke-Git @("remote", "get-url", "origin")) "https://github.com/summer521521/CONTAM-Studio.git"

$gitCommonDir = Invoke-Git @("rev-parse", "--git-common-dir")
if (-not [System.IO.Path]::IsPathRooted($gitCommonDir)) {
    $gitCommonDir = [System.IO.Path]::GetFullPath((Join-Path $root $gitCommonDir))
}
if (-not $gitCommonDir.StartsWith($root + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
    $failures.Add("git metadata is outside the isolated clone")
}

foreach ($relativePath in @("node_modules", "python\.venv")) {
    $candidate = Join-Path $root $relativePath
    if (Test-Path -LiteralPath $candidate) {
        $item = Get-Item -LiteralPath $candidate -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            $failures.Add("${relativePath} must not be a junction, symlink, or other reparse point")
        }
    }
}

$unexpectedUntracked = @(
    Invoke-Git @("status", "--porcelain", "--untracked-files=all") -split "`n" |
        Where-Object { $_ -match '^\?\? (?:\.env(?:\.|$)|.*(?:secret|credential|token).*)' }
)
if ($unexpectedUntracked.Count -gt 0) {
    $failures.Add("sensitive-looking untracked files are forbidden")
}

if (-not $AllowCardChanges) {
    $status = Invoke-Git @("status", "--porcelain", "--untracked-files=all")
    if (-not [string]::IsNullOrWhiteSpace($status)) {
        $failures.Add("working tree is not clean")
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "Isolated clone baseline passed: root=${root}; branch=${ExpectedBranch}; origin/main=${ExpectedOriginSha}."
