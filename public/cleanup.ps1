# Removes a broken gamesavecloud install (0.1.0 / 0.2.0) whose uninstaller fails
# its integrity check and therefore blocks installing a newer version.
#
# Run in PowerShell:
#   irm https://gamesavecloud.vercel.app/cleanup.ps1 | iex
# or paste this file's contents.
#
# Your synced saves live in R2 and are NOT touched. Your local config is kept
# unless you pass -RemoveConfig.

param([switch]$RemoveConfig)

Write-Host "gamesavecloud cleanup" -ForegroundColor Cyan

# 1. stop the app
Get-Process gamesavecloud -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "  stopping gamesavecloud.exe (pid $($_.Id))"
  $_ | Stop-Process -Force
}
Start-Sleep -Seconds 1

# 2. program folder (perMachine:false installs under LocalAppData)
$dirs = @(
  "$env:LOCALAPPDATA\Programs\gamesavecloud",
  "$env:PROGRAMFILES\gamesavecloud",
  "${env:PROGRAMFILES(X86)}\gamesavecloud"
)
foreach ($d in $dirs) {
  if (Test-Path $d) {
    Write-Host "  removing $d"
    Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# 3. shortcuts
$links = @(
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\gamesavecloud.lnk",
  "$env:USERPROFILE\Desktop\gamesavecloud.lnk"
)
foreach ($l in $links) { if (Test-Path $l) { Write-Host "  removing shortcut"; Remove-Item $l -Force } }

# 4. uninstall entries — this is what blocks a reinstall
foreach ($root in @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
                    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall")) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
    $name = $_.GetValue("DisplayName")
    if ($name -like "*gamesavecloud*") {
      Write-Host "  removing registry entry: $name"
      Remove-Item $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

# 5. config — kept by default so your setup survives
$cfg = "$env:APPDATA\gamesavecloud"
if ($RemoveConfig -and (Test-Path $cfg)) {
  Write-Host "  removing config $cfg" -ForegroundColor Yellow
  Remove-Item $cfg -Recurse -Force
} elseif (Test-Path $cfg) {
  Write-Host "  keeping config at $cfg (use -RemoveConfig to delete)" -ForegroundColor DarkGray
}

Write-Host "done. you can now install a new version." -ForegroundColor Green
