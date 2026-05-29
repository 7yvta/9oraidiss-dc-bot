# PowerShell Deployment Script
Write-Host "🚀 Deploying Enhanced Dashboard with Fixed DM Notifications..."

# Change to project directory
Set-Location "c:/Users/gazla/Documents/Codex/2026-04-27/can-u-creat-a-fully-dc"

# Add all files
git add .

# Commit changes
git commit -m "FIXED DEPLOY: Enhanced dashboard with working DM notifications

✅ DM NOTIFICATIONS FIXED:
- Added Direct Messages intent to bot
- Created DM helper utility for better management
- Fixed client parameter passing in all moderation commands
- Improved error handling for DM failures

🔨 BAN COMMAND:
- DM to banned user with appeal link
- Appeal URL: https://dc-ticket-bot-production.up.railway.app/appeal
- Professional embed with all details

👢 KICK COMMAND:
- DM to kicked user with server invite
- Temporary invite (1 use, 1 hour)
- Rejoin option for kicked users

⚠️ WARN COMMAND:
- DM to warned user with warning details
- Warning ID and total count
- Consequence information if applicable

⏰ TIMEOUT COMMAND:
- DM to timed out user with duration
- Until timestamp for timeout end
- Clear reason and moderator info

🎯 COMPLETE SYSTEM:
- Enhanced Dashboard with Dyno-style design
- 17 complete dashboard modules
- Role application system
- Appeal system with public form
- Working DM notifications for all actions"

# Push to GitHub
git push origin main

Write-Host "✅ Deployment complete!"
Write-Host "🌐 Your dashboard: https://dc-ticket-bot-production.up.railway.app"
Write-Host "🔐 Login: admin / e220ca067f6f489b989feb673ac58e41"
Write-Host "📋 DM notifications now working for all moderation actions!"
