@echo off
set SCRIPT_DIR=%~dp0
set NODE_EXE=%SCRIPT_DIR%node-v20.11.1-win-x64\node.exe
set CLI=%SCRIPT_DIR%dist\index.js
set DEFAULT_CONFIG=%SCRIPT_DIR%hcai.dashscope.config.json

if not exist "%CLI%" (
  echo dist\index.js not found. Run build first.
  exit /b 1
)

set HAS_CONFIG=0
for %%a in (%*) do (
  if /i "%%a"=="--config" set HAS_CONFIG=1
)

if %HAS_CONFIG%==1 (
  if exist "%NODE_EXE%" (
    "%NODE_EXE%" "%CLI%" %*
  ) else (
    node "%CLI%" %*
  )
) else (
  if not exist "%DEFAULT_CONFIG%" (
    echo Config not found: %DEFAULT_CONFIG%
    exit /b 1
  )
  if exist "%NODE_EXE%" (
    "%NODE_EXE%" "%CLI%" %* --config "%DEFAULT_CONFIG%"
  ) else (
    node "%CLI%" %* --config "%DEFAULT_CONFIG%"
  )
)