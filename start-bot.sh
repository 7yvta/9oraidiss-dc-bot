#!/bin/bash

echo "🚀 Starting Enhanced Bot with Complete DM Notifications..."

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the bot with enhanced dashboard
echo "🤖 Starting bot with enhanced dashboard..."
node src/index.js

echo "✅ Bot and dashboard started successfully!"
echo "🌐 Dashboard: https://dc-ticket-bot-production.up.railway.app/login"
echo "🔐 Login: admin / e220ca067f6f489b989feb673ac58e41"
echo "📋 DM notifications enabled for all moderation actions!"
