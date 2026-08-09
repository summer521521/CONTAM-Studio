param(
  [string]$BuildRoot = "F:\Codex_File\build\contam-studio-python-worker",
  [string]$RuntimeOutput = "",
  [string]$BootstrapPython = "",
  [switch]$ResetEnvironment
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256Hex([string]$FilePath) {
  $stream = [IO.File]::OpenRead($FilePath)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") })
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Get-FullPath([string]$PathValue) {
  return [IO.Path]::GetFullPath($PathValue).TrimEnd("\")
}

function Assert-PathUnder([string]$Child, [string]$Parent, [string]$Label) {
  $childFull = Get-FullPath $Child
  $parentFull = Get-FullPath $Parent
  $prefix = $parentFull + "\"
  if (-not $childFull.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label escaped its approved root: $childFull"
  }
  return $childFull
}

function Invoke-WorkerJson(
  [string]$Executable,
  [string]$WorkingDirectory,
  [string]$RequestJson
) {
  $requestPath = Join-Path $WorkingDirectory ("worker-request-" + [Guid]::NewGuid().ToString("N") + ".json")
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($requestPath, $RequestJson, $utf8)
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $env:ComSpec
  $start.Arguments = '/D /S /C ""' + $Executable + '" < "' + $requestPath + '""'
  $start.WorkingDirectory = $WorkingDirectory
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $start
  if (-not $process.Start()) { throw "frozen worker process did not start" }
  $stdoutBytes = New-Object IO.MemoryStream
  $stderrBytes = New-Object IO.MemoryStream
  $process.StandardOutput.BaseStream.CopyTo($stdoutBytes)
  $process.StandardError.BaseStream.CopyTo($stderrBytes)
  $process.WaitForExit()
  try {
    return [PSCustomObject]@{
      exit_code = $process.ExitCode
      stdout = $utf8.GetString($stdoutBytes.ToArray())
      stderr = $utf8.GetString($stderrBytes.ToArray())
    }
  } finally {
    Remove-Item -LiteralPath $requestPath -Force -ErrorAction SilentlyContinue
  }
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$approvedBuildRoot = "F:\Codex_File"
$buildRootFull = Assert-PathUnder $BuildRoot $approvedBuildRoot "worker build root"
if ([string]::IsNullOrWhiteSpace($RuntimeOutput)) {
  $RuntimeOutput = Join-Path $repo "src-tauri\runtime\python-worker"
}
$runtimeRoot = Assert-PathUnder $RuntimeOutput (Join-Path $repo "src-tauri\runtime") "worker runtime output"
if ([string]::IsNullOrWhiteSpace($BootstrapPython)) {
  $BootstrapPython = Join-Path $repo "python\.venv\Scripts\python.exe"
}
$bootstrap = Get-FullPath $BootstrapPython
if (-not (Test-Path -LiteralPath $bootstrap -PathType Leaf)) {
  throw "validated Python bootstrap is missing: $bootstrap"
}

New-Item -ItemType Directory -Path $buildRootFull -Force | Out-Null
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

$venvRoot = Join-Path $buildRootFull "venv"
$workRoot = Join-Path $buildRootFull "work"
$distRoot = Join-Path $buildRootFull "dist"
$specRoot = Join-Path $buildRootFull "spec"
$lockPath = Join-Path $repo "python\requirements-worker.lock"
$entryPath = Join-Path $repo "python\packaging\worker_entry.py"
$pythonSource = Join-Path $repo "python\src"
$environmentMarker = Join-Path $venvRoot "contam-studio-requirements.sha256"
$lockHash = Get-Sha256Hex $lockPath

if ($ResetEnvironment -or
    -not (Test-Path -LiteralPath $environmentMarker -PathType Leaf) -or
    (Get-Content -LiteralPath $environmentMarker -Raw).Trim() -ne $lockHash) {
  if (Test-Path -LiteralPath $venvRoot) {
    Remove-Item -LiteralPath $venvRoot -Recurse -Force
  }
  & $bootstrap -m venv $venvRoot
  if ($LASTEXITCODE -ne 0) { throw "isolated worker build environment creation failed" }
  $venvPython = Join-Path $venvRoot "Scripts\python.exe"
  $env:PIP_DISABLE_PIP_VERSION_CHECK = "1"
  $env:PIP_CACHE_DIR = Join-Path $buildRootFull "pip-cache"
  $env:PYTHONUTF8 = "1"
  & $venvPython -m pip install --require-hashes --only-binary=:all: -r $lockPath
  if ($LASTEXITCODE -ne 0) { throw "hashed worker dependency installation failed" }
  Set-Content -LiteralPath $environmentMarker -Value $lockHash -Encoding ASCII
}

$venvPython = Join-Path $venvRoot "Scripts\python.exe"
$env:PYINSTALLER_CONFIG_DIR = Join-Path $buildRootFull "pyinstaller-cache"
$env:PYTHONUTF8 = "1"
foreach ($generatedRoot in @($workRoot, $distRoot, $specRoot, (Join-Path $buildRootFull "detached-smoke"))) {
  if (Test-Path -LiteralPath $generatedRoot) {
    Remove-Item -LiteralPath $generatedRoot -Recurse -Force
  }
}

& $venvPython -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --console `
  --noupx `
  --name "contam-studio-python-worker" `
  --distpath $distRoot `
  --workpath $workRoot `
  --specpath $specRoot `
  --paths $pythonSource `
  --hidden-import contamxpy `
  $entryPath
if ($LASTEXITCODE -ne 0) { throw "PyInstaller worker build failed" }

$builtRoot = Join-Path $distRoot "contam-studio-python-worker"
$builtWorker = Join-Path $builtRoot "contam-studio-python-worker.exe"
if (-not (Test-Path -LiteralPath $builtWorker -PathType Leaf)) {
  throw "frozen worker executable was not produced"
}
if (-not (Test-Path -LiteralPath (Join-Path $builtRoot "_internal") -PathType Container)) {
  throw "frozen worker internal runtime was not produced"
}

$sitePackages = Join-Path $venvRoot "Lib\site-packages"
$pythonLicense = (& $venvPython -c "import pathlib, sys; print(pathlib.Path(sys.base_prefix) / 'LICENSE.txt')").Trim()
$licenseSources = [ordered]@{
  "PYINSTALLER-COPYING.txt" = Join-Path $sitePackages "pyinstaller-6.21.0.dist-info\licenses\COPYING.txt"
  "PYTHON-LICENSE.txt" = $pythonLicense
  "CONTAMXPY-LICENSE.txt" = Join-Path $sitePackages "contamxpy-0.0.9.dist-info\LICENSE.txt"
  "CFFI-LICENSE.txt" = Join-Path $sitePackages "cffi-2.1.0.dist-info\licenses\LICENSE"
  "PYCPARSER-LICENSE.txt" = Join-Path $sitePackages "pycparser-3.0.dist-info\licenses\LICENSE"
}
$licenseRoot = Join-Path $builtRoot "licenses"
New-Item -ItemType Directory -Path $licenseRoot -Force | Out-Null
foreach ($entry in $licenseSources.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) {
    throw "frozen worker license source is missing: $($entry.Value)"
  }
  Copy-Item -LiteralPath $entry.Value -Destination (Join-Path $licenseRoot $entry.Key)
}

$smokeRoot = Join-Path $buildRootFull "detached-smoke"
New-Item -ItemType Directory -Path $smokeRoot -Force | Out-Null
$savedPythonPath = $env:PYTHONPATH
$savedConfiguredPython = $env:CONTAM_STUDIO_PYTHON
Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue
Remove-Item Env:\CONTAM_STUDIO_PYTHON -ErrorAction SilentlyContinue
Push-Location $smokeRoot
try {
  $smokeRequest = '{"protocol_version":"1.2","request_id":"frozen-worker-smoke","operation":"unknown"}'
  $smokeProcess = Invoke-WorkerJson $builtWorker $smokeRoot $smokeRequest
  if ($smokeProcess.exit_code -ne 0 -or -not [string]::IsNullOrEmpty($smokeProcess.stderr)) {
    throw "frozen worker detached smoke exited unsuccessfully"
  }
  $smoke = $smokeProcess.stdout.Trim() | ConvertFrom-Json
  $smokeValid = (
    [string]$smoke.protocol_version -eq "1.2" -and
    [string]$smoke.request_id -eq "frozen-worker-smoke" -and
    -not [bool]$smoke.ok -and
    [string]$smoke.error.code -eq "bridge_operation_unsupported"
  )
  if (-not $smokeValid) {
    throw "frozen worker detached smoke returned an invalid bridge envelope: $($smokeProcess.stdout)"
  }

  $fixtureSource = Join-Path $repo "fixtures\contam\official-contamxpy\test_GetPrjInfo.prj"
  $fixtureCopy = Join-Path $smokeRoot "detached-source.prj"
  Copy-Item -LiteralPath $fixtureSource -Destination $fixtureCopy
  $fixtureHashBefore = Get-Sha256Hex $fixtureCopy
  $readRequest = [ordered]@{
    protocol_version = "1.2"
    request_id = "frozen-worker-read"
    operation = "read_simple_zones"
    source_path = $fixtureCopy
  } | ConvertTo-Json -Compress
  $readProcess = Invoke-WorkerJson $builtWorker $smokeRoot $readRequest
  if ($readProcess.exit_code -ne 0 -or -not [string]::IsNullOrEmpty($readProcess.stderr)) {
    throw "frozen worker detached project read exited unsuccessfully"
  }
  $read = $readProcess.stdout.Trim() | ConvertFrom-Json
  $readValid = (
    [string]$read.protocol_version -eq "1.2" -and
    [string]$read.request_id -eq "frozen-worker-read" -and
    [bool]$read.ok -and
    [int]$read.result.project.declared_zone_count -eq 7
  )
  if (-not $readValid) {
    throw "frozen worker detached project read returned an invalid envelope"
  }

  $semanticRequest = [ordered]@{
    protocol_version = "1.2"
    request_id = "frozen-worker-semantic-read"
    operation = "read_semantic_project"
    source_path = $fixtureCopy
    baseline_sha256 = $fixtureHashBefore
    revision_id = "00000000-0000-5000-8000-000000000001"
  } | ConvertTo-Json -Compress
  $semanticProcess = Invoke-WorkerJson $builtWorker $smokeRoot $semanticRequest
  if ($semanticProcess.exit_code -ne 0 -or -not [string]::IsNullOrEmpty($semanticProcess.stderr)) {
    throw "frozen worker detached semantic project read exited unsuccessfully"
  }
  $semantic = $semanticProcess.stdout.Trim() | ConvertFrom-Json
  $semanticValid = (
    [string]$semantic.protocol_version -eq "1.2" -and
    [string]$semantic.request_id -eq "frozen-worker-semantic-read" -and
    [bool]$semantic.ok -and
    [string]$semantic.result.result_type -eq "semantic_project_snapshot" -and
    [string]$semantic.result.spatial_projection.schema_version -eq "spatial_projection.v1" -and
    [string]$semantic.result.spatial_projection.status -eq "available" -and
    @($semantic.result.zones).Count -eq 7
  )
  if (-not $semanticValid) {
    throw "frozen worker detached semantic project read returned an invalid envelope"
  }
  $fixtureHashAfter = Get-Sha256Hex $fixtureCopy
  if ($fixtureHashBefore -ne $fixtureHashAfter) {
    throw "frozen worker modified the detached source fixture"
  }
} finally {
  Pop-Location
  if ($null -ne $savedPythonPath) { $env:PYTHONPATH = $savedPythonPath }
  if ($null -ne $savedConfiguredPython) { $env:CONTAM_STUDIO_PYTHON = $savedConfiguredPython }
}

Get-ChildItem -LiteralPath $runtimeRoot -Force |
  Where-Object { $_.Name -ne "README.md" } |
  Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $builtRoot "*") -Destination $runtimeRoot -Recurse -Force

$runtimeWorker = Join-Path $runtimeRoot "contam-studio-python-worker.exe"
$pythonVersion = (& $venvPython -c "import platform; print(platform.python_version())").Trim()
$pyInstallerVersion = (& $venvPython -c "import PyInstaller; print(PyInstaller.__version__)").Trim()
$commit = (git -C $repo rev-parse HEAD).Trim()
$manifest = [ordered]@{
  schema_version = 1
  worker_kind = "pyinstaller_onedir"
  platform = "windows-x86_64"
  protocol_version = "1.2"
  commit_sha = $commit
  python_version = $pythonVersion
  pyinstaller_version = $pyInstallerVersion
  dependency_lock_sha256 = $lockHash
  worker_sha256 = (Get-Sha256Hex $runtimeWorker)
  source_tree_required = $false
  detached_protocol_smoke = "passed"
  detached_project_read = "passed"
  detached_semantic_project_read = "passed"
  source_fixture_unchanged = $true
}
$manifest |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (Join-Path $runtimeRoot "runtime-manifest.json") -Encoding UTF8

$manifest | ConvertTo-Json -Depth 4
