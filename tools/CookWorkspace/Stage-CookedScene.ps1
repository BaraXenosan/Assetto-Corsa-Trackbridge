param(
    [Parameter(Mandatory=$true)][string]$SceneReport,
    [Parameter(Mandatory=$true)][string]$CookReport,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$report = Get-Content -LiteralPath $SceneReport -Raw | ConvertFrom-Json
if ($report.passed -ne $true -or $report.installable -ne $false) { throw 'Successful scene import report required.' }
if ($report.assetRoot -notmatch '^/Game/TrackBridge/KalinagoScene/Run_[a-f0-9]{32}$') { throw 'Unexpected scene root.' }
$cooking = Get-Content -LiteralPath $CookReport -Raw | ConvertFrom-Json
if ($cooking.passed -ne $true -or $cooking.sharedMaterialShaderCode -ne $false -or $cooking.unversionedProperties -ne $false -or $cooking.assetRoot -ne $report.assetRoot) { throw 'Verified inline-shader, tagged-property cooking report required.' }
foreach ($file in $cooking.files) {
    if ((Get-FileHash -LiteralPath $file.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw "Cooked file changed: $($file.path)" }
}
$destination = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $destination) { throw 'Output already exists.' }
$cooked = Join-Path $PSScriptRoot 'Saved/Cooked/Windows/F1Manager24/Content'
$packages = @($report.meshes.asset) + @($report.materials.asset) + @($report.textures.asset) + @($report.level)
$files = @()
foreach ($asset in $packages) {
    $package = ($asset -split '\.')[0]
    if (-not $package.StartsWith($report.assetRoot + '/', [StringComparison]::Ordinal)) { throw "Asset outside scene root: $asset" }
    $relative = $package.Substring('/Game/'.Length)
    $mainExtension = if ($package -eq $report.level) { '.umap' } else { '.uasset' }
    foreach ($ext in @($mainExtension, '.uexp', '.ubulk', '.uptnl')) {
        $source = Join-Path $cooked ($relative + $ext)
        if (-not (Test-Path -LiteralPath $source)) {
            if ($ext -eq $mainExtension -or $ext -eq '.uexp') { throw "Missing cooked file: $source" }
            continue
        }
        $files += [pscustomobject]@{ Source=$source; Relative="F1Manager24/Content/$relative$ext"; Sha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
}
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$scriptObjects = Join-Path $projectRoot 'research/bahrain_legacy01/scriptobjects.bin'
if (-not (Test-Path -LiteralPath $scriptObjects)) { throw 'Missing script object table.' }
New-Item -ItemType Directory -Path $destination | Out-Null
foreach ($file in $files) {
    $target = [IO.Path]::GetFullPath((Join-Path $destination $file.Relative))
    if (-not $target.StartsWith($destination + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Escaped output directory.' }
    New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $file.Source -Destination $target
}
Copy-Item -LiteralPath $scriptObjects -Destination (Join-Path $destination 'scriptobjects.bin')
@{ installable=$false; packages=$packages.Count; files=$files; scope='Visual scene only. Requires inline shader cooking; not a replacement race level.' } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($destination + '-manifest.json') -Encoding utf8
Write-Output "Staged $($packages.Count) visual packages. installable: false"
