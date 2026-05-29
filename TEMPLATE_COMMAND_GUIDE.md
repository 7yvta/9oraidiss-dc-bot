# 🎯 /template Command - Instant Server Setup

## ⚡ What It Does

The `/template` command automatically creates a complete Discord server structure in seconds, including:
- ✅ **Categories** (3 main categories)
- ✅ **Channels** (9 essential channels)  
- ✅ **Roles** (8 pre-configured roles)

## 🚀 How to Use

### Step 1: Create a New Discord Server
1. Open Discord and click **"+"** to create a new server
2. Choose any name (e.g., "My New Server")
3. Create the server (it will be empty)

### Step 2: Invite the Bot
1. Go to your Discord Developer Portal
2. Generate an OAuth2 URL with **Administrator** permissions
3. Invite the bot to your new server

### Step 3: Run the Template Command
1. In your new server, type: `/template`
2. Set **confirm** to: `true`
3. Press Enter

```
/template confirm:true
```

## 🏗️ What Gets Created

### Categories & Channels:
- **🎫 TICKETS**
  - 📋 ticket-panel (for ticket system)

- **🏠 MAIN**  
  - 👋 welcome (welcome messages)
  - 💬 general (main chat)
  - 📢 announcements (server updates)
  - 📋 rules (server rules)

- **🔧 STAFF**
  - 📊 staff-chat (staff discussions)
  - 📋 mod-logs (moderation logs)
  - 🎉 giveaway-log (giveaway tracking)
  - 📈 level-log (level progression)

### Roles (Hierarchy):
1. **👑 Server Owner** (Gold) - Full admin
2. **🔧 Administrator** (Red) - Server management
3. **🎫 Support Team** (Teal) - Ticket support
4. **🤝 Middleman Team** (Blue) - Trade middleman
5. **📊 Index Team** (Green) - Base indexing
6. **🎯 Giveaway Host** (Plum) - Giveaway management
7. **✅ Member** (Gray) - Basic member role
8. **🔒 Muted** (Dark Gray) - Muted users

## 📋 After Setup

### Step 4: Configure the Bot
1. Use `/ticketpanel` in the 📋 ticket-panel channel
2. Assign appropriate roles to your staff members
3. Configure your .env file with the new channel/role IDs
4. Test all bot features

### Step 5: Customize (Optional)
- Edit channel topics and descriptions
- Modify role colors and permissions
- Add custom emojis or server icon
- Set up additional channels as needed

## 🔐 Security Features

- **Admin Only**: Only users with Administrator permissions can use `/template`
- **Confirmation Required**: Must set `confirm:true` to prevent accidental usage
- **Duplicate Detection**: Won't create channels/roles that already exist
- **Error Handling**: Shows detailed results and troubleshooting tips

## 🎉 Benefits

- **Instant Setup**: No manual channel/role creation needed
- **Perfect Structure**: Same setup as your current server
- **Consistent**: Every new server has identical organization
- **Time Saving**: Setup takes seconds instead of hours

## 🆘 Troubleshooting

**Command not found?**
- Run `npm run deploy:commands` to update slash commands

**Permission denied?**
- Ensure you have Administrator permissions in the server
- Check that the bot has Administrator permissions

**Some items failed to create?**
- Check if channels/roles already exist (command skips duplicates)
- Ensure bot has proper permissions
- Try running the command again

---

## 📝 Quick Example

1. Create new server "Gaming Community"
2. Invite bot with Admin permissions
3. Run: `/template confirm:true`
4. Wait 10-20 seconds
5. ✅ Your server is fully set up!

That's it! Your new server now has the exact same structure and functionality as your current server, ready to use in seconds! 🚀
