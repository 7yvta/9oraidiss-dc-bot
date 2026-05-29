# Complete New Server Setup Guide

## 🚀 Quick Start Summary

I've created everything you need to set up a new Discord server with your bot. Here's what you have:

### ✅ Created Files:
- `NEW_SERVER_SETUP.md` - Step-by-step server creation guide
- `scripts/setup-new-server.js` - Server configuration generator
- `scripts/generate-invite-url.js` - Bot invitation URL generator

---

## 📋 Step-by-Step Instructions

### Step 1: Create the Discord Server
1. Open Discord and click the **"+"** icon (left sidebar)
2. Choose **"Create My Own"** 
3. Select **"For me and my friends"** or **"Create a server"**
4. Set server name: **"Your New Server"** (or your preferred name)
5. Upload a server icon (optional)
6. Click **"Create"**

### Step 2: Create Categories and Channels

#### 🎫 TICKETS Category
- **📋 ticket-panel** (text channel)
  - Topic: `Use /ticketpanel to create the ticket system panel`

#### 🏠 MAIN Category  
- **👋 welcome** (text channel)
  - Topic: `Welcome messages and announcements`
- **💬 general** (text channel)
  - Topic: `General chat and discussions`
- **📢 announcements** (text channel)
  - Topic: `Server announcements and updates`
- **📋 rules** (text channel)
  - Topic: `Server rules and guidelines`

#### 🔧 STAFF Category
- **📊 staff-chat** (text channel)
  - Topic: `Staff discussions and coordination`
- **📋 mod-logs** (text channel)
  - Topic: `Moderation action logs`
- **🎉 giveaway-log** (text channel)
  - Topic: `Giveaway logs and tracking`
- **📈 level-log** (text channel)
  - Topic: `Level progression logs`

### Step 3: Create Roles (in this order - higher position = more power)

