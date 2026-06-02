const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { canHandleTicket } = require("../../utils/accessControl");
const { resolveTicketContext } = require("../../utils/ticketMeta");
const { buildResultEmbed } = require("../../utils/logger");
const { buildTicketEventEmbed } = require("../../utils/ticketUi");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a user from the current ticket")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to remove from this ticket").setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.channel;
    const context = resolveTicketContext(channel);
    if (!channel || !context?.ticketType) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Not A Ticket",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Use this command inside a ticket channel." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    if (context.ownerId && targetUser.id === context.ownerId) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Remove Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "You cannot remove the ticket owner." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (context.claimedBy && targetUser.id === context.claimedBy) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Remove Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "You cannot remove the ticket claimer." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (targetUser.id === interaction.client.user.id) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Remove Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "That user cannot be removed." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const isSupport = canHandleTicket(interaction.member, context.ticketType);

    if (!isSupport) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Not Allowed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "Only the assigned staff team can remove users."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await channel.permissionOverwrites.edit(
        targetUser.id,
        {
          ViewChannel: false,
          SendMessages: false,
          ReadMessageHistory: false,
          AttachFiles: false
        },
        {
          reason: `Ticket member removed by ${interaction.user.tag}`
        }
      );
    } catch (error) {
      console.error("Ticket /remove error:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Remove Failed",
            color: 0xed4245,
            fields: [
              { name: "Reason", value: "I could not update channel permissions for that user." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await channel
      .send({
        embeds: [
          buildTicketEventEmbed({
            ticketType: context.ticketType,
            title: "Remove",
            description: `${targetUser} has been removed from ${channel}.`
          })
        ]
      })
      .catch(() => null);

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "User Removed",
          color: 0x57f287,
          fields: [
            { name: "Ticket", value: `${channel}` },
            { name: "User", value: `${targetUser} (${targetUser.id})` }
          ],
          footer: "Vault Ticket Service"
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};
