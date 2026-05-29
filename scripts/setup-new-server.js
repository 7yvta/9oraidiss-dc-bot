const fs = require('fs');
const path = require('path');

// Server setup configuration
const serverSetup = {
  server: {
    name: "Your New Server",
    description: "A Discord server with ticket system and moderation",
    region: "us-central"
  },
  
  categories: [
    {
      name: "🎫 TICKETS",
      position: 0,
      channels: [
        {
          name: "📋 ticket-panel",
          type: "text",
          topic: "Use /ticketpanel to create the ticket system panel",
          position: 0
        }
      ]
    },
    {
      name: "🎫 SUPPORT TICKETS",
      position: 1,
      channels: [] // Will be created dynamically by the bot
    },
    {
      name: "🤝 MIDDLEMAN TICKETS", 
      position: 2,
      channels: [] // Will be created dynamically by the bot
    },
    {
      name: "📊 INDEX TICKETS",
      position: 3,
      channels: [] // Will be created dynamically by the bot
    },
    {
      name: "📝 ROLE REQUESTS",
      position: 4,
      channels: [] // Will be created dynamically by the bot
    },
    {
      name: "🏠 MAIN",
      position: 5,
      channels: [
        {
          name: "👋 welcome",
          type: "text",
          topic: "Welcome messages and announcements",
          position: 0
        },
        {
          name: "💬 general",
          type: "text", 
          topic: "General chat and discussions",
          position: 1
        },
        {
          name: "📢 announcements",
          type: "text",
          topic: "Server announcements and updates",
          position: 2
        },
        {
          name: "📋 rules",
          type: "text",
          topic: "Server rules and guidelines",
          position: 3
        }
      ]
    },
    {
      name: "🔧 STAFF",
      position: 6,
      channels: [
        {
          name: "📊 staff-chat",
          type: "text",
          topic: "Staff discussions and coordination",
          position: 0
        },
        {
          name: "📋 mod-logs",
          type: "text",
          topic: "Moderation action logs",
          position: 1
        },
        {
          name: "🎉 giveaway-log",
          type: "text",
          topic: "Giveaway logs and tracking",
          position: 2
        },
        {
          name: "📈 level-log",
          type: "text",
          topic: "Level progression logs",
          position: 3
        }
      ]
    }
  ],

  roles: [
    {
      name: "👑 Server Owner",
      color: "#FFD700",
      position: 99,
      permissions: ["ADMINISTRATOR"],
      mentionable: false
    },
    {
      name: "🔧 Administrator", 
      color: "#FF6B6B",
      position: 90,
      permissions: ["MANAGE_GUILD", "MANAGE_CHANNELS", "MANAGE_ROLES", "KICK_MEMBERS", "BAN_MEMBERS"],
      mentionable: true
    },
    {
      name: "🎫 Support Team",
      color: "#4ECDC4",
      position: 80,
      permissions: ["MANAGE_CHANNELS", "MANAGE_MESSAGES"],
      mentionable: true
    },
    {
      name: "🤝 Middleman Team",
      color: "#45B7D1", 
      position: 79,
      permissions: ["MANAGE_CHANNELS", "MANAGE_MESSAGES"],
      mentionable: true
    },
    {
      name: "📊 Index Team",
      color: "#96CEB4",
      position: 78,
      permissions: ["MANAGE_CHANNELS", "MANAGE_MESSAGES"],
      mentionable: true
    },
    {
      name: "🎯 Giveaway Host",
      color: "#DDA0DD",
      position: 70,
      permissions: ["MANAGE_MESSAGES"],
      mentionable: true
    },
    {
      name: "✅ Member",
      color: "#95A5A6",
      position: 50,
      permissions: [],
      mentionable: false
    },
    {
      name: "🔒 Muted",
      color: "#7F8C8D",
      position: 10,
      permissions: [],
      mentionable: false
    }
  ]
};

// Generate setup instructions
function generateSetupInstructions() {
  return `
# New Server Setup Instructions

## Step 1: Create the Discord Server
1. Go to Discord and click the "+" icon to "Create My Own"
2. Choose "For me and my friends" or "Create a server"
3. Set server name: "${serverSetup.server.name}"
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
\`\`\`env
GUILD_ID=YOUR_NEW_SERVER_ID_HERE
ALLOWED_GUILD_IDS=YOUR_NEW_SERVER_ID_HERE
\`\`\`

## Step 6: Deploy Commands
Run: \`npm run deploy:commands\`

## Step 7: Test the Bot
1. Start the bot: \`npm start\`
2. Use /ticketpanel in the 📋 ticket-panel channel
3. Test the ticket system
4. Configure dashboard access if needed

## Important Notes:
- The bot will automatically create ticket categories when tickets are opened
- Make sure to assign appropriate roles to your staff members
- Configure the dashboard with your owner ID for owner-only access
- Test all commands and features before making the server public
`;
}

// Save setup instructions
const instructionsPath = path.join(__dirname, '..', 'NEW_SERVER_SETUP.md');
fs.writeFileSync(instructionsPath, generateSetupInstructions());

console.log('✅ Server setup configuration created!');
console.log('📋 Setup instructions saved to: NEW_SERVER_SETUP.md');
console.log('🔧 Follow the instructions to create your new server');