1. **👑 Server Owner** (Gold #FFD700) - Position 99
2. **🔧 Administrator** (Red #FF6B6B) - Position 80  
3. **🎫 Support Team** (Teal #4ECDC4) - Position 70
4. **🤝 Middleman Team** (Blue #45B7D1) - Position 69
5. **📊 Index Team** (Green #96CEB4) - Position 68
6. **🎯 Giveaway Host** (Plum #DDA0DD) - Position 60
7. **✅ Member** (Gray #95A5A6) - Position 50
8. **🔒 Muted** (Dark Gray #7F8C8D) - Position 10

### Step 4: Invite the Bot

#### Method A: Use Your Existing Bot
1. Go to your Discord Developer Portal: https://discord.com/developers/applications
2. Select your bot application
3. Go to **"OAuth2"** → **"URL Generator"**
4. Select these scopes:
   - ✅ **bot**
   - ✅ **applications.commands**
5. Select these bot permissions:
   - ✅ **Administrator** (recommended - easiest)
   - OR select specific permissions:
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
6. Copy the generated URL
7. Paste in browser, select your new server, click "Authorize"

#### Method B: Generate Invite URL (if you have CLIENT_ID in .env)
Run: `node scripts/generate-invite-url.js`

### Step 5: Update Bot Configuration

1. **Get your new Server ID:**
   - In Discord, go to User Settings → Advanced
   - Enable **Developer Mode**
   - Right-click your new server icon → **"Copy Server ID"**

2. **Update your .env file:**
   ```env
   GUILD_ID=YOUR_NEW_SERVER_ID_HERE
   ALLOWED_GUILD_IDS=YOUR_NEW_SERVER_ID_HERE
   
   # Update these channel IDs with your new server's channel IDs
   MOD_LOG_CHANNEL_ID=YOUR_MOD_LOG_CHANNEL_ID
   LEVEL_LOG_CHANNEL_ID=YOUR_LEVEL_LOG_CHANNEL_ID  
   GIVEAWAY_LOG_CHANNEL_ID=YOUR_GIVEAWAY_LOG_CHANNEL_ID
   WELCOME_CHANNEL_ID=YOUR_WELCOME_CHANNEL_ID
   RULES_CHANNEL_ID=YOUR_RULES_CHANNEL_ID
   TICKET_PANEL_CHANNEL_ID=YOUR_TICKET_PANEL_CHANNEL_ID
   
   # Update role IDs
   SUPPORT_ROLE_ID=YOUR_SUPPORT_ROLE_ID
   MEMBER_ROLE_ID=YOUR_MEMBER_ROLE_ID
   GIVEAWAY_HOST_ROLE_ID=YOUR_GIVEAWAY_HOST_ROLE_ID
   
   # Ticket category IDs (will be created automatically)
   SUPPORT_TICKET_CATEGORY_ID=
   MIDDLEMAN_TICKET_CATEGORY_ID=
   INDEX_TICKET_CATEGORY_ID=
   ROLE_REQUEST_TICKET_CATEGORY_ID=
   
   # Team role IDs
   SUPPORT_TEAM_ROLE_IDS=YOUR_SUPPORT_ROLE_ID
   MIDDLEMAN_TEAM_ROLE_IDS=YOUR_MIDDLEMAN_ROLE_ID
   INDEX_TEAM_ROLE_IDS=YOUR_INDEX_ROLE_ID
   ROLE_REQUEST_TEAM_ROLE_IDS=YOUR_ROLE_REQUEST_ROLE_ID
   ```

### Step 6: Deploy Commands to New Server
```bash
npm run deploy:commands
```

### Step 7: Start the Bot
```bash
npm start
```

### Step 8: Test Everything

1. **Test the ticket system:**
   - Go to 📋 ticket-panel channel
   - Use `/ticketpanel` command
   - Test creating different ticket types

2. **Test moderation commands:**
   - Test ban, kick, warn commands (if you have appropriate roles)

3. **Test the dashboard:**
   - Visit `https://dc-ticket-bot-production.up.railway.app`
   - Login with your dashboard credentials
   - Verify owner-only access works

4. **Test other features:**
   - Giveaway system
   - Level system
   - Welcome messages

---

## 🔧 Configuration Template

Here's a template for your new server's .env configuration:

```env
# Bot Configuration
TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=YOUR_NEW_SERVER_ID
ALLOWED_GUILD_IDS=YOUR_NEW_SERVER_ID
BOT_OWNER_ID=YOUR_DISCORD_USER_ID

# Dashboard Configuration  
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=change_me
DASHBOARD_SESSION_SECRET=your-secret-key-here

# Channel IDs (replace with actual IDs from your new server)
MOD_LOG_CHANNEL_ID=
LEVEL_LOG_CHANNEL_ID=
GIVEAWAY_LOG_CHANNEL_ID=
WELCOME_CHANNEL_ID=
RULES_CHANNEL_ID=
TICKET_PANEL_CHANNEL_ID=

# Role IDs (replace with actual IDs from your new server)
SUPPORT_ROLE_ID=
MEMBER_ROLE_ID=
GIVEAWAY_HOST_ROLE_ID=

# Team Role IDs
SUPPORT_TEAM_ROLE_IDS=
MIDDLEMAN_TEAM_ROLE_IDS=
INDEX_TEAM_ROLE_IDS=
ROLE_REQUEST_TEAM_ROLE_IDS=

# Ticket Categories (will be created automatically)
SUPPORT_TICKET_CATEGORY_ID=
MIDDLEMAN_TICKET_CATEGORY_ID=
INDEX_TICKET_CATEGORY_ID=
ROLE_REQUEST_TICKET_CATEGORY_ID=

# Features
WELCOME_ENABLED=true
AUTOMOD_ENABLED=true
LEVEL_CURVE=linear
OWNER_ONLY_MODE=false
```

---

## 🎯 Quick Checklist

- [ ] Create Discord server
- [ ] Set up categories and channels  
- [ ] Create roles with proper hierarchy
- [ ] Invite bot with correct permissions
- [ ] Update .env with new server IDs
- [ ] Deploy commands
- [ ] Start bot and test features
- [ ] Configure dashboard access
- [ ] Test ticket system
- [ ] Test moderation commands
- [ ] Verify all features work

---

## 🆘 Troubleshooting

**Commands not working?**
- Check if bot has correct permissions
- Verify GUILD_ID in .env matches new server
- Run `npm run deploy:commands` again

**Dashboard not accessible?**
- Ensure DASHBOARD_ENABLED=true
- Check port 3000 isn't blocked
- Verify dashboard credentials in .env

**Tickets not creating?**
- Check category IDs in configuration
- Verify bot has Manage Channels permission
- Check team role IDs are correct

---

## 🎉 You're Ready!

Once you complete these steps, you'll have a fully functional Discord server with:
- ✅ Complete ticket system (Support, Middleman, Index, Role requests)
- ✅ Moderation commands and logging
- ✅ Giveaway system
- ✅ Level progression system  
- ✅ Owner-only dashboard
- ✅ Automated welcome messages
- ✅ Anti-spam protection

Your new server will be a perfect copy of your current setup with all the same features!
