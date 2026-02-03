param(
  [ValidateSet("linux", "darwin")]
  [string]$TargetOS = "linux",
  [ValidateSet("x64", "arm64")]
  [string]$TargetArch = "x64",
  [string]$NodeVersion = "20.11.1"
)

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $Root ".package"
$OutDir = Join-Path $Root "dist-packages"
$AppName = "hc-code"

$DistEntry = Join-Path $Root "dist\index.js"
if (-not (Test-Path $DistEntry)) {
  Write-Error "dist/index.js not found. Run: npm run build"
  exit 1
}

$NodeModules = Join-Path $Root "node_modules"
if (-not (Test-Path $NodeModules)) {
  Write-Error "node_modules not found. Run: npm ci"
  exit 1
}

$Archive = "node-v$NodeVersion-$TargetOS-$TargetArch.tar.gz"
$Url = "https://nodejs.org/dist/v$NodeVersion/$Archive"
$ArchivePath = Join-Path $BuildDir $Archive

$Staging = Join-Path $BuildDir "$AppName-$TargetOS-$TargetArch"
$RuntimeDir = Join-Path $Staging ".runtime"
$NodeDir = Join-Path $RuntimeDir "node-v$NodeVersion-$TargetOS-$TargetArch"
$NodeExe = Join-Path $NodeDir "bin\node"

New-Item -ItemType Directory -Force -Path $BuildDir, $OutDir, $Staging, $RuntimeDir | Out-Null

if (-not (Test-Path $ArchivePath)) {
  Write-Host "Downloading $Url"
  $ProgressPreference = "SilentlyContinue"
  Invoke-WebRequest -Uri $Url -OutFile $ArchivePath
}

if (-not (Test-Path $NodeExe)) {
  Write-Host "Extracting Node runtime..."
  & tar -xzf $ArchivePath -C $RuntimeDir 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "tar returned a non-zero exit code. On Windows this is often caused by Linux symlinks (npm/npx/corepack) and can usually be ignored if node exists."
  }
}

if (-not (Test-Path $NodeExe)) {
  Write-Error "Failed to setup Node runtime in $NodeDir"
  exit 1
}

# Copy project files to staging (exclude bulky dirs)
Write-Host "Sync project files to staging..."
$excludeDirs = @(".git", "dist-packages", ".package", ".runtime")
$excludeArgs = @()
foreach ($d in $excludeDirs) { $excludeArgs += "/XD"; $excludeArgs += $d }

$rc = & robocopy $Root $Staging /MIR @excludeArgs /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) {
  Write-Error "robocopy failed with exit code $LASTEXITCODE"
  exit 1
}

$TarName = "$AppName-$TargetOS-$TargetArch.tar.gz"
$TarPath = Join-Path $OutDir $TarName
if (Test-Path $TarPath) { Remove-Item -Force $TarPath }

Write-Host "Packaging: $TarPath"
& tar -czf $TarPath -C $BuildDir "$AppName-$TargetOS-$TargetArch"

Write-Host "Package created: $TarPath"
