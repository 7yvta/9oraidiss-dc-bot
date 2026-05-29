require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildInvites]
});

client.once('ready', async () => {
  console.log('🔍 Checking invite settings...');
  
  const guild = client.guilds.cache.get('1479255758561480906');
  if (!guild) {
    console.error('❌ Server not found');
    process.exit(1);
  }

  try {
    // Fetch server data
    await guild.fetch();
    
    // Check current invites
    const invites = await guild.invites.fetch();
    console.log(`📋 Found ${invites.size} existing invites:`);
    
    for (const [code, invite] of invites) {
      console.log(`  • ${code}: ${invite.uses || 0} uses, ${invite.maxUses ? `max ${invite.maxUses}` : 'unlimited'}, ${invite.temporary ? 'temporary' : 'permanent'}, expires: ${invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'never'}`);
    }

    // Check server features and settings
    console.log('\n🏠 Server Settings:');
    console.log(`  • Verification Level: ${guild.verificationLevel} (0=None, 1=Low, 2=Medium, 3=High, 4=Very High)`);
    console.log(`  • Default Message Notifications: ${guild.defaultMessageNotifications}`);
    console.log(`  • Explicit Content Filter: ${guild.explicitContentFilter}`);
    console.log(`  • Member Count: ${guild.memberCount}`);
    console.log(`  • Boost Level: ${guild.premiumTier}`);

    // Check if server has community features
    const features = guild.features;
    console.log(`  • Server Features: ${features.join(', ') || 'None'}`);

    // Try to create a test invite
    console.log('\n🧪 Creating test invite...');
    try {
      const testInvite = await guild.invites.create({
        maxUses: 1,
        maxAge: 3600, // 1 hour
        reason: 'Test invite for diagnostics'
      });
      
      console.log(`✅ Test invite created successfully:`);
      console.log(`  • URL: ${testInvite.url}`);
      console.log(`  • Code: ${testInvite.code}`);
      console.log(`  • Expires: ${testInvite.expiresAt ? new Date(testInvite.expiresAt).toLocaleString() : 'never'}`);
      console.log(`  • Max uses: ${testInvite.maxUses || 'unlimited'}`);
      console.log(`  • Temporary: ${testInvite.temporary}`);
      
      // Immediately delete the test invite
      await testInvite.delete('Test complete');
      console.log('🗑️ Test invite deleted');
      
    } catch (error) {
      console.error('❌ Failed to create test invite:', error.message);
      
      if (error.message.includes('Missing Permissions')) {
        console.log('💡 Solution: Ensure bot has "Create Instant Invite" permission');
      }
      if (error.message.includes('maximum number of invites')) {
        console.log('💡 Solution: Delete some old invites or increase server boost level');
      }
    }

    console.log('\n🔧 Common Invite Issues & Solutions:');
    console.log('1. **Verification Level Too High** - Lower server verification level');
    console.log('2. **Max Invites Reached** - Delete old invites or boost server');
    console.log('3. **Bot Permissions** - Ensure bot has "Create Instant Invite" permission');
    console.log('4. **Account Age Restrictions** - Some servers require minimum account age');
    console.log('5. **Member Cap Reached** - Server might be full (check member count)');
    console.log('6. **Rate Limiting** - Wait a few minutes between creating invites');
    
  } catch (error) {
    console.error('❌ Error checking invite settings:', error.message);
  }
  
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
