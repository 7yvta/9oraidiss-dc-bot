const { SlashCommandBuilder } = require("discord.js");
const {
  getInviterForUser,
  getInviteLeaderboard,
  getInviteStats
} = require("../../utils/inviteStore");
const { buildResultEmbed } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Invite tracker commands")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("Show invite stats for a user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("invitedby")
        .setDescription("Show who invited a member")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show top inviters")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("How many users to show")
            .setMinValue(3)
            .setMaxValue(20)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const action = interaction.options.getSubcommand(true);

    if (action === "stats") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const stats = await getInviteStats({
        guildId: interaction.guild.id,
        userId: targetUser.id
      });

      const embed = buildResultEmbed({
        title: "Invite Stats",
        color: 0x5865f2,
        fields: [
          { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
          { name: "Total Joins", value: `${stats.joins}` },
          { name: "Still In Server", value: `${stats.active}` },
          { name: "Left Server", value: `${stats.left}` }
        ],
        footer: "Invite Tracker"
      });

      await interaction.reply({
        embeds: [embed]
      });
      return;
    }

    if (action === "invitedby") {
      const targetUser = interaction.options.getUser("user", true);
      const inviteRecord = await getInviterForUser({
        guildId: interaction.guild.id,
        userId: targetUser.id
      });

      const embed = buildResultEmbed({
        title: "Invite Source",
        color: 0xfaa61a,
        fields: [
          { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
          {
            name: "Invited By",
            value: inviteRecord?.inviterId
              ? `<@${inviteRecord.inviterId}>`
              : "No tracker data"
          },
          {
            name: "Invite Code",
            value: inviteRecord?.inviteCode
              ? `\`${inviteRecord.inviteCode}\``
              : "Unknown"
          }
        ],
        footer: "Invite Tracker"
      });

      await interaction.reply({
        embeds: [embed]
      });
      return;
    }

    const limit = interaction.options.getInteger("limit") || 10;
    const leaderboard = await getInviteLeaderboard({
      guildId: interaction.guild.id,
      limit
    });

    if (leaderboard.length === 0) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Invite Leaderboard",
            color: 0x5865f2,
            fields: [{ name: "Status", value: "No invite data yet." }],
            footer: "Invite Tracker"
          })
        ]
      });
      return;
    }

    const lines = leaderboard.map(
      (entry, index) =>
        `${index + 1}. <@${entry.userId}> - ${entry.joins} joins (${entry.active} active)`
    );

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Invite Leaderboard",
          color: 0x57f287,
          fields: [{ name: "Top Inviters", value: lines.join("\n").slice(0, 1024) }],
          footer: "Invite Tracker"
        })
      ]
    });
  }
};
