const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  buildLogEmbed,
  buildResultEmbed,
  sendModLog
} = require("../../utils/logger");
const { canModerate } = require("../../utils/moderation");
const {
  clearRecentAction,
  markRecentAction
} = require("../../utils/actionDeduper");
const { sendUnmuteDM } = require("../../utils/dmHelper");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a member")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to unmute").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for unmute")
        .setRequired(true)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user", true);
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unmute Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Unmute reason is required." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unmute Failed",
            color: 0xed4245,
            fields: [
              { name: "Reason", value: "User not found in this server." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!canModerate(interaction.member, member)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unmute Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You cannot unmute this user due to role hierarchy."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!member.isCommunicationDisabled()) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unmute Failed",
            color: 0xed4245,
            fields: [
              { name: "Reason", value: "This user is not muted." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      markRecentAction("unmute", interaction.guild.id, targetUser.id);
      await member.timeout(null, `${reason} | By ${interaction.user.tag}`);
    } catch (error) {
      clearRecentAction("unmute", interaction.guild.id, targetUser.id);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unmute Failed",
            color: 0xed4245,
            fields: [
              { name: "Reason", value: "Failed to unmute user." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const dmSent = await sendUnmuteDM(
      interaction.client,
      targetUser,
      interaction.guild.name,
      interaction.user.tag
    );

    const embed = buildLogEmbed({
      title: "User Unmuted",
      color: 0x57f287,
      fields: [
        { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
        { name: "Moderator", value: `${interaction.user.username}` },
        { name: "Reason", value: reason },
        { name: "DM Sent", value: dmSent ? "Sent" : "Failed or blocked" }
      ]
    });

    await interaction.reply({
      embeds: [embed]
    });

    await sendModLog(interaction.guild, embed);
  }
};
