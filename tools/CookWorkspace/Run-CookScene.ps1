param(
    [Parameter(Mandatory=$true)][string]$EngineRoot,
    [Parameter(Mandatory=$true)][string]$SceneReport,
    [Parameter(Mandatory=$true)][string]$LogPath
)
$ErrorActionPreference = 'Stop'
$report = Get-Content -LiteralPath $SceneReport -Raw | ConvertFrom-Json
if ($report.passed -ne $true -or $report.installable -ne $false) { throw 'Successful research scene report required.' }
if ($report.assetRoot -notmatch '^/Game/TrackBridge/KalinagoScene/Run_[a-f0-9]{32}$') { throw 'Unexpected asset root.' }
$version = Get-Content -LiteralPath (Join-Path $EngineRoot 'Engine/Build/Build.version') -Raw | ConvertFrom-Json
if ($version.MajorVersion -ne 5 -or $version.MinorVersion -ne 1) { throw 'UE5.1 required.' }
if (Test-Path -LiteralPath $LogPath) { throw 'Choose a new log path.' }
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Config/DefaultGame.ini') -Raw
if ($config -notmatch '(?m)^bShareMaterialShaderCode=False\s*$') { throw 'Inline material shaders required.' }
$directory = Join-Path $PSScriptRoot ('Content/' + $report.assetRoot.Substring(6))
$editor = Join-Path $EngineRoot 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
$started = [DateTime]::UtcNow
# Tagged properties avoid relying on the game's customized unversioned Material layout.
& $editor (Join-Path $PSScriptRoot 'F1Manager24.uproject') '-run=cook' '-TargetPlatform=Windows' "-CookDir=$directory" "-Map=$($report.level)" '-CookSinglePackage' '-SkipEditorContent' '-unattended' '-nop4' '-nosplash' '-nullrhi' '-stdout' '-FullStdOutLogOutput' *> $LogPath
if ($LASTEXITCODE -ne 0) { throw "Cooking failed: $LASTEXITCODE" }
$files = @()
foreach ($asset in (@($report.meshes.asset) + @($report.materials.asset) + @($report.textures.asset) + @($report.level))) {
    $package = ($asset -split '\.')[0]
    if (-not $package.StartsWith($report.assetRoot + '/')) { throw 'Unexpected package.' }
    $relative = $package.Substring(6)
    $ext = if ($package -eq $report.level) { '.umap' } else { '.uasset' }
    foreach ($suffix in @($ext,'.uexp')) {
        $file = Get-Item -LiteralPath (Join-Path $PSScriptRoot "Saved/Cooked/Windows/F1Manager24/Content/$relative$suffix")
        if ($file.Length -eq 0 -or $file.LastWriteTimeUtc -lt $started) { throw "Missing or stale output: $file" }
        $files += [pscustomobject]@{path=$file.FullName;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
}
@{ passed=$true; installable=$false; assetRoot=$report.assetRoot; sharedMaterialShaderCode=$false; unversionedProperties=$false; files=$files; log=[IO.Path]::GetFullPath($LogPath) } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($LogPath + '.json') -Encoding utf8
Write-Output "Verified $($files.Count) fresh cooked files. installable: false"
