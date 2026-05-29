
# New Server Setup Instructions

## Step 1: Create the Discord Server
1. Go to Discord and click the "+" icon to "Create My Own"
2. Choose "For me and my friends" or "Create a server"
3. Set server name: "Your New Server"
4. Upload a server icon (optional)
5. Click "Create"

## Step 2: Create Categories and Channels
Create the following categories and channels in this order:

### 🎫 TICKETS (Position 0)
- 📋 ticket-panel (text channel)

### 🏠 MAIN (Position 5)  
- 👋 welcome (text channel)
- 💬 general (text channel)
- 📢 announcements (text channel)
- 📋 rules (text channel)

### 🔧 STAFF (Position 6)
- 📊 staff-chat (text channel)
- 📋 mod-logs (text channel)
- 🎉 giveaway-log (text channel)
- 📈 level-log (text channel)

## Step 3: Create Roles
Create these roles in this order (higher position = more power):

1. 👑 Server Owner (Gold #FFD700) - Position 99
2. 🔧 Administrator (Red #FF6B6B) - Position 80
3. 🎫 Support Team (Teal #4ECDC4) - Position 70
4. 🤝 Middleman Team (Blue #45B7D1) - Position 69
5. 📊 Index Team (Green #96CEB4) - Position 68
6. 🎯 Giveaway Host (Plum #DDA0DD) - Position 60
7. ✅ Member (Gray #95A5A6) - Position 50
8. 🔒 Muted (Dark Gray #7F8C8D) - Position 10

## Step 4: Invite the Bot
1. Go to your Discord Developer Portal
2. Select your application
3. Go to "OAuth2" -> "URL Generator"
4. Select these scopes: bot, applications.commands
5. Select these bot permissions:
   - Administrator (recommended) or:
   - Manage Channels
   - Manage Messages
   - Manage Roles
   - Kick Members
   - Ban Members
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Add Reactions
   - Use External Emojis
6. Copy the generated URL and invite the bot to your new server

## Step 5: Update Bot Configuration
Update your .env file with the new server ID:
```env
GUILD_ID=YOUR_NEW_SERVER_ID_HERE
ALLOWED_GUILD_IDS=YOUR_NEW_SERVER_ID_HERE
```

## Step 6: Deploy Commands
Run: `npm run deploy:commands`

## Step 7: Test the Bot
1. Start the bot: `npm start`
2. Use /ticketpanel in the 📋 ticket-panel channel
3. Test the ticket system
4. Configure dashboard access if needed

## Important Notes:
- The bot will automatically create ticket categories when tickets are opened
- Make sure to assign appropriate roles to your staff members
- Configure the dashboard with your owner ID for owner-only access
- Test all commands and features before making the server public
