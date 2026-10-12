$ErrorActionPreference = 'Stop'

$source = @("$PSScriptRoot\download-all.exe", "$PSScriptRoot\dist\download-all.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $source) { throw 'download-all.exe not found. Run "pnpm build" in the standalone folder first.' }

$steamPath = (Get-ItemProperty HKCU:\Software\Valve\Steam -ErrorAction SilentlyContinue).SteamPath
if (-not $steamPath -or -not (Test-Path $steamPath)) { throw 'Steam installation not found.' }

$installDir = Join-Path $env:LOCALAPPDATA 'DownloadAll'
$exe = Join-Path $installDir 'download-all.exe'

$running = Get-Process download-all -ErrorAction SilentlyContinue
if ($running) { $running | Stop-Process -Force; $running | Wait-Process -Timeout 10 }
New-Item -ItemType Directory -Force $installDir | Out-Null
Copy-Item $source $exe -Force

$marker = Join-Path $steamPath '.cef-enable-remote-debugging'
if (-not (Test-Path $marker)) { New-Item -ItemType File $marker | Out-Null }

$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Download All.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = 'Adds a Download All button to the Steam Downloads page'
$shortcut.Save()

Start-Process $exe -WorkingDirectory $installDir

Write-Host "Installed to $installDir and added to Startup."
Write-Host 'Restart Steam once (Steam > Exit, then reopen) to enable the Download All button.'
Write-Host "Log: $installDir\download-all.log"
