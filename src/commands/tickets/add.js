const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { canHandleTicket } = require("../../utils/accessControl");
const { resolveTicketContext } = require("../../utils/ticketMeta");
const { buildResultEmbed } = require("../../utils/logger");
const { buildTicketEventEmbed } = require("../../utils/ticketUi");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a user to the current ticket")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to add to this ticket").setRequired(true)
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
    if (targetUser.id === interaction.client.user.id) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Add Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "That user cannot be added." }]
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
                value: "Only the assigned staff team can add users."
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
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        },
        { reason: `Ticket member added by ${interaction.user.tag}` }
      );
    } catch (error) {
      console.error("Ticket /add error:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Add Failed",
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
            title: "Add",
            description: `${targetUser} has been added to ${channel}.`
          })
        ]
      })
      .catch(() => null);

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "User Added",
          color: 0x57f287,
          fields: [
            { name: "Ticket", value: `${channel}` },
            { name: "User", value: `${targetUser} (${targetUser.id})` }
          ],
          footer: "Ticket System"
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};
