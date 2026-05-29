const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { canHandleTicket } = require("../../utils/accessControl");
const { resolveTicketContext, buildTicketTopic } = require("../../utils/ticketMeta");
const { buildResultEmbed } = require("../../utils/logger");
const { getTicketTeamRoleIds } = require("../../utils/tickets");
const { buildTicketEventEmbed, updateTicketControlMessage } = require("../../utils/ticketUi");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unclaim")
    .setDescription("Unclaim the current ticket")
    .setDMPermission(false),

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

    const { ownerId, ticketType, claimedBy } = context;

    if (!claimedBy) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Not Claimed",
            color: 0x5865f2,
            fields: [{ name: "Status", value: "This ticket is not currently claimed." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const isSupport = canHandleTicket(interaction.member, ticketType);
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
    const isClaimer = claimedBy === interaction.user.id;

    if (!isClaimer && !isSupport && !isAdmin) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Not Allowed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "Only the ticket claimer or assigned staff can unclaim this ticket."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const teamRoleIds = getTicketTeamRoleIds(ticketType, interaction.guild.id);

    await channel.setTopic(
      buildTicketTopic({
        ownerId,
        ticketType,
        claimedBy: null
      }),
      "Ticket unclaimed"
    );

    for (const roleId of teamRoleIds) {
      await channel.permissionOverwrites
        .edit(
          roleId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            ManageMessages: true
          },
          { reason: "Ticket unclaimed: staff roles restored" }
        )
        .catch(() => null);
    }

    await channel.permissionOverwrites
      .delete(claimedBy, { reason: "Ticket unclaimed: remove claimer override" })
      .catch(() => null);

    await updateTicketControlMessage(channel, { ticketType, claimed: false }).catch(() => null);

    await channel
      .send({
        embeds: [
          buildTicketEventEmbed({
            ticketType,
            title: "Unclaimed Ticket",
            description: "All assigned staff team members can now respond to the ticket."
          })
        ]
      })
      .catch(() => null);

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Ticket Unclaimed",
          color: 0x57f287,
          fields: [{ name: "Channel", value: `${channel}` }]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};
