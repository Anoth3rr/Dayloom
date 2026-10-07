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
$shortcutShell = New-Object -ComObject WScript.Shell
$shortcut = $shortcutShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $appExecutable
$shortcut.WorkingDirectory = $appDirectory
$shortcut.IconLocation = "$appExecutable,0"
$shortcut.Description = 'Dayloom - Tasks and calendar'
$shortcut.Save()

$saved = $shortcutShell.CreateShortcut($shortcutPath)
if ($saved.TargetPath -ne $appExecutable -or -not (Test-Path -LiteralPath $saved.TargetPath -PathType Leaf)) {
    throw 'The saved shortcut target could not be verified.'
}
[PSCustomObject]@{ Shortcut = $shortcutPath; Target = $saved.TargetPath; WorkingDirectory = $saved.WorkingDirectory }
