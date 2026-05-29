require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  console.log('🔧 Auto-fixing server invite issues...');
  
  const guild = client.guilds.cache.get('1479255758561480906');
  if (!guild) {
    console.error('❌ Server not found');
    process.exit(1);
  }

  try {
    await guild.fetch();
    console.log('\n📊 Current Server Status:');
    console.log(`  • Verification Level: ${guild.verificationLevel}/4`);
    console.log(`  • Member Count: ${guild.memberCount}`);
    console.log(`  • Boost Level: ${guild.premiumTier}`);
    
    // Check and clean invites
    console.log('\n🧹 Cleaning old invites...');
    const invites = await guild.invites.fetch();
    let cleanedCount = 0;
    
    for (const [code, invite] of invites) {
      if (invite.uses === 0 && invite.maxUses > 0) {
        await invite.delete('Auto-cleanup: Unused invite');
        cleanedCount++;
        console.log(`  🗑️ Deleted unused invite: ${code}`);
      } else if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        await invite.delete('Auto-cleanup: Expired invite');
        cleanedCount++;
        console.log(`  🗑️ Deleted expired invite: ${code}`);
      }
    }
    
    console.log(`  ✅ Cleaned ${cleanedCount} old invites`);
    
    // Create fresh invites
    console.log('\n🎯 Creating fresh invites...');
    const channel = guild.channels.cache.find(c => 
      c.type === 0 && 
      c.permissionsFor(guild.members.me).has(0x0000000000000800) // Create Instant Invite permission
    );
    
    if (!channel) {
      console.log('  ❌ No suitable channel found for invites');
    } else {
      const inviteConfigs = [
        { maxAge: 86400, maxUses: 0, reason: 'Permanent invite - 24h expiry' },
        { maxAge: 604800, maxUses: 10, reason: 'Limited invite - 7 days, 10 uses' },
        { maxAge: 0, maxUses: 5, reason: 'Permanent invite - 5 uses' },
      ];
      
      for (const config of inviteConfigs) {
        const invite = await channel.createInvite(config);
        console.log(`  ✅ Created: ${invite.url}`);
      }
      
      console.log(`  🎯 Created ${inviteConfigs.length} fresh invites in ${channel.name}`);
    }
    
    console.log('\n🔧 Manual Fixes Required:');
    console.log('  1. Go to Server Settings → Moderation');
    console.log('  2. Set Verification Level to NONE (0) or LOW (1)');
    console.log('  3. Go to Server Settings → Membership Screening');
    console.log('  4. DISABLE verification requirements');
    console.log('  5. Ensure bot role has "Create Instant Invite" permission');
    
    console.log('\n✅ Auto-fix complete! Manual fixes still needed for verification settings.');
    
  } catch (error) {
    console.error('❌ Auto-fix error:', error.message);
  }
  
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
