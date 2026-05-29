const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

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
    .setName("badge")
    .setDescription("Show bot badge progress"),

  async execute(interaction) {
    const stats = await getAutoModBadgeStats(interaction.client, interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("AutoMod Badge Progress")
      .setDescription(
        "Badge target is 100 active AutoMod rules across all servers where this bot is present."
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
          name: "Total Rules (All Servers)",
          value: `${stats.totalRules}/${AUTOMOD_BADGE_TARGET_RULES}`
        },
        {
          name: "Total Rules (By This Bot)",
          value: `${stats.totalBotRules}/${AUTOMOD_BADGE_TARGET_RULES}`
        },
        {
          name: "Remaining (By This Bot)",
          value: `${stats.remainingBotRules}`
        },
        {
          name: "Servers Counted",
          value: `${stats.guildsCounted}/${stats.totalGuilds}`
        }
      )
      .setFooter({ text: "Review AutoMod rules in Discord server settings." })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
