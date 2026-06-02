const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

const APPEAL_URL = `${config.publicBaseUrl}/appeal`;
const AUTOMOD_BADGE_TARGET_RULES = 100;

async function getAutoModBadgeStats(client, currentGuildId) {
  const guilds = Array.from(client.guilds.cache.values());
  const botId = String(client.user?.id || "");
  const counts = await Promise.all(
    guilds.map(async (guild) => {
      try {
        const rules = await guild.autoModerationRules.fetch();
        const total = rules.size;
        const byBot = rules.filter(
          (rule) => String(rule.creatorId || "") === botId
        ).size;
        return { guildId: guild.id, guildName: guild.name, count: total, byBot };
      } catch {
        return { guildId: guild.id, guildName: guild.name, count: null, byBot: null };
      }
    })
  );

  const knownCounts = counts.filter((entry) => Number.isFinite(entry.count));
  const totalRules = knownCounts.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
  const totalBotRules = knownCounts.reduce(
    (sum, entry) => sum + Number(entry.byBot || 0),
    0
  );
  const currentGuild = counts.find((entry) => String(entry.guildId) === String(currentGuildId));
  const currentGuildRules = Number.isFinite(currentGuild?.count)
    ? Number(currentGuild.count)
    : null;
  const currentGuildBotRules = Number.isFinite(currentGuild?.byBot)
    ? Number(currentGuild.byBot)
    : null;

  return {
    totalRules,
    totalBotRules,
    remaining: Math.max(0, AUTOMOD_BADGE_TARGET_RULES - totalRules),
    remainingBotRules: Math.max(0, AUTOMOD_BADGE_TARGET_RULES - totalBotRules),
    guildsCounted: knownCounts.length,
    totalGuilds: counts.length,
    currentGuildName: currentGuild?.guildName || "Unknown",
    currentGuildRules,
    currentGuildBotRules
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get support and key links for this bot")
    .addStringOption((option) =>
      option
        .setName("topic")
        .setDescription("Support topic")
        .setRequired(false)
        .addChoices(
          { name: "Commands", value: "commands" },
          { name: "Moderation", value: "moderation" },
          { name: "Tickets", value: "tickets" },
          { name: "DM Notifications", value: "dm" },
          { name: "Auto Mode", value: "auto" },
          { name: "Badge", value: "badge" }
        )
    ),

  async execute(interaction) {
    const topic = interaction.options.getString("topic");

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTimestamp()
      .setFooter({ text: "Need more help? Contact server administrators." });

    if (!topic) {
      embed
        .setTitle("Bot Support")
        .setDescription("Select a topic with `/support topic:<name>` for focused help.")
        .addFields(
          {
            name: "Main Links",
            value: `Appeal: ${APPEAL_URL}`
          },
          {
            name: "Quick Commands",
            value: "`/help`, `/commands`, `/apply`, `/roleapply`, `/ticketstats`, `/terms`"
          },
          {
            name: "Badge",
            value: "Use `/support topic:badge` for live AutoMod badge progress."
          }
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (topic === "commands") {
      embed
        .setTitle("Commands")
        .setDescription("Core command groups in this bot.")
        .addFields(
          {
            name: "Moderation",
            value:
              "`/manageban`, `/kick`, `/warn`, `/warnings`, `/clearwarnings`, `/timeout`, `/unmute`, `/unban`, `/purge`, `/managerole`"
          },
          {
            name: "Tickets",
            value:
              "`/add`, `/remove`, `/transfer`, `/forceclaim`, `/unclaim`, `/ticketstats`"
          },
          {
            name: "Utility",
            value:
              "`/help`, `/support`, `/apply`, `/roleapply`, `/reviewapps`, `/reviewappeals`, `/appeal`, `/invites`, `/rank`, `/leaderboard`, `/middleman`, `/rules`, `/confirmation`"
          }
        );
    } else if (topic === "moderation") {
      embed
        .setTitle("Moderation")
        .setDescription("Moderation commands + user notification flow.")
        .addFields(
          {
            name: "User DMs On Actions",
            value:
              "Ban, kick, warn, timeout, unmute, unban, clearwarnings, and role changes send user DMs when possible."
          },
          {
            name: "Appeal Link",
            value: APPEAL_URL
          }
        );
    } else if (topic === "tickets") {
      embed
        .setTitle("Tickets")
        .setDescription("Support, middleman, index, role request, report, and host giveaway ticket flows.")
        .addFields(
          {
            name: "Panels",
            value: "`/ticketpanel` for main panel, `/panel1` for role request panel."
          },
          {
            name: "Middleman Team",
            value: "Uses your configured middleman team role for claim/transfer/unclaim."
          }
        );
    } else if (topic === "dm") {
      embed
        .setTitle("DM Notifications")
        .setDescription("Users receive DMs for moderation actions and application decisions.")
        .addFields(
          {
            name: "Notes",
            value:
              "If a user has DMs disabled, action still succeeds and logging continues."
          },
          { name: "Appeal Link In Ban DM", value: APPEAL_URL }
        );
    } else if (topic === "auto") {
      embed
        .setTitle("Auto Mode")
        .setDescription("Automatic moderation and role trigger behavior.")
        .addFields(
          {
            name: "Auto Moderation",
            value:
              "Automatic moderation runs from the current server configuration."
          },
          {
            name: "Auto Role Triggers",
            value:
              "Configured trigger-role mappings run automatically on member join and role updates."
          }
        );
    } else if (topic === "badge") {
      const stats = await getAutoModBadgeStats(interaction.client, interaction.guildId);
      embed
        .setTitle("AutoMod Badge Progress")
        .setDescription(
          "Badge target is 100 active AutoMod rules across all servers where the bot is in."
        )
        .addFields(
          {
            name: "Current Server",
            value:
              stats.currentGuildRules == null
                ? `${stats.currentGuildName}: unavailable`
                : `${stats.currentGuildName}: ${stats.currentGuildRules} total / ${stats.currentGuildBotRules ?? 0} by this bot`
          },
          {
            name: "Total Rules (All)",
            value: `${stats.totalRules}/${AUTOMOD_BADGE_TARGET_RULES} rules`
          },
          {
            name: "Total Rules (By This Bot)",
            value: `${stats.totalBotRules}/${AUTOMOD_BADGE_TARGET_RULES} rules`
          },
          {
            name: "Remaining For Badge",
            value: `${stats.remainingBotRules} bot-owned rules`
          },
          {
            name: "Servers Counted",
            value: `${stats.guildsCounted}/${stats.totalGuilds}`
          },
          {
            name: "Tip",
            value: "Server administrators can review AutoMod rules in Discord server settings."
          }
        );
    }

    await interaction.reply({ embeds: [embed] });
  }
};


