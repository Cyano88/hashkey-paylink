param([string]$RequestFile,[ValidateSet('inspect','submit')][string]$Operation)
$ErrorActionPreference = 'Stop'
$request = Get-Content -LiteralPath $RequestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($request.base -notmatch '^https://explorer\.arc\.io/api/v2/smart-contracts/0x[0-9a-fA-F]{40}$') { throw 'Unexpected explorer endpoint' }
if ($Operation -eq 'inspect') {
  $result = Invoke-RestMethod -Uri $request.base -TimeoutSec 30
} else {
  Add-Type -AssemblyName System.Net.Http
  $form = New-Object System.Net.Http.MultipartFormDataContent
  try {
    foreach ($field in @('compiler_version','contract_name','constructor_args')) {
      $form.Add((New-Object System.Net.Http.StringContent([string]$request.$field)), $field)
    }
    $form.Add((New-Object System.Net.Http.StringContent('false')), 'autodetect_constructor_args')
    $form.Add((New-Object System.Net.Http.StringContent('mit')), 'license_type')
    $source = New-Object System.Net.Http.StringContent([string]$request.standardInput, [System.Text.Encoding]::UTF8, 'application/json')
    # Blockscout matches this media type literally and rejects a charset suffix.
    $source.Headers.ContentType.CharSet = $null
    $form.Add($source, 'files[0]', 'standard-input.json')
    $source.Headers.ContentDisposition = [System.Net.Http.Headers.ContentDispositionHeaderValue]::Parse('form-data; name="files[0]"; filename="standard-input.json"')
    $body = $form.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $result = Invoke-RestMethod -Uri ($request.base + '/verification/via/standard-input') -Method Post -Body $body -ContentType $form.Headers.ContentType.ToString() -TimeoutSec 30
  } finally { $form.Dispose() }
}
if ($result -is [string]) { Write-Output $result }
else { $result | ConvertTo-Json -Depth 100 -Compress }
