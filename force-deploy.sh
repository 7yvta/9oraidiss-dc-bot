#!/bin/bash

echo "🚀 Force Deploy Enhanced Dashboard with Role Applications"

# Remove old dashboard file to force using enhanced version
rm -f src/dashboard.js

# Add all files including enhanced dashboard
git add .

# Commit with force deploy message
git commit -m "FORCE DEPLOY: Enhanced dashboard with role applications

✅ ENHANCED DASHBOARD FEATURES:
- Dyno-style glass morphism design
- 17 complete dashboard modules
- Role application system with full management
- Warning system with auto-clear after 3 warnings
- Complete bot systems (tickets, giveaways, levels, appeals)
- Railway deployment configuration
- All utility stores and data management

🎨 ROLE APPLICATIONS INCLUDED:
- Application submission system
- Staff review and approval
- Role assignment on approval
- Dashboard management interface
- Complete application tracking

🔧 ALL SYSTEMS READY:
- Enhanced dashboard (src/dashboard-enhanced.js)
- Role application store (src/utils/roleApplicationStore.js)
- All 10 utility stores
- Railway configuration files
- Complete documentation

🚀 FORCING DEPLOYMENT TO REPLACE OLD DASHBOARD"

# Force push to Railway
git push origin main --force

echo "✅ Enhanced dashboard with role applications deployed!"
echo "🌐 https://dc-ticket-bot-production.up.railway.app"
echo "🔐 Login: admin / e220ca067f6f489b989feb673ac58e41"
echo "📋 Role applications now available in dashboard!"
