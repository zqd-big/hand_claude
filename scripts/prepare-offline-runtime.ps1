param(
  [ValidateSet("linux", "darwin")]
  [string]$TargetOS = "linux",
  [ValidateSet("x64", "arm64")]
  [string]$TargetArch = "x64",
  [string]$NodeVersion = "20.11.1"
)

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root ".runtime"
$NodeDir = Join-Path $RuntimeDir "node-v$NodeVersion-$TargetOS-$TargetArch"
$NodeExe = Join-Path $NodeDir "bin\node"

$Archive = "node-v$NodeVersion-$TargetOS-$TargetArch.tar.gz"
$Url = "https://nodejs.org/dist/v$NodeVersion/$Archive"
$ArchivePath = Join-Path $RuntimeDir $Archive

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

if (Test-Path $NodeExe) {
  Write-Host "Node runtime already present: $NodeExe"
  exit 0
}

Write-Host "Downloading $Url"
$ProgressPreference = "SilentlyContinue"
Invoke-WebRequest -Uri $Url -OutFile $ArchivePath

Write-Host "Extracting runtime..."
& tar -xzf $ArchivePath -C $RuntimeDir 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Warning "tar returned a non-zero exit code. On Windows this is often caused by Linux symlinks (npm/npx/corepack) and can usually be ignored if node exists."
}

if (-not (Test-Path $NodeExe)) {
  Write-Error "Failed to setup Node runtime in $NodeDir"
  exit 1
}

Write-Host "Node runtime prepared: $NodeExe"
