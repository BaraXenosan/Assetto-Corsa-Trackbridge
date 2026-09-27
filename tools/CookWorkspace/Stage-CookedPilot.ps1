param(
    [Parameter(Mandatory=$true)][string]$PilotReport,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$report = Get-Content -LiteralPath $PilotReport -Raw | ConvertFrom-Json
if ($report.passed -ne $true -or $report.installable -ne $false) { throw 'A passed geometry-import research report is required.' }
if ($report.asset -notmatch '^/Game/TrackBridge/KalinagoPilot/Run_([a-f0-9]{32})/KalinagoRoad\.KalinagoRoad$') { throw 'Unexpected pilot asset path.' }
$runId = $Matches[1]
$cookedRoot = Join-Path $PSScriptRoot 'Saved\Cooked\Windows'
$relativeBase = "F1Manager24\Content\TrackBridge\KalinagoPilot\Run_$runId\KalinagoRoad"
$destination = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $destination) { throw 'Output directory already exists.' }
$files = @()
foreach ($extension in @('.uasset','.uexp','.ubulk')) {
    $relative = $relativeBase + $extension
    $source = Join-Path $cookedRoot $relative
    if (-not (Test-Path -LiteralPath $source)) {
        if ($extension -ne '.ubulk') { throw "Required cooked output missing: $relative" }
        continue
    }
    $files += [pscustomobject]@{ Source=$source; Relative=$relative; Sha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$scriptObjects = Join-Path $projectRoot 'research\bahrain_legacy01\scriptobjects.bin'
if (-not (Test-Path -LiteralPath $scriptObjects)) { throw 'Game script object table is required for IoStore packing.' }
New-Item -ItemType Directory -Path $destination | Out-Null
foreach ($file in $files) {
    $target = [IO.Path]::GetFullPath((Join-Path $destination $file.Relative))
    if (-not $target.StartsWith($destination + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Destination path escaped staging directory.' }
    New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $file.Source -Destination $target
}
Copy-Item -LiteralPath $scriptObjects -Destination (Join-Path $destination 'scriptobjects.bin')
$manifest = @{ installable=$false; asset=$report.asset; pilotReport=[IO.Path]::GetFullPath($PilotReport); files=$files; scope='Staging of cooked road mesh only; no game installation.' }
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($destination + '-manifest.json') -Encoding utf8
Write-Output "Staged $($files.Count) cooked files for $($report.asset)"
