$ErrorActionPreference = 'Stop'

$running = Get-Process download-all -ErrorAction SilentlyContinue
if ($running) { $running | Stop-Process -Force; $running | Wait-Process -Timeout 10 }

$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Download All.lnk'
if (Test-Path $shortcutPath) { Remove-Item $shortcutPath }

$installDir = Join-Path $env:LOCALAPPDATA 'DownloadAll'
if (Test-Path $installDir) { Remove-Item -Recurse $installDir }

$steamPath = (Get-ItemProperty HKCU:\Software\Valve\Steam -ErrorAction SilentlyContinue).SteamPath
if ($steamPath) {
	$marker = Join-Path $steamPath '.cef-enable-remote-debugging'
	if (Test-Path $marker) { Remove-Item $marker }
}

Write-Host 'Uninstalled. Restart Steam to close its remote debugging port.'
