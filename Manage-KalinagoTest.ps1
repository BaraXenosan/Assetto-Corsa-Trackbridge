param([Parameter(Mandatory=$true)][ValidateSet('Install','Rollback')][string]$Mode)
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$paks = Split-Path -Parent $project
$package = Join-Path $project 'research/kalinago-repair-pack03'
$manifest = Get-Content -LiteralPath (Join-Path $package 'test-manifest.json') -Raw | ConvertFrom-Json
if (Get-Process F1Manager24 -ErrorAction SilentlyContinue) { throw 'Close F1 Manager before installing or rolling back.' }
if ($Mode -eq 'Install' -and ($manifest.doNotInstall -eq $true -or $manifest.runtimeRejected -eq $true)) { throw 'This build was rejected after a runtime failure.' }
if ($manifest.installable -ne $false -or $manifest.offlineReadbackPassed -ne $true) { throw 'Unexpected prototype manifest' }
$unexpected = @(Get-ChildItem -LiteralPath $project -Recurse -Filter *.pak -File)
if ($unexpected.Count) { throw 'Research PAK files are active under the game directory. Disable them before proceeding.' }
$files = @($manifest.files.name)
if ($files.Count -ne 3 -or @($files | Where-Object { $_ -notmatch '^TrackBridge_Kalinago_(1003)_P\.(pak|utoc|ucas)$' }).Count) { throw 'Unexpected manifest file set' }
foreach ($name in $files) {
    $entry = @($manifest.files | Where-Object name -eq $name)
    if ($entry.Count -ne 1) { throw "Missing manifest entry: $name" }
    $sourceName = if ($Mode -eq 'Install' -and $name.EndsWith('.pak')) { $name + '.disabled' } else { $name }
    $source = Join-Path $(if ($Mode -eq 'Install') { $package } else { $paks }) $sourceName
    if (!(Test-Path -LiteralPath $source)) { throw "Missing file: $source" }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry[0].sha256) { throw "Hash mismatch: $source" }
    if ($Mode -eq 'Install' -and (Test-Path -LiteralPath (Join-Path $paks $name))) { throw "Already installed: $name" }
}
if ($Mode -eq 'Install') {
    foreach ($name in $files) {
        $sourceName = if ($name.EndsWith('.pak')) { $name + '.disabled' } else { $name }
        Copy-Item -LiteralPath (Join-Path $package $sourceName) -Destination (Join-Path $paks $name)
    }
    foreach ($name in $files) {
        $entry = $manifest.files | Where-Object name -eq $name
        if ((Get-FileHash -LiteralPath (Join-Path $paks $name) -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Installed hash mismatch: $name" }
    }
    Write-Output 'Experimental Kalinago container installed. Weekend/race validation is still required.'
} else {
    $archive = Join-Path $project ('research/rollback-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
    New-Item -ItemType Directory -Path $archive | Out-Null
    foreach ($name in $files) { Move-Item -LiteralPath (Join-Path $paks $name) -Destination (Join-Path $archive ($name + '.disabled')) }
    Write-Output "Test container removed from game mounting directory: $archive"
}



