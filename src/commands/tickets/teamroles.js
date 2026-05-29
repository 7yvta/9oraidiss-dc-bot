const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { getGuildSettingsSync, patchGuildOverrides } = require("../../utils/guildSettings");
const { isBotAdmin } = require("../../utils/ownerOnly");

const ROLE_GROUPS = [
  {
    option: "support",
    label: "Support",
    key: "supportTeamRoleIds"
  },
  {
    option: "middleman",
    label: "Middleman",
    key: "middlemanTeamRoleIds",
    singleKey: "middlemanTicketRoleId"
  },
  {
    option: "service",
    label: "Service",
    key: "serviceTeamRoleIds",
    singleKey: "serviceTicketRoleId"
  },
  {
    option: "index",
    label: "Index",
    key: "indexTeamRoleIds"
  },
  {
    option: "role_request",
    label: "Role Request",
    key: "roleRequestTeamRoleIds"
  },
  {
    option: "report",
    label: "Report",
    key: "reportTeamRoleIds"
  },
  {
    option: "host_giveaway",
    label: "Host Giveaway",
    key: "hostGiveawayTeamRoleIds"
  },
  {
    option: "forceclaim",
    label: "Force Claim",
    key: "ticketForceClaimRoleIds"
  },
  {
    option: "bot_admin",
    label: "Bot Admin",
    key: "botAdminRoleIds"
  }
];

function extractRoleIds(input) {
  return [
    ...new Set(
      String(input || "")
        .match(/\d{15,25}/g)
        ?.map((id) => id.trim())
        .filter(Boolean) || []
    )
  ];
}

function formatRoleIds(roleIds) {
  return Array.isArray(roleIds) && roleIds.length > 0
    ? roleIds.map((roleId) => `<@&${roleId}>`).join(" ")
    : "Not set";
}

function addRoleListOption(subcommand, group) {
  return subcommand.addStringOption((option) =>
    option
      .setName(group.option)
      .setDescription(`Role IDs or mentions for ${group.label}`)
      .setMaxLength(1000)
      .setRequired(false)
  );
}

function buildRoleFields(settings) {
  return [
    {
      name: "Member Role",
      value: settings.memberRoleId ? `<@&${settings.memberRoleId}>` : "Not set",
      inline: false
    },
    {
      name: "Member Auto Register",
      value: settings.autoMemberRoleEnabled === false ? "Off" : "On",
      inline: true
    },
    {
      name: "Member Sticky",
      value: settings.stickyMemberRoleEnabled === false ? "Off" : "On",
      inline: true
    },
    ...ROLE_GROUPS.map((group) => ({
      name: group.label,
      value: formatRoleIds(settings[group.key]),
      inline: false
    }))
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("teamroles")
    .setDescription("Configure staff/team role IDs for tickets")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand.setName("view").setDescription("View current team role IDs")
    )
    .addSubcommand((subcommand) => {
      let builder = subcommand
        .setName("set")
        .setDescription("Set team role IDs from pasted IDs or mentions");
      builder = builder
        .addStringOption((option) =>
          option
            .setName("member_role")
            .setDescription("Role ID or mention to auto-register as member role")
            .setMaxLength(100)
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("auto_register")
            .setDescription("Automatically give member_role to new members")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("sticky")
            .setDescription("Re-add member_role if it is removed")
            .setRequired(false)
        );
      for (const group of ROLE_GROUPS) {
        builder = addRoleListOption(builder, group);
      }
      return builder;
    }),

  async execute(interaction) {
    if (!isBotAdmin(interaction)) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Bot Admin Only",
            color: 0xed4245,
            description: "Only the owner or configured bot admin roles can change team roles."
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === "view") {
      const settings = getGuildSettingsSync(guildId);
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Team Roles",
            color: 0x5865f2,
            fields: buildRoleFields(settings)
          })
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    }

    const patch = {};
    const changed = [];
    const invalid = [];
    const memberRoleRaw = interaction.options.getString("member_role");
    const autoRegister = interaction.options.getBoolean("auto_register");
    const sticky = interaction.options.getBoolean("sticky");

    if (memberRoleRaw != null) {
      const roleIds = extractRoleIds(memberRoleRaw);
      if (roleIds.length === 0) {
        invalid.push("Member Role");
      } else {
        patch.memberRoleId = roleIds[0];
        changed.push(`Member Role: <@&${roleIds[0]}>`);
      }
    }

    if (typeof autoRegister === "boolean") {
      patch.autoMemberRoleEnabled = autoRegister;
      changed.push(`Member Auto Register: ${autoRegister ? "On" : "Off"}`);
    }

    if (typeof sticky === "boolean") {
      patch.stickyMemberRoleEnabled = sticky;
      changed.push(`Member Sticky: ${sticky ? "On" : "Off"}`);
    }

    for (const group of ROLE_GROUPS) {
      const raw = interaction.options.getString(group.option);
      if (raw == null) {
        continue;
      }

      const roleIds = extractRoleIds(raw);
      if (roleIds.length === 0) {
        invalid.push(group.label);
        continue;
      }

      patch[group.key] = roleIds;
      if (group.singleKey) {
        patch[group.singleKey] = roleIds[0];
      }
      changed.push(`${group.label}: ${formatRoleIds(roleIds)}`);
    }

    if (invalid.length > 0) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Invalid Role IDs",
            color: 0xed4245,
            description: `No role IDs were found for: ${invalid.join(", ")}. Paste role IDs or role mentions.`
          })
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    }

    if (changed.length === 0) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "No Changes",
            color: 0xfaa61a,
            description: "Add at least one role option to update."
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    await patchGuildOverrides(guildId, patch);

    return interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Team Roles Updated",
          color: 0x57f287,
          description: changed.join("\n").slice(0, 4000),
          footer: "Use /teamroles view to confirm current settings."
        })
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
  }
};
