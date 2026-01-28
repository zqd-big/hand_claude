param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeDir = Join-Path $ScriptDir "node-v20.11.1-win-x64"
$NodeExe = Join-Path $NodeDir "node.exe"
$Cli = Join-Path $ScriptDir "dist\index.js"
$DefaultConfig = Join-Path $ScriptDir "hcai.dashscope.config.json"

$nodeCmd = "node"
if (Test-Path $NodeExe) {
  $nodeCmd = $NodeExe
  $env:Path = "$NodeDir;$env:Path"
}

if (-not (Test-Path $Cli)) {
  Write-Error "dist/index.js not found. Run build first."
  exit 1
}

$hasConfig = $false
for ($i = 0; $i -lt $Args.Count; $i += 1) {
  if ($Args[$i] -eq "--config") {
    $hasConfig = $true
    break
  }
}

if (-not $hasConfig) {
  if (-not (Test-Path $DefaultConfig)) {
    Write-Error "Config not found: $DefaultConfig"
    exit 1
  }
  & $nodeCmd $Cli @Args --config $DefaultConfig
} else {
  & $nodeCmd $Cli @Args
}

exit $LASTEXITCODE