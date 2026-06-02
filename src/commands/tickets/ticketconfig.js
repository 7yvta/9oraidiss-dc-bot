const {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const {
  getGuildOverridesSync,
  getGuildSettingsSync,
  patchGuildOverrides
} = require("../../utils/guildSettings");
const { getTicketTypeConfig } = require("../../utils/tickets");
const { isBotAdmin } = require("../../utils/ownerOnly");

const TICKET_TYPES = [
  ["support", "Support"],
  ["middleman", "Middleman"],
  ["index", "Index"],
  ["role", "Role Request"],
  ["report", "Report"],
  ["host", "Host Giveaway"]
];

const TYPE_KEYS = {
  support: {
    panel: "supportTicketPanelChannelId",
    category: "supportTicketCategoryId",
    roles: "supportTeamRoleIds"
  },
  middleman: {
    panel: "middlemanTicketPanelChannelId",
    category: "middlemanTicketCategoryId",
    roles: "middlemanTeamRoleIds",
    singleRole: "middlemanTicketRoleId"
  },
  index: {
    panel: "indexTicketPanelChannelId",
    category: "indexTicketCategoryId",
    roles: "indexTeamRoleIds"
  },
  role: {
    panel: "roleRequestTicketPanelChannelId",
    category: "roleRequestTicketCategoryId",
    roles: "roleRequestTeamRoleIds"
  },
  report: {
    panel: "reportTicketPanelChannelId",
    category: "reportTicketCategoryId",
    roles: "reportTeamRoleIds"
  },
  host: {
    panel: "hostGiveawayTicketPanelChannelId",
    category: "hostGiveawayTicketCategoryId",
    roles: "hostGiveawayTeamRoleIds"
  }
};

function addTypeOption(subcommand) {
  return subcommand.addStringOption((option) =>
    option
      .setName("type")
      .setDescription("Ticket type to configure")
      .setRequired(true)
      .addChoices(...TICKET_TYPES.map(([value, name]) => ({ name, value })))
  );
}

function extractIds(input) {
  return [
    ...new Set(
      String(input || "")
        .match(/\d{15,25}/g)
        ?.map((id) => id.trim())
        .filter(Boolean) || []
    )
  ];
}

function formatRoleList(roleIds) {
  return roleIds.length > 0
    ? roleIds.map((roleId) => `<@&${roleId}>`).join("\n")
    : "None";
}

function channelValue(channelId) {
  return channelId ? `<#${channelId}>` : "Not set";
}

function formatTypeFields(typeKey, config) {
  const entry = config[typeKey];
  if (!entry) {
    return [{ name: "Error", value: "Unknown ticket type." }];
  }

  return [
    { name: "Type", value: entry.label || typeKey, inline: true },
    { name: "Enabled", value: entry.enabled === false ? "No" : "Yes", inline: true },
    { name: "Panel Channel", value: channelValue(entry.panelChannelId), inline: true },
    { name: "Category", value: channelValue(entry.categoryId), inline: true },
    { name: "Team / Ping Roles", value: formatRoleList(entry.teamRoleIds), inline: false },
    {
      name: "Transcript Log",
      value: channelValue(entry.transcriptLogChannelId),
      inline: true
    },
    { name: "Button Label", value: entry.buttonLabel || "Default", inline: true }
  ];
}

function mergeTicketTypeOverride(currentOverrides, typeKey, patch) {
  return {
    ...(currentOverrides.ticketTypes || {}),
    [typeKey]: {
      ...((currentOverrides.ticketTypes || {})[typeKey] || {}),
      ...patch
    }
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketconfig")
    .setDescription("Configure ticket panels, categories, roles, and logs")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      addTypeOption(
        subcommand
          .setName("view")
          .setDescription("View the current config for one ticket type")
      )
    )
    .addSubcommand((subcommand) =>
      addTypeOption(
        subcommand
          .setName("set")
          .setDescription("Update a ticket type")
      )
        .addChannelOption((option) =>
          option
            .setName("panel_channel")
            .setDescription("Channel where this ticket panel is posted")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Category where opened tickets go")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("team_roles")
            .setDescription("Role IDs/mentions to ping and allow claim, comma or space separated")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("team_role")
            .setDescription("Single role to ping and allow claim")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Enable or disable this ticket type")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("button_label")
            .setDescription("Text shown on the open ticket button")
            .setMaxLength(80)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("intro_message")
            .setDescription("Ticket intro text. Use {user}; use \\n for new lines.")
            .setMaxLength(1800)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("logs")
        .setDescription("Update ticket and server log channels")
        .addChannelOption((option) =>
          option
            .setName("ticket_transcripts")
            .setDescription("Channel for ticket transcripts")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("mod_log")
            .setDescription("Channel for moderation logs")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("server_log")
            .setDescription("Channel for server/member/role/message logs")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("appeals_apps_log")
            .setDescription("Channel for applications, appeals, and reports")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!isBotAdmin(interaction)) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Bot Admin Only",
            color: 0xed4245,
            description: "Only the owner or configured bot admin roles can change ticket config."
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === "view") {
      const typeKey = interaction.options.getString("type", true);
      const ticketConfig = getTicketTypeConfig(guildId);
      const settings = getGuildSettingsSync(guildId);
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ticket Config",
            color: 0x5865f2,
            fields: [
              ...formatTypeFields(typeKey, ticketConfig),
              { name: "Mod Log", value: channelValue(settings.modLogChannelId), inline: true },
              { name: "Server Log", value: channelValue(settings.serverUpdateChannelId), inline: true },
              { name: "Apps/Appeals Log", value: channelValue(settings.reportChannelId), inline: true }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (subcommand === "set") {
      const typeKey = interaction.options.getString("type", true);
      const keys = TYPE_KEYS[typeKey];
      const currentOverrides = getGuildOverridesSync(guildId);
      const patch = {};
      const changed = [];

      const panelChannel = interaction.options.getChannel("panel_channel");
      const category = interaction.options.getChannel("category");
      const teamRole = interaction.options.getRole("team_role");
      const teamRolesRaw = interaction.options.getString("team_roles");
      const enabled = interaction.options.getBoolean("enabled");
      const buttonLabel = interaction.options.getString("button_label");
      const introMessage = interaction.options.getString("intro_message");

      if (panelChannel) {
        patch[keys.panel] = panelChannel.id;
        changed.push(`Panel channel -> ${panelChannel}`);
      }

      if (category) {
        patch[keys.category] = category.id;
        changed.push(`Category -> ${category.name}`);
      }

      const parsedRoleIds = extractIds(teamRolesRaw);
      if (teamRole) {
        parsedRoleIds.unshift(teamRole.id);
      }
      const roleIds = [...new Set(parsedRoleIds)];
      if (roleIds.length > 0) {
        patch[keys.roles] = roleIds;
        if (keys.singleRole) {
          patch[keys.singleRole] = roleIds[0];
        }
        changed.push(`Team roles -> ${formatRoleList(roleIds)}`);
      }

      const typePatch = {};
      if (typeof enabled === "boolean") {
        typePatch.enabled = enabled;
        changed.push(`Enabled -> ${enabled ? "Yes" : "No"}`);
      }
      if (buttonLabel) {
        typePatch.buttonLabel = buttonLabel.trim();
        changed.push(`Button label -> ${buttonLabel.trim()}`);
      }
      if (introMessage) {
        typePatch.introMessage = introMessage.replace(/\\n/g, "\n").trim();
        changed.push("Intro message -> updated");
      }
      if (Object.keys(typePatch).length > 0) {
        patch.ticketTypes = mergeTicketTypeOverride(currentOverrides, typeKey, typePatch);
      }

      if (changed.length === 0) {
        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "No Changes",
              color: 0xfaa61a,
              description: "Add at least one option to update."
            })
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      await patchGuildOverrides(guildId, patch);
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ticket Config Updated",
            color: 0x57f287,
            fields: [
              { name: "Type", value: typeKey, inline: true },
              { name: "Changed", value: changed.join("\n").slice(0, 1000), inline: false }
            ],
            footer: "Run /ticketpanel in the panel channel if you changed panel text/buttons."
          })
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    }

    if (subcommand === "logs") {
      const patch = {};
      const changed = [];
      const transcript = interaction.options.getChannel("ticket_transcripts");
      const modLog = interaction.options.getChannel("mod_log");
      const serverLog = interaction.options.getChannel("server_log");
      const reportLog = interaction.options.getChannel("appeals_apps_log");

      if (transcript) {
        patch.ticketTranscriptLogId = transcript.id;
        changed.push(`Ticket transcripts -> ${transcript}`);
      }
      if (modLog) {
        patch.modLogChannelId = modLog.id;
        changed.push(`Mod log -> ${modLog}`);
      }
      if (serverLog) {
        patch.serverUpdateChannelId = serverLog.id;
        changed.push(`Server log -> ${serverLog}`);
      }
      if (reportLog) {
        patch.reportChannelId = reportLog.id;
        changed.push(`Applications/appeals -> ${reportLog}`);
      }

      if (changed.length === 0) {
        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "No Changes",
              color: 0xfaa61a,
              description: "Choose at least one log channel."
            })
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      await patchGuildOverrides(guildId, patch);
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Log Channels Updated",
            color: 0x57f287,
            description: changed.join("\n")
          })
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    }

    return interaction.reply({
      embeds: [buildResultEmbed({ title: "Unknown Subcommand", color: 0xed4245 })],
      flags: MessageFlags.Ephemeral
    });
  }
};
