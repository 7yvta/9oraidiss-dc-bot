const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const config = require("../../config");
const { getTicketMetaFromChannel, buildTicketTopic } = require("../../utils/ticketMeta");
const { buildResultEmbed } = require("../../utils/logger");
const { getTicketTeamRoleIds } = require("../../utils/tickets");
const { buildTicketEventEmbed, updateTicketControlMessage } = require("../../utils/ticketUi");

function memberHasRole(member, roleId) {
  if (!member || !roleId) {
    return false;
  }

  if (member.roles?.cache?.has) {
    return member.roles.cache.has(roleId);
  }

  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId);
  }

  return false;
}

function hasAnyRole(member, roleIds) {
  if (!member || !Array.isArray(roleIds) || roleIds.length === 0) {
    return false;
  }
  return roleIds.some((roleId) => memberHasRole(member, roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("forceclaim")
    .setDescription("Force-claim the current ticket (limited staff roles)")
    .setDMPermission(false),

  async execute(interaction) {
    const channel = interaction.channel;
    const meta = getTicketMetaFromChannel(channel);
    const forceClaimRoleIds =
      Array.isArray(config.ticketForceClaimRoleIds) &&
      config.ticketForceClaimRoleIds.length > 0
        ? config.ticketForceClaimRoleIds
        : ["1479263062065152111", "1479263536797454489"];

    if (!channel || !meta?.ownerId || !meta.ticketType) {
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

    if (!hasAnyRole(interaction.member, forceClaimRoleIds)) {
      const mentionText = forceClaimRoleIds.map((roleId) => `<@&${roleId}>`).join(" or ");
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Not Allowed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: `Only force-claim roles can use this command: ${mentionText}.`
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (meta.claimedBy === interaction.user.id) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Already Claimed",
            color: 0x5865f2,
            fields: [{ name: "Status", value: "This ticket is already claimed by you." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const oldClaimedBy = meta.claimedBy;
    const teamRoleIds = getTicketTeamRoleIds(meta.ticketType, interaction.guild.id);

    try {
      await channel.setTopic(
        buildTicketTopic({
          ownerId: meta.ownerId,
          ticketType: meta.ticketType,
          claimedBy: interaction.user.id
        }),
        "Ticket force-claimed"
      );
    } catch (error) {
      console.error("Ticket /forceclaim setTopic error:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Force-Claim Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I could not update the ticket topic. Make sure I have Manage Channels."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    for (const roleId of teamRoleIds) {
      await channel.permissionOverwrites
        .edit(
          roleId,
          {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true
          },
          { reason: "Ticket force-claimed: team roles switched to watch-only" }
        )
        .catch(() => null);
    }

    if (oldClaimedBy && oldClaimedBy !== interaction.user.id) {
      await channel.permissionOverwrites
        .delete(oldClaimedBy, { reason: "Ticket force-claimed: remove previous claimer override" })
        .catch(() => null);
    }

    await channel.permissionOverwrites
      .edit(
        interaction.user.id,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          ManageMessages: true
        },
        { reason: "Ticket force-claim: claimer gets active response permissions" }
      )
      .catch(() => null);

    await updateTicketControlMessage(channel, { ticketType: meta.ticketType, claimed: true }).catch(() => null);

    await channel
      .send({
        embeds: [
          buildTicketEventEmbed({
            ticketType: meta.ticketType,
            title: "Ticket Claimed",
            description: `${interaction.user} force-claimed this ticket.`
          })
        ]
      })
      .catch(() => null);

    await interaction.reply({
      content: `Ticket force-claimed by ${interaction.user}.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
