const { SlashCommandBuilder } = require("discord.js");
const { getWarnings } = require("../../utils/warnStore");
const { buildResultEmbed } = require("../../utils/logger");

function truncateFieldValue(text, max = 1024) {
  const raw = String(text || "");
  if (raw.length <= max) {
    return raw;
  }
  return `${raw.slice(0, Math.max(0, max - 14))}\n... (trimmed)`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings for a user")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("User").setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user", true);

    const warnings = await getWarnings({
      guildId: interaction.guild.id,
      userId: targetUser.id
    });

    if (warnings.length === 0) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: `0 Warnings for ${targetUser.username} (${targetUser.id})`,
            color: 0x57f287,
            footer: "Moderation Log"
          })
        ]
      });
      return;
    }

    const lines = warnings.slice(-10).map((entry, index) => {
      const unix = Math.floor(new Date(entry.timestamp).getTime() / 1000);
      const when = Number.isFinite(unix) && unix > 0 ? `<t:${unix}:R>` : "unknown time";
      return `**Moderator:** <@${entry.moderatorId}>\n${entry.reason}\n${index + 1} - ${when}`;
    });

    const embed = buildResultEmbed({
      title: `${warnings.length} Warnings for ${targetUser.username} (${targetUser.id})`,
      color: 0xed4245,
      fields: [
        {
          name: "\u200b",
          value: truncateFieldValue(lines.join("\n\n"), 1024)
        }
      ],
      footer: "Moderation Log"
    });

    await interaction.reply({
      embeds: [embed]
    });
  }
};
