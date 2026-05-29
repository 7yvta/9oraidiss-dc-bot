# PowerShell Script to Start Enhanced Bot with Complete DM Notifications

Write-Host "🚀 Starting Enhanced Bot with Complete DM Notifications..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start the bot with enhanced dashboard
Write-Host "🤖 Starting bot with enhanced dashboard..." -ForegroundColor Blue
Write-Host "🔧 Features enabled:" -ForegroundColor Cyan
Write-Host "   • Enhanced Dyno-style dashboard" -ForegroundColor White
Write-Host "   • 17 complete dashboard modules" -ForegroundColor White
Write-Host "   • Role application system" -ForegroundColor White
Write-Host "   • Appeal system with public form" -ForegroundColor White
Write-Host "   • DM notifications for ALL moderation actions" -ForegroundColor White
Write-Host "   • Smart DM targeting (only affected users)" -ForegroundColor White

# Start the bot
node src/index.js

Write-Host "✅ Bot and dashboard started successfully!" -ForegroundColor Green
Write-Host "🌐 Dashboard: https://dc-ticket-bot-production.up.railway.app/login" -ForegroundColor Cyan
Write-Host "🔐 Login: admin / e220ca067f6f489b989feb673ac58e41" -ForegroundColor Yellow
Write-Host "📋 DM notifications enabled for all moderation actions!" -ForegroundColor Green
