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
            "Systems active: support/service/index/role-request tickets (ticket management: /add, /remove, /transfer, claim/unclaim; restricted roles: /forceclaim), warns/mod actions, anti-nuke protection, auto-role + role triggers (automatic + /roleall, /rolefilter), leveling (/rank, /leaderboard), polls (/poll), backups (/backup create), ticket analytics (/ticketstats), trade confirmation (/confirmation), service info (/middleman), rules (/rules), and role manager (/managerole add|remove). Use /ticketpanel or /panel1 to post panels."
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};

