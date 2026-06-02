const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show available systems in this bot"),

  async execute(interaction) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Bot Systems",
          color: 0x5865f2,
          description:
            "Systems active: support/middleman/index/role-request/report/host tickets, ticket management (/add, /remove, /transfer, /unclaim, /forceclaim), warnings and moderation, anti-nuke protection, auto-role triggers, leveling (/rank, /leaderboard), economy, polls (/poll), trade confirmation (/confirmation), middleman info (/middleman), rules (/rules), vouches, and role management (/managerole add|remove). Setup/debug commands are hidden from normal command help."
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};


