param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,
  [string]$Zone = "us-central1-a",
  [string]$InstanceName = "dc-ticket-bot-free",
  [string]$MachineType = "e2-micro",
  [switch]$EnableDashboard,
  [switch]$SkipFirewall
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

  throw "Google Cloud SDK is not installed. Install it first (gcloud CLI)."
}

function Invoke-Gcloud {
  param(
    [string]$GcloudCmd,
    [string[]]$Args
  )

  & $GcloudCmd @Args
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud command failed: gcloud $($Args -join ' ')"
  }
}

function Ensure-Authenticated {
  param([string]$GcloudCmd)

  $accounts = & $GcloudCmd auth list --format="value(account)" 2>$null
  if ([string]::IsNullOrWhiteSpace(($accounts -join "").Trim())) {
    throw "gcloud is not authenticated. Run: gcloud auth login"
  }
}

function Read-EnvMap {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw ".env file not found at $Path"
  }

  $map = [ordered]@{}
  foreach ($line in (Get-Content -LiteralPath $Path)) {
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
    $map[$key] = $value
  }

  return $map
}

function Write-EnvMap {
  param(
    [string]$Path,
    [System.Collections.IDictionary]$Map
  )

  $outLines = @()
  foreach ($entry in $Map.GetEnumerator()) {
    $outLines += "$($entry.Key)=$($entry.Value)"
  }
  Set-Content -LiteralPath $Path -Value ($outLines -join "`r`n") -Encoding UTF8
}

function Get-InstanceTags {
  param(
    [string]$GcloudCmd,
    [string]$ProjectId,
    [string]$Zone,
    [string]$InstanceName
  )

  $rawTags = & $GcloudCmd compute instances describe $InstanceName --project $ProjectId --zone $Zone --format="value(tags.items[])"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawTags)) {
    return @()
  }

  return $rawTags.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries) |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ } |
    Select-Object -Unique
}

function Wait-ForSsh {
  param(
    [string]$GcloudCmd,
    [string]$ProjectId,
    [string]$Zone,
    [string]$InstanceName
  )

  $maxAttempts = 20
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    & $GcloudCmd compute ssh $InstanceName --project $ProjectId --zone $Zone --command "echo ready" --quiet *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 10
  }

  throw "VM is running but SSH did not become ready in time."
}

$gcloud = Get-GcloudCmd
Ensure-Authenticated -GcloudCmd $gcloud

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $repoRoot ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
  throw ".env file is required before deployment."
}

Write-Host "Using gcloud: $gcloud" -ForegroundColor Cyan
Invoke-Gcloud -GcloudCmd $gcloud -Args @("config", "set", "project", $ProjectId)
Invoke-Gcloud -GcloudCmd $gcloud -Args @("services", "enable", "compute.googleapis.com", "--project", $ProjectId, "--quiet")

$instanceExists = $false
& $gcloud compute instances describe $InstanceName --project $ProjectId --zone $Zone --format="value(name)" *> $null
if ($LASTEXITCODE -eq 0) {
  $instanceExists = $true
}

$requiredTags = @("dc-ticket-bot")
if ($EnableDashboard) {
  $requiredTags += "dc-ticket-dashboard"
}

if (-not $instanceExists) {
  Write-Host "Creating VM $InstanceName in $Zone ..." -ForegroundColor Cyan
  Invoke-Gcloud -GcloudCmd $gcloud -Args @(
    "compute", "instances", "create", $InstanceName,
    "--project", $ProjectId,
    "--zone", $Zone,
    "--machine-type", $MachineType,
    "--image-family", "debian-12",
    "--image-project", "debian-cloud",
    "--boot-disk-type", "pd-standard",
    "--boot-disk-size", "30GB",
    "--tags", ($requiredTags -join ",")
  )
} else {
  Write-Host "VM already exists, reusing $InstanceName." -ForegroundColor Yellow
  $currentTags = Get-InstanceTags -GcloudCmd $gcloud -ProjectId $ProjectId -Zone $Zone -InstanceName $InstanceName
  $mergedTags = @($currentTags + $requiredTags | Select-Object -Unique)
  if (($mergedTags | Sort-Object) -join "," -ne ($currentTags | Sort-Object) -join ",") {
    Invoke-Gcloud -GcloudCmd $gcloud -Args @(
      "compute", "instances", "add-tags", $InstanceName,
      "--project", $ProjectId,
      "--zone", $Zone,
      "--tags", ($mergedTags -join ",")
    )
  }
}

if ($EnableDashboard -and -not $SkipFirewall) {
  $ruleName = "allow-dc-ticket-dashboard-3000"
  & $gcloud compute firewall-rules describe $ruleName --project $ProjectId *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating firewall rule for dashboard port 3000..." -ForegroundColor Cyan
    Invoke-Gcloud -GcloudCmd $gcloud -Args @(
      "compute", "firewall-rules", "create", $ruleName,
      "--project", $ProjectId,
      "--direction", "INGRESS",
      "--network", "default",
      "--allow", "tcp:3000",
      "--source-ranges", "0.0.0.0/0",
      "--target-tags", "dc-ticket-dashboard",
      "--description", "Allow dashboard access on port 3000 for dc-ticket-bot"
    )
  }
}

