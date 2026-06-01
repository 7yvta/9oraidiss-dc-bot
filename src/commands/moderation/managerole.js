const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const {
  buildLogEmbed,
  buildResultEmbed,
  sendServerUpdate
} = require("../../utils/logger");
const { getGuildSettingsSync } = require("../../utils/guildSettings");
const {
  APP_MEMBER_ROLE_ID,
  canRemoveProtectedMemberRole,
  isProtectedMemberRole,
  isStickyMemberRole,
  markApprovedProtectedMemberRoleRemoval,
  PROTECTED_MEMBER_ROLE_REMOVER_ROLE_IDS
} = require("../../utils/memberRoleGuard");
const { sendRoleUpdateDM } = require("../../utils/dmHelper");
const { syncTriggeredRolesForMember } = require("../../utils/roleTriggerSync");
const { clearRecentAction, markRecentAction } = require("../../utils/actionDeduper");
const { isBotOwnerId } = require("../../utils/permissionEngine");

function buildSingleRoleChangeFingerprint(memberId, action, roleId) {
  const added = action === "add" ? String(roleId) : "";
  const removed = action === "remove" ? String(roleId) : "";
  return `${memberId}|a:${added}|r:${removed}`;
}

function buildRoleManageFailureEmbed(targetUser, role, reasonText) {
  return buildResultEmbed({
    title: "Role Manage Failed",
    color: 0xed4245,
    fields: [
      ...(targetUser
        ? [{ name: "User", value: `${targetUser.tag} (${targetUser.id})` }]
        : []),
      ...(role ? [{ name: "Role", value: `${role}` }] : []),
      { name: "Reason", value: String(reasonText || "Unknown error.") }
    ]
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("managerole")
    .setDescription("Manage member roles")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Give a role to a user")
        .addUserOption((option) =>
          option
            .setName("target_user")
            .setDescription("Target user")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to add")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for adding the role")
            .setRequired(true)
            .setMaxLength(300)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a role from a user")
        .addUserOption((option) =>
          option
            .setName("target_user")
            .setDescription("Target user")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to remove")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for removing the role")
            .setRequired(true)
            .setMaxLength(300)
        )
    ),

  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    const targetUser =
      interaction.options.getUser("target_user") ||
      interaction.options.getUser("user");
    if (!targetUser) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Manage Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value:
                  "Missing user option. Reopen slash command list and use `/managerole` again."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const role = interaction.options.getRole("role", true);
    const reasonRaw = interaction.options.getString("reason", true);
    const reason = reasonRaw.trim();
    const settings = getGuildSettingsSync(interaction.guild.id);
    const isProtectedRoleRemoval =
      action === "remove" && isProtectedMemberRole(role.id, settings);
    const isStickyRoleRemoval =
      action === "remove" && isStickyMemberRole(role.id, settings);

    if (!reason) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Manage Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Valid reason is required." }]
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
            title: "Role Manage Failed",
            color: 0xed4245,
            fields: [
              { name: "Reason", value: "That user is not in this server." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (role.id === interaction.guild.roles.everyone.id) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Manage Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You cannot manage the @everyone role."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
    const isBotOwner = isBotOwnerId(interaction.user.id);
    if (
      !isBotOwner &&
      !isAdmin &&
      role.position >= interaction.member.roles.highest.position
    ) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Manage Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You cannot manage roles higher or equal to your top role."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const botMember =
      interaction.guild.members.me ||
      (await interaction.guild.members.fetchMe().catch(() => null));
    if (!botMember || role.position >= botMember.roles.highest.position) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Manage Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I cannot manage that role. Move my bot role above it."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (action === "add") {
      if (targetUser.bot && isStickyMemberRole(role.id, settings)) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Role Add Blocked",
              color: 0xed4245,
              fields: [
                { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
                { name: "Role", value: `${role} (\`${role.id}\`)` },
                {
                  name: "Reason",
                  value: `App accounts cannot receive sticky member roles. Use <@&${APP_MEMBER_ROLE_ID}> for app accounts.`
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (!isBotOwner && !interaction.member.roles.cache.has(role.id)) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Role Manage Failed",
              color: 0xed4245,
              fields: [
                { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
                { name: "Role", value: `${role}` },
                {
                  name: "Reason",
                  value: "You can only give roles that you already have."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (member.roles.cache.has(role.id)) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Role Manage Failed",
              color: 0xed4245,
              fields: [
                { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
                { name: "Role", value: `${role}` },
                { name: "Reason", value: "User already has this role." }
              ]
            })
          ],
        flags: MessageFlags.Ephemeral
        });
        return;
      }
      const addFingerprint = buildSingleRoleChangeFingerprint(
        member.id,
        "add",
        role.id
      );
      markRecentAction(
        "role_change_log_suppress",
        interaction.guild.id,
        addFingerprint,
        20000
      );
      try {
        await member.roles.add(role, `${reason} | By ${interaction.user.tag}`);
      } catch (error) {
        clearRecentAction(
          "role_change_log_suppress",
          interaction.guild.id,
          addFingerprint
        );
        await interaction.reply({
          embeds: [
            buildRoleManageFailureEmbed(
              targetUser,
              role,
              error?.message || "I could not add that role."
            )
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const embed = buildLogEmbed({
        title: "Role Give \u2705",
        color: 0x57f287,
        fields: [
          { name: "Actioned By", value: `${interaction.user.tag} (${interaction.user.id})` },
          { name: "Target User", value: `${targetUser.tag} (${targetUser.id})` },
          { name: "Role", value: `${role}` },
          { name: "Reason", value: reason },
          { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        ]
      });

      await interaction.reply({
        embeds: [embed]
      });

      await sendServerUpdate(interaction.guild, embed);
      await syncTriggeredRolesForMember(
        member,
        `Automatic role trigger after /managerole add by ${interaction.user.tag}`
      ).catch(() => null);
      
      // Send DM to user about role addition
      await sendRoleUpdateDM(interaction.client, targetUser, interaction.guild.name, interaction.user.tag, 'added', role.name);
      return;
    }

    if (isStickyRoleRemoval) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Remove Blocked",
            color: 0xed4245,
            fields: [
              { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
              { name: "Role", value: `${role} (\`${role.id}\`)` },
              {
                name: "Reason",
                value: "This is a sticky role and is automatically added back when removed."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (isProtectedRoleRemoval && !canRemoveProtectedMemberRole(interaction.member)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Remove Blocked",
            color: 0xed4245,
            fields: [
              { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
              { name: "Role", value: `${role} (\`${role.id}\`)` },
              {
                name: "Reason",
                value: `Only these roles can remove the protected member role: ${PROTECTED_MEMBER_ROLE_REMOVER_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(", ")}`
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!member.roles.cache.has(role.id)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Manage Failed",
            color: 0xed4245,
            fields: [
              { name: "User", value: `${targetUser.tag} (${targetUser.id})` },
              { name: "Role", value: `${role}` },
              { name: "Reason", value: "User does not have this role." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (isProtectedRoleRemoval) {
      markApprovedProtectedMemberRoleRemoval({
        guildId: interaction.guild.id,
        memberId: member.id
      });
    }

    const removeFingerprint = buildSingleRoleChangeFingerprint(
      member.id,
      "remove",
      role.id
    );
    markRecentAction(
      "role_change_log_suppress",
      interaction.guild.id,
      removeFingerprint,
      20000
    );

    try {
      await member.roles.remove(role, `${reason} | By ${interaction.user.tag}`);
    } catch (error) {
      clearRecentAction(
        "role_change_log_suppress",
        interaction.guild.id,
        removeFingerprint
      );
      await interaction.reply({
        embeds: [
          buildRoleManageFailureEmbed(
            targetUser,
            role,
            error?.message || "I could not remove that role."
          )
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = buildLogEmbed({
      title: "Role Removed \u274C",
      color: 0xed4245,
      fields: [
        { name: "Actioned By", value: `${interaction.user.tag} (${interaction.user.id})` },
        { name: "Target User", value: `${targetUser.tag} (${targetUser.id})` },
        { name: "Role", value: `${role}` },
        { name: "Reason", value: reason },
        { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
      ]
    });

    await interaction.reply({
      embeds: [embed]
    });

    await sendServerUpdate(interaction.guild, embed);
    
    // Send DM to user about role removal
    await sendRoleUpdateDM(interaction.client, targetUser, interaction.guild.name, interaction.user.tag, 'removed', role.name);

    const refreshedMember = await interaction.guild.members
      .fetch(member.id)
      .catch(() => member);
    await syncTriggeredRolesForMember(
      refreshedMember,
      `Automatic role trigger after /managerole remove by ${interaction.user.tag}`
    ).catch(() => null);
  }
};
