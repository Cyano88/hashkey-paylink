param(
  [ValidateSet('bundleRelease', 'assembleRelease')]
  [string]$Task = 'bundleRelease'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$secureRoot = Join-Path $env:USERPROFILE '.hashpaylink\android'
$keyPath = Join-Path $secureRoot 'pocket-upload-key.jks'
$credentialPath = Join-Path $secureRoot 'pocket-upload-signing.dpapi'

if (!(Test-Path -LiteralPath $keyPath) -or !(Test-Path -LiteralPath $credentialPath)) {
  throw 'Pocket upload signing material is missing from the protected local credential directory.'
}

$previousPushFlag = $env:VITE_POCKET_PUSH_ENABLED
$env:VITE_POCKET_PUSH_ENABLED = 'true'
Push-Location $repoRoot
try {
  & 'npm.cmd' run build:pocket-mobile
  if ($LASTEXITCODE -ne 0) { throw "Pocket mobile web build failed with exit code $LASTEXITCODE." }
  & 'npx.cmd' cap sync android
  if ($LASTEXITCODE -ne 0) { throw "Capacitor Android sync failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
  $env:VITE_POCKET_PUSH_ENABLED = $previousPushFlag
}

$securePassword = ConvertTo-SecureString (Get-Content -Raw -LiteralPath $credentialPath)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:POCKET_UPLOAD_STORE_FILE = $keyPath
  $env:POCKET_UPLOAD_STORE_PASSWORD = $password
  $env:POCKET_UPLOAD_KEY_ALIAS = 'pocket-upload'
  $env:POCKET_UPLOAD_KEY_PASSWORD = $password
  Push-Location (Join-Path $repoRoot 'android')
  try {
    & '.\gradlew.bat' $Task
    if ($LASTEXITCODE -ne 0) { throw "Gradle $Task failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $password = $null
  $env:POCKET_UPLOAD_STORE_FILE = $null
  $env:POCKET_UPLOAD_STORE_PASSWORD = $null
  $env:POCKET_UPLOAD_KEY_ALIAS = $null
  $env:POCKET_UPLOAD_KEY_PASSWORD = $null
}
