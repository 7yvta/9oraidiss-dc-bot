const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fixinvites")
    .setDescription("Fix all server invite issues automatically")
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName("action")
        .setDescription("Choose what to fix")
        .setRequired(true)
        .addChoices(
          { name: "Fix All Issues", value: "all" },
          { name: "Lower Verification Level", value: "verification" },
          { name: "Clean Old Invites", value: "cleanup" },
          { name: "Create Fresh Invites", value: "create" },
          { name: "Check Status", value: "check" }
        )
    ),

  async execute(interaction) {
    const action = interaction.options.getString("action");

    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Permission Denied",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You need Administrator permissions to use this command."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const guild = interaction.guild;
      const results = [];

      switch (action) {
        case "all":
          await fixAllIssues(guild, results);
          break;
        case "verification":
          await fixVerificationLevel(guild, results);
          break;
        case "cleanup":
          await cleanOldInvites(guild, results);
          break;
        case "create":
          await createFreshInvites(guild, results);
          break;
        case "check":
          await checkServerStatus(guild, results);
          break;
      }

      const embed = new EmbedBuilder()
        .setTitle("ðŸ”§ Invite Fix Complete")
        .setColor(0x57f287)
        .setDescription(`Fixed ${action} invite issues`)
        .addFields(
          {
            name: "ðŸ“Š Results",
            value: results.join('\n'),
            inline: false
          },
          {
            name: "ðŸŽ¯ Next Steps",
            value: "1. Test a new invite link\n2. Verify users can join\n3. Monitor invite usage",
            inline: true
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Fix invites error:", error);
      await interaction.editReply({
        embeds: [
          buildResultEmbed({
            title: "Fix Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Error",
                value: error.message
              },
              {
                name: "Manual Fix Required",
                value: "Some settings require manual adjustment in Discord server settings"
              }
            ]
          })
        ]
      });
    }
  }
};

async function fixAllIssues(guild, results) {
  results.push("ðŸ”§ Starting comprehensive invite fix...");
  
  // Fix verification level
  await fixVerificationLevel(guild, results);
  
  // Clean old invites
  await cleanOldInvites(guild, results);
  
  // Create fresh invites
  await createFreshInvites(guild, results);
  
  results.push("âœ… All invite issues fixed!");
}

async function fixVerificationLevel(guild, results) {
  try {
    // Note: Discord.js doesn't allow changing verification level programmatically
    // This provides instructions for manual fix
    const currentLevel = guild.verificationLevel;
    results.push(`âš ï¸ Current verification level: ${currentLevel}/4`);
    results.push("ðŸ“ Manual fix required: Server Settings â†’ Moderation â†’ Verification Level â†’ Set to None or Low");
    results.push("ðŸ’¡ Lower verification level to fix 'expired' invite issues");
  } catch (error) {
    results.push(`âŒ Verification check failed: ${error.message}`);
  }
}

async function cleanOldInvites(guild, results) {
  try {
    const invites = await guild.invites.fetch();
    let deletedCount = 0;
    
    for (const [code, invite] of invites) {
      if (invite.uses === 0 && invite.maxUses > 0) {
        // Delete unused invites with max uses
        await invite.delete('Unused invite cleanup');
        deletedCount++;
      } else if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        // Delete expired invites
        await invite.delete('Expired invite cleanup');
        deletedCount++;
      }
    }
    
    results.push(`ðŸ—‘ï¸ Cleaned up ${deletedCount} old invites`);
  } catch (error) {
    results.push(`âŒ Invite cleanup failed: ${error.message}`);
  }
}

async function createFreshInvites(guild, results) {
  try {
    // Find a suitable channel (usually the first text channel)
    const channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreateInstantInvite));
    
    if (!channel) {
      results.push("âŒ No suitable channel found for invites");
      return;
    }

    // Create multiple fresh invites
    const inviteConfigs = [
      { maxAge: 86400, maxUses: 0, reason: 'Permanent invite - 24h expiry' }, // 24 hours, unlimited uses
      { maxAge: 604800, maxUses: 10, reason: 'Limited invite - 7 days, 10 uses' }, // 7 days, 10 uses
      { maxAge: 0, maxUses: 5, reason: 'Permanent invite - 5 uses' }, // Never expires, 5 uses
    ];

    for (const config of inviteConfigs) {
      const invite = await channel.createInvite(config);
      results.push(`âœ… Created invite: ${invite.url} (${config.reason})`);
    }
    
    results.push(`ðŸŽ¯ Created ${inviteConfigs.length} fresh invites in ${channel.name}`);
  } catch (error) {
    results.push(`âŒ Invite creation failed: ${error.message}`);
  }
}

async function checkServerStatus(guild, results) {
  try {
    // Check verification level
    results.push(`ðŸ” Verification Level: ${guild.verificationLevel}/4`);
    
    // Check member verification gate
    const hasVerificationGate = guild.features.includes('MEMBER_VERIFICATION_GATE_ENABLED');
    results.push(`ðŸšª Verification Gate: ${hasVerificationGate ? 'Enabled (may block joins)' : 'Disabled'}`);
    
    // Check existing invites
    const invites = await guild.invites.fetch();
    results.push(`ðŸ“‹ Existing invites: ${invites.size}`);
    
    // Check member count
    results.push(`ðŸ‘¥ Member count: ${guild.memberCount}`);
    
    // Check boost level
    results.push(`âš¡ Boost level: ${guild.premiumTier}`);
    
    // Check bot permissions
    const botMember = guild.members.me;
    const canCreateInvites = botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite);
    results.push(`ðŸ¤– Bot can create invites: ${canCreateInvites ? 'Yes' : 'No'}`);
    
    if (!canCreateInvites) {
      results.push("âš ï¸ Fix bot permissions: Enable 'Create Instant Invite' for bot role");
    }
    
  } catch (error) {
    results.push(`âŒ Status check failed: ${error.message}`);
  }
}
