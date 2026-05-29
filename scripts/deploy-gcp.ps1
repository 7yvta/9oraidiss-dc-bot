param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,
  [string]$Region = "us-central",
  [switch]$SkipDeploy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-GcloudCmd {
  $paths = @(
    "gcloud",
    "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "$env:ProgramFiles(x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  )

  foreach ($path in $paths) {
    try {
      if ($path -eq "gcloud") {
        $null = & $path --version 2>$null
        if ($LASTEXITCODE -eq 0) {
          return $path
        }
        continue
      }

      if (Test-Path -LiteralPath $path) {
        return $path
      }
    } catch {
      continue
    }
  }

  throw "Google Cloud SDK is not installed. Install it first with: winget install -e --id Google.CloudSDK"
}

function Read-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw ".env file not found at $Path"
  }

  $map = [ordered]@{}
  $lines = Get-Content -LiteralPath $Path
  foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
      continue
    }

    $eqIndex = $trimmed.IndexOf("=")
    if ($eqIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $eqIndex).Trim()
    $value = $trimmed.Substring($eqIndex + 1)
    if ([string]::IsNullOrWhiteSpace($key)) {
      continue
    }

    if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value.StartsWith("'") -and $value.EndsWith("'") -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $map[$key] = $value
  }

  return $map
}

function Escape-YamlValue {
  param([string]$Value)
  if ($null -eq $Value) {
    return "''"
  }
  return "'" + $Value.Replace("'", "''") + "'"
}

function Ensure-Authenticated {
  param(
    [string]$GcloudCmd
  )

  $accounts = & $GcloudCmd auth list --format="value(account)" 2>$null
  if ([string]::IsNullOrWhiteSpace(($accounts -join "").Trim())) {
    Write-Host ""
    Write-Host "No Google account is authenticated in gcloud." -ForegroundColor Yellow
    Write-Host "Run this command, finish login, then run deploy again:" -ForegroundColor Yellow
    Write-Host "  $GcloudCmd auth login --no-launch-browser" -ForegroundColor Cyan
    throw "gcloud is not authenticated."
  }
}

function Ensure-AppEngineApp {
  param(
    [string]$GcloudCmd,
    [string]$ProjectId,
    [string]$Region
  )

  & $GcloudCmd app describe --project $ProjectId --quiet *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "App Engine app already exists in project $ProjectId." -ForegroundColor Green
    return
  }

  Write-Host "No App Engine app found. Creating one in region '$Region'..." -ForegroundColor Yellow
  & $GcloudCmd app create --project $ProjectId --region $Region --quiet
}

function Write-GeneratedAppYaml {
  param(
    [string]$OutputPath,
    [System.Collections.IDictionary]$EnvMap
  )

  $content = @()
  $content += "runtime: nodejs20"
  $content += ""
  $content += "instance_class: F2"
  $content += ""
  $content += "automatic_scaling:"
  $content += "  min_instances: 1"
  $content += "  max_instances: 3"
  $content += "  cpu_utilization:"
  $content += "    target_utilization: 0.75"
  $content += ""
  $content += "env_variables:"
  $content += "  NODE_ENV: 'production'"
  $content += "  PORT: '8080'"

  foreach ($entry in $EnvMap.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($entry.Value)) {
      continue
    }
    if ($entry.Key -in @("NODE_ENV", "PORT")) {
      continue
    }
    $content += "  $($entry.Key): $(Escape-YamlValue -Value $entry.Value)"
  }

  $content += ""
  $content += "resources:"
  $content += "  cpu: 1"
  $content += "  memory_gb: 1"
  $content += "  disk_size_gb: 10"
  $content += ""
  $content += "network:"
  $content += "  session_affinity: true"
  $content += ""
  $content += "handlers:"
  $content += "  - url: /.*"
  $content += "    script: auto"
  $content += "    secure: always"

  Set-Content -LiteralPath $OutputPath -Value ($content -join "`r`n") -Encoding UTF8
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $repoRoot ".env"
$generatedAppYaml = Join-Path $repoRoot "app.generated.yaml"

$gcloudCmd = Get-GcloudCmd

Write-Host "Using gcloud: $gcloudCmd" -ForegroundColor Cyan
& $gcloudCmd --version | Select-Object -First 1

Ensure-Authenticated -GcloudCmd $gcloudCmd
& $gcloudCmd config set project $ProjectId | Out-Null
Write-Host "Project set to $ProjectId" -ForegroundColor Green

Write-Host "Enabling required APIs..." -ForegroundColor Cyan
& $gcloudCmd services enable appengine.googleapis.com cloudbuild.googleapis.com --project $ProjectId --quiet

Ensure-AppEngineApp -GcloudCmd $gcloudCmd -ProjectId $ProjectId -Region $Region

$envMap = Read-DotEnv -Path $envFile
Write-GeneratedAppYaml -OutputPath $generatedAppYaml -EnvMap $envMap
Write-Host "Generated $generatedAppYaml from .env" -ForegroundColor Green

if ($SkipDeploy) {
  Write-Host "SkipDeploy is on. App YAML is ready for deployment." -ForegroundColor Yellow
  exit 0
}

Write-Host "Deploying to App Engine..." -ForegroundColor Cyan
try {
  & $gcloudCmd app deploy $generatedAppYaml --project $ProjectId --quiet
} finally {
  try {
    Remove-Item -LiteralPath $generatedAppYaml -Force -ErrorAction Stop
  } catch {
    Write-Host "Warning: could not remove generated file $generatedAppYaml" -ForegroundColor Yellow
  }
}

Write-Host "Deployment successful." -ForegroundColor Green
Write-Host "App URL: https://$ProjectId.appspot.com" -ForegroundColor Green
Write-Host "Dashboard: https://$ProjectId.appspot.com/login" -ForegroundColor Green
