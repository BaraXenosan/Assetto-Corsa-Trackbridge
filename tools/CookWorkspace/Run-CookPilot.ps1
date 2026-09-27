param(
    [Parameter(Mandatory=$true)][string]$EngineRoot,
    [Parameter(Mandatory=$true)][string]$PilotReport,
    [Parameter(Mandatory=$true)][string]$LogPath
)
$ErrorActionPreference = 'Stop'
$report = Get-Content -LiteralPath $PilotReport -Raw | ConvertFrom-Json
if ($report.passed -ne $true -or $report.installable -ne $false) { throw 'Passed research import report required.' }
if ($report.asset -notmatch '^/Game/TrackBridge/KalinagoPilot/Run_([a-f0-9]{32})/KalinagoRoad\.KalinagoRoad$') { throw 'Unexpected pilot asset path.' }
$relative = "TrackBridge/KalinagoPilot/Run_$($Matches[1])/KalinagoRoad"
$version = Get-Content -LiteralPath (Join-Path $EngineRoot 'Engine/Build/Build.version') -Raw | ConvertFrom-Json
if ($version.MajorVersion -ne 5 -or $version.MinorVersion -ne 1) { throw 'UE 5.1 required.' }
$editor = Join-Path $EngineRoot 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
$inputAsset = Join-Path $PSScriptRoot "Content/$relative.uasset"
if (-not (Test-Path -LiteralPath $inputAsset)) { throw 'Imported pilot asset missing.' }
if (Test-Path -LiteralPath $LogPath) { throw 'Choose a new log path.' }
$started = [DateTime]::UtcNow
# UE 5.1 FindFilesRecursive consumes a disk directory, not a /Game package path.
$assetDirectory = Split-Path $inputAsset -Parent
& $editor (Join-Path $PSScriptRoot 'F1Manager24.uproject') '-run=cook' '-TargetPlatform=Windows' "-CookDir=$assetDirectory" '-CookSinglePackage' '-Unversioned' '-SkipEditorContent' '-unattended' '-nop4' '-nosplash' '-nullrhi' '-stdout' '-FullStdOutLogOutput' *> $LogPath
if ($LASTEXITCODE -ne 0) { throw "Cook failed: $LASTEXITCODE. See $LogPath" }
foreach ($extension in @('.uasset', '.uexp')) {
    $cooked = Get-Item -LiteralPath (Join-Path $PSScriptRoot "Saved/Cooked/Windows/F1Manager24/Content/$relative$extension")
    if ($cooked.Length -eq 0 -or $cooked.LastWriteTimeUtc -lt $started) { throw "Missing or stale cooked output: $($cooked.FullName)" }
}
Write-Output 'Pilot cooking completed and fresh output files verified. installable: false'
