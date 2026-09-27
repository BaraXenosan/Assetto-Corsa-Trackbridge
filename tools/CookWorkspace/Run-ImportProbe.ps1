param([Parameter(Mandatory=$true)][string]$EngineRoot)
$ErrorActionPreference = 'Stop'
$versionPath = Join-Path $EngineRoot 'Engine\Build\Build.version'
$version = Get-Content -LiteralPath $versionPath -Raw | ConvertFrom-Json
if ($version.MajorVersion -ne 5 -or $version.MinorVersion -ne 1) { throw 'UE 5.1 is required for this workspace.' }
$editor = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
if (-not (Test-Path -LiteralPath $editor)) { throw 'UnrealEditor-Cmd.exe not found.' }
$project = Join-Path $PSScriptRoot 'F1Manager24.uproject'
$script = (Join-Path $PSScriptRoot 'Content\Python\probe_import.py').Replace('\','/')
& $editor $project '-run=pythonscript' "-script=$script" '-unattended' '-nop4' '-nosplash' '-nullrhi' '-stdout' '-FullStdOutLogOutput'
if ($LASTEXITCODE -ne 0) { throw "Unreal import probe failed: $LASTEXITCODE" }
Write-Output 'Inspect the newly generated Saved/TrackBridge/import-probe-*.json; passed must be true. No game mod has been installed.'
