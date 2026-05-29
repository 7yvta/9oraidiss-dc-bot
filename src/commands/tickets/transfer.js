const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");
const { canHandleTicket } = require("../../utils/accessControl");
const { resolveTicketContext, buildTicketTopic } = require("../../utils/ticketMeta");
const { buildResultEmbed, buildLogEmbed, sendTicketLog } = require("../../utils/logger");
const { getTicketTeamRoleIds } = require("../../utils/tickets");
const { buildTicketEventEmbed } = require("../../utils/ticketUi");

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
    .setName("transfer")
    .setDescription("Transfer ticket ownership to another member")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member who will become the new ticket owner")
        .setRequired(true)
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

    const { ownerId, ticketType, claimedBy, source } = context;
    const targetUser = interaction.options.getUser("user", true);

    if (targetUser.id === interaction.client.user.id || targetUser.bot) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Transfer Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "You must transfer the ticket to a member user." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (ownerId && targetUser.id === ownerId) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Transfer Not Needed",
            color: 0x5865f2,
            fields: [{ name: "Status", value: `${targetUser} is already the ticket owner.` }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const isOwner = ownerId === interaction.user.id;
    const isSupport = canHandleTicket(interaction.member, ticketType);
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);

    if (!isOwner && !isSupport && !isAdmin) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Not Allowed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "Only the ticket owner or assigned staff can transfer this ticket."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetMember =
      interaction.options.getMember("user") ||
      (await interaction.guild.members.fetch(targetUser.id).catch(() => null));
    if (!targetMember) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Transfer Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I could not find that user in this server."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const teamRoleIds = getTicketTeamRoleIds(ticketType, interaction.guild.id);
    const targetIsAssignedTeamMember = hasAnyRole(targetMember, teamRoleIds);
    if (!targetIsAssignedTeamMember) {
      const rolesText =
        teamRoleIds.length > 0
          ? teamRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")
          : "No ticket team roles configured";
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Transfer Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You can only transfer to a member in this ticket's assigned support team."
              },
              {
                name: "Allowed Team Roles",
                value: rolesText
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await channel.setTopic(
        buildTicketTopic({
          ownerId: targetUser.id,
          ticketType,
          claimedBy: claimedBy || null
        }),
        `Ticket transferred by ${interaction.user.tag}`
      );
    } catch (error) {
      console.error("Ticket /transfer setTopic error:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Transfer Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I could not update the ticket metadata. Check my channel permissions."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await channel.permissionOverwrites
      .edit(
        targetUser.id,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        },
        { reason: `Ticket transferred by ${interaction.user.tag}` }
      )
      .catch(() => null);

    if (ownerId && ownerId !== targetUser.id && ownerId !== claimedBy) {
      await channel.permissionOverwrites
        .edit(
          ownerId,
          {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false,
            AttachFiles: false
          },
          { reason: "Ticket transferred: remove previous owner access" }
        )
        .catch(() => null);
    }

    await channel
      .send({
        embeds: [
          buildTicketEventEmbed({
            ticketType,
            title: "Transfer Ticket",
            description: `${ownerId ? `<@${ownerId}>` : "Unknown user"} transferred this ticket to ${targetUser}.`
          })
        ]
      })
      .catch(() => null);

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Ticket Transferred",
          color: 0x57f287,
          fields: [
            { name: "Ticket", value: `${channel}` },
            { name: "Previous Owner", value: ownerId ? `<@${ownerId}> (${ownerId})` : "Unknown" },
            { name: "New Owner", value: `${targetUser} (${targetUser.id})` }
          ],
          footer: "Ticket System"
        })
      ],
      flags: MessageFlags.Ephemeral
    });

    const transferLog = buildLogEmbed({
      title: "Ticket Transferred",
      color: 0xf1c40f,
      fields: [
        { name: "Ticket", value: channel.name },
        { name: "Type", value: String(ticketType || "unknown") },
        { name: "Source", value: String(source || "unknown") },
        { name: "Previous Owner", value: ownerId ? `<@${ownerId}> (${ownerId})` : "Unknown" },
        { name: "New Owner", value: `<@${targetUser.id}> (${targetUser.id})` },
        { name: "Claimed By", value: claimedBy ? `<@${claimedBy}> (${claimedBy})` : "Not claimed" },
        { name: "Transferred By", value: `${interaction.user.tag} (${interaction.user.id})` }
      ],
      footer: "Ticket Log"
    });
    await sendTicketLog(interaction.guild, transferLog);
  }
};
