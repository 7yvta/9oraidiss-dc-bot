const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");
const {
  buildResultEmbed,
  buildLogEmbed,
  sendServerUpdate
} = require("../../utils/logger");
const { sendRoleUpdateDM } = require("../../utils/dmHelper");
const { syncTriggeredRolesForMember } = require("../../utils/roleTriggerSync");

function validateRoleForAssignment(interaction, role) {
  if (role.id === interaction.guild.roles.everyone.id) {
    return { ok: false, reason: "You cannot assign the @everyone role." };
  }

  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
  if (!isAdmin && role.position >= interaction.member.roles.highest.position) {
    return {
      ok: false,
      reason: "You cannot assign a role higher or equal to your highest role."
    };
  }

  const botMember = interaction.guild.members.me;
  if (!botMember || role.position >= botMember.roles.highest.position) {
    return {
      ok: false,
      reason: "I cannot manage this role. Move my bot role above it."
    };
  }

  return { ok: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rolefilter")
    .setDescription("Give a role to members who already have another specific role")
    .setDMPermission(false)
    .addRoleOption((option) =>
      option
        .setName("has_role")
        .setDescription("Only members with this role will be targeted")
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("give_role")
        .setDescription("Role to assign to matching members")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for filtered role assignment")
        .setRequired(true)
        .setMaxLength(300)
    )
    .addBooleanOption((option) =>
      option
        .setName("include_bots")
        .setDescription("Include bot accounts")
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Filter Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You need Manage Roles permission."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const hasRole = interaction.options.getRole("has_role", true);
    const giveRole = interaction.options.getRole("give_role", true);
    const includeBots = interaction.options.getBoolean("include_bots") || false;
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Filter Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Valid reason is required." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (hasRole.id === giveRole.id) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Filter Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "Source role and target role must be different."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const validation = validateRoleForAssignment(interaction, giveRole);
    if (!validation.ok) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Filter Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: validation.reason }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.guild.members.fetch().catch(() => null);

    let matched = 0;
    let added = 0;
    let skipped = 0;
    let failed = 0;
    let dmSent = 0;

    for (const member of interaction.guild.members.cache.values()) {
      if (!includeBots && member.user.bot) {
        skipped += 1;
        continue;
      }
      if (!member.roles.cache.has(hasRole.id)) {
        skipped += 1;
        continue;
      }

      matched += 1;
      if (member.roles.cache.has(giveRole.id)) {
        skipped += 1;
        continue;
      }

      try {
        await member.roles.add(
          giveRole,
          `${reason} | By ${interaction.user.tag} (source role: ${hasRole.id})`
        );
        await syncTriggeredRolesForMember(
          member,
          `Automatic role trigger after /rolefilter by ${interaction.user.tag}`
        ).catch(() => null);
        added += 1;
        const dmOk = await sendRoleUpdateDM(
          interaction.client,
          member.user,
          interaction.guild.name,
          interaction.user.tag,
          "added",
          giveRole.name
        );
        if (dmOk) {
          dmSent += 1;
        }
      } catch {
        failed += 1;
      }
    }

    const resultEmbed = buildResultEmbed({
      title: "Role Filter Complete",
      color: 0x57f287,
      fields: [
        { name: "Source Role", value: `${hasRole}` },
        { name: "Assigned Role", value: `${giveRole}` },
        { name: "Matched", value: `${matched}`, inline: true },
        { name: "Added", value: `${added}`, inline: true },
        { name: "Skipped", value: `${skipped}`, inline: true },
        { name: "Failed", value: `${failed}`, inline: true },
        { name: "DM Sent", value: `${dmSent}`, inline: true },
        { name: "Reason", value: reason }
      ]
    });

    await interaction.editReply({ embeds: [resultEmbed] });

    const logEmbed = buildLogEmbed({
      title: "Role Filter Executed",
      color: 0x57f287,
      fields: [
        { name: "Moderator", value: interaction.user.tag },
        { name: "Source Role", value: `${hasRole.name} (${hasRole.id})` },
        { name: "Assigned Role", value: `${giveRole.name} (${giveRole.id})` },
        { name: "Matched", value: `${matched}` },
        { name: "Added", value: `${added}` },
        { name: "Failed", value: `${failed}` },
        { name: "Reason", value: reason }
      ]
    });
    await sendServerUpdate(interaction.guild, logEmbed);
  }
};
