<#
.SYNOPSIS
  Signs a local gamesavecloud build with a self-signed certificate trusted by
  this machine. For your own PCs while a real certificate is pending.

.DESCRIPTION
  Creates (or reuses) a code-signing certificate, installs it into the machine's
  Trusted Root and Trusted Publishers stores, and signs the app.

  This satisfies SmartScreen's "unknown publisher" complaint on THIS machine
  only. It does NOT satisfy Smart App Control: SAC evaluates signatures against
  Microsoft's own trust graph, not your local stores, so a self-signed binary
  stays blocked. If SAC is on, turning it off is the only way to run an unsigned
  or self-signed app — and that cannot be undone without reinstalling Windows.

.EXAMPLE
  # from an elevated PowerShell, in the extracted portable folder
  .\self-sign.ps1 -Path .\gamesavecloud.exe
#>
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$Subject = "CN=gamesavecloud local build"
)

$ErrorActionPreference = "Stop"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw "Run this from an elevated PowerShell — it writes to machine certificate stores." }
if (-not (Test-Path $Path)) { throw "No such file: $Path" }

# reuse the certificate across runs so repeated builds keep one identity
$cert = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Subject -eq $Subject -and $_.NotAfter -gt (Get-Date) } |
  Select-Object -First 1

if (-not $cert) {
  Write-Host "creating $Subject"
  $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Subject `
    -CertStoreLocation Cert:\CurrentUser\My -KeyUsage DigitalSignature `
    -KeyAlgorithm RSA -KeyLength 3072 -NotAfter (Get-Date).AddYears(5)

  # trust it here: as the issuing root, and as a publisher whose code may run
  $tmp = Join-Path $env:TEMP "gsc-selfsign.cer"
  Export-Certificate -Cert $cert -FilePath $tmp | Out-Null
  foreach ($store in "Root", "TrustedPublisher") {
    Import-Certificate -FilePath $tmp -CertStoreLocation "Cert:\LocalMachine\$store" | Out-Null
    Write-Host "trusted in LocalMachine\$store"
  }
  Remove-Item $tmp
}

$sig = Set-AuthenticodeSignature -FilePath $Path -Certificate $cert `
  -TimestampServer "http://timestamp.digicert.com" -HashAlgorithm SHA256

Write-Host "signature: $($sig.Status)"
if ($sig.Status -ne "Valid") { throw "signing failed: $($sig.StatusMessage)" }
Write-Host @"

Signed. On this machine SmartScreen will stop calling it an unknown publisher.
Smart App Control, if enabled, still blocks it — check with:
  Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard
"@
