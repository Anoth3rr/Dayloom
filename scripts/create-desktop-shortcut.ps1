$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$appDirectory = Join-Path $projectRoot 'release\win-unpacked'
$appExecutable = Join-Path $appDirectory ($package.build.productName + '.exe')
if (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) {
    throw 'Desktop build not found. Run npm run package first.'
}

$desktopDirectory = [Environment]::GetFolderPath('Desktop')
if (-not $desktopDirectory) { throw 'Desktop directory not found.' }
$shortcutPath = Join-Path $desktopDirectory 'Dayloom.lnk'
$previousElectronMode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = $null
    $helper = Start-Process -FilePath $appExecutable -ArgumentList '--create-desktop-shortcut' -WorkingDirectory $appDirectory -WindowStyle Hidden -Wait -PassThru
    if ($helper.ExitCode -ne 0) { throw 'The desktop shortcut could not be created.' }
} finally {
    $env:ELECTRON_RUN_AS_NODE = $previousElectronMode
}
$shortcutShell = New-Object -ComObject WScript.Shell
$saved = $shortcutShell.CreateShortcut($shortcutPath)
$shellApplication = New-Object -ComObject Shell.Application
$savedAppId = $shellApplication.NameSpace($desktopDirectory).ParseName('Dayloom.lnk').ExtendedProperty('System.AppUserModel.ID')
if ($saved.TargetPath -ne $appExecutable -or $savedAppId -ne $package.build.appId -or -not (Test-Path -LiteralPath $saved.TargetPath -PathType Leaf)) {
    throw 'The saved shortcut target could not be verified.'
}
[PSCustomObject]@{ Shortcut = $shortcutPath; Target = $saved.TargetPath; WorkingDirectory = $saved.WorkingDirectory; AppId = $savedAppId }