$externalIp = (& $gcloud compute instances describe $InstanceName --project $ProjectId --zone $Zone --format="value(networkInterfaces[0].accessConfigs[0].natIP)").Trim()
if ([string]::IsNullOrWhiteSpace($externalIp)) {
  throw "Could not determine VM external IP."
}

Write-Host "VM IP: $externalIp" -ForegroundColor Green
Write-Host "Waiting for SSH availability..." -ForegroundColor Cyan
Wait-ForSsh -GcloudCmd $gcloud -ProjectId $ProjectId -Zone $Zone -InstanceName $InstanceName

$stageRoot = Join-Path $env:TEMP ("dc-ticket-bot-stage-" + [Guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $env:TEMP ("dc-ticket-bot-" + [Guid]::NewGuid().ToString("N") + ".zip")
$installScriptPath = Join-Path $env:TEMP ("dc-ticket-bot-install-" + [Guid]::NewGuid().ToString("N") + ".sh")

New-Item -ItemType Directory -Path $stageRoot | Out-Null

try {
  foreach ($dirName in @("src", "assets", "data")) {
    $srcDir = Join-Path $repoRoot $dirName
    if (Test-Path -LiteralPath $srcDir) {
      Copy-Item -LiteralPath $srcDir -Destination (Join-Path $stageRoot $dirName) -Recurse -Force
    }
  }

  foreach ($fileName in @("package.json", "package-lock.json", ".env")) {
    $srcFile = Join-Path $repoRoot $fileName
    if (Test-Path -LiteralPath $srcFile) {
      Copy-Item -LiteralPath $srcFile -Destination (Join-Path $stageRoot $fileName) -Force
    }
  }

  $stagedEnvPath = Join-Path $stageRoot ".env"
  $envMap = Read-EnvMap -Path $stagedEnvPath
  if ($EnableDashboard) {
    if (-not $envMap.Contains("DASHBOARD_ENABLED")) {
      $envMap["DASHBOARD_ENABLED"] = "true"
    } else {
      $envMap["DASHBOARD_ENABLED"] = "true"
    }
    if (-not $envMap.Contains("PUBLIC_BASE_URL") -or [string]::IsNullOrWhiteSpace([string]$envMap["PUBLIC_BASE_URL"])) {
      $envMap["PUBLIC_BASE_URL"] = "http://$externalIp:3000"
    }
  } else {
    $envMap["DASHBOARD_ENABLED"] = "false"
    $envMap["PUBLIC_BASE_URL"] = ""
  }
  Write-EnvMap -Path $stagedEnvPath -Map $envMap

  Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -Force

  $installScript = @'
#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

sudo apt-get update -y
sudo apt-get install -y curl ca-certificates gnupg unzip build-essential

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo mkdir -p /opt/dc-ticket-bot
sudo rm -rf /opt/dc-ticket-bot/*
sudo unzip -o ~/dc-ticket-bot.zip -d /opt/dc-ticket-bot >/dev/null
sudo chown -R "$USER":"$USER" /opt/dc-ticket-bot

cd /opt/dc-ticket-bot
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

SERVICE_FILE="/etc/systemd/system/dc-ticket-bot.service"
sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Discord Ticket Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/dc-ticket-bot
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable dc-ticket-bot
sudo systemctl restart dc-ticket-bot
sudo systemctl --no-pager --full status dc-ticket-bot | head -n 20
'@

  Set-Content -LiteralPath $installScriptPath -Value $installScript -Encoding UTF8

  Write-Host "Uploading package and install script..." -ForegroundColor Cyan
  Invoke-Gcloud -GcloudCmd $gcloud -Args @(
    "compute", "scp", $zipPath, $installScriptPath,
    "$InstanceName`:~/",
    "--project", $ProjectId,
    "--zone", $Zone
  )

  Write-Host "Running remote installation..." -ForegroundColor Cyan
  Invoke-Gcloud -GcloudCmd $gcloud -Args @(
    "compute", "ssh", $InstanceName,
    "--project", $ProjectId,
    "--zone", $Zone,
    "--command", "chmod +x ~/$(Split-Path -Leaf $installScriptPath) && bash ~/$(Split-Path -Leaf $installScriptPath)"
  )

  Write-Host ""
  Write-Host "Deploy complete." -ForegroundColor Green
  Write-Host "VM: $InstanceName ($externalIp)" -ForegroundColor Green
  if ($EnableDashboard) {
    Write-Host "Dashboard URL: http://$externalIp:3000/login" -ForegroundColor Green
  } else {
    Write-Host "Dashboard is disabled for free-tier safety." -ForegroundColor Yellow
  }
  Write-Host "Check bot logs: gcloud compute ssh $InstanceName --zone $Zone --project $ProjectId --command `"sudo journalctl -u dc-ticket-bot -f`"" -ForegroundColor Cyan
} finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $installScriptPath) {
    Remove-Item -LiteralPath $installScriptPath -Force -ErrorAction SilentlyContinue
  }
}

