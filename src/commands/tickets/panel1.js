const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { getTicketTypeConfig } = require("../../utils/tickets");
const { hasRecentAction, markRecentAction } = require("../../utils/actionDeduper");
const { getGuildSettingsSync } = require("../../utils/guildSettings");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel1")
    .setDescription("Post role-request panel")
    .setDMPermission(false),

  async execute(interaction) {
    // Check for cooldown to prevent rapid panel creation
    const cooldownKey = `panel:${interaction.channelId}`;
    if (hasRecentAction("panel_creation", interaction.guild.id, cooldownKey)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Panel Creation Cooldown",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "Please wait a moment before creating another panel in this channel."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const settings = getGuildSettingsSync(interaction.guild?.id);
    const ticketTypeConfig = getTicketTypeConfig(interaction.guild?.id);
    if (ticketTypeConfig.role?.enabled === false) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Panel Disabled",
            color: 0xed4245,
            fields: [
              { name: "Reason", value: "Role-request tickets are disabled in server settings." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Check for existing role panel in this channel
    const messages = await interaction.channel.messages.fetch({ limit: 10 });
    const existingPanel = messages.find(msg => 
      msg.embeds.length > 0 && 
      msg.components.length > 0 &&
      msg.components.some(row => 
        row.components.some(button => 
          button.customId === 'ticket_open_role'
        )
      )
    );

    if (existingPanel) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Panel Already Exists",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: `A role request panel already exists in this channel. [Jump to panel](${existingPanel.url})`
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_open_role")
        .setLabel(ticketTypeConfig.role.buttonLabel)
        .setStyle(ButtonStyle.Primary)
    );

    const roleMentions =
      (settings.roleRequestTeamRoleIds || []).map((roleId) => `<@&${roleId}>`).join(" ") ||
      "Not configured.";
    const panel =
      settings.roleRequestPanel && typeof settings.roleRequestPanel === "object"
        ? settings.roleRequestPanel
        : {};

    const panelTitle = String(panel.title || "Role Request Panel").trim() || "Role Request Panel";
    const panelDescriptionTemplate =
      String(panel.descriptionTemplate || "").trim() ||
      [
        "Click the button below to open a role request ticket.",
        "",
        "Handled by authorized role(s):",
        "{{roles}}"
      ].join("\n");
    const panelDescription = panelDescriptionTemplate.replaceAll("{{roles}}", roleMentions);
    const panelColor = panel.color ?? 0x5865f2;

    const embed = new EmbedBuilder()
      .setColor(panelColor)
      .setTitle(panelTitle)
      .setDescription(panelDescription);

    await interaction.channel.send({
      embeds: [embed],
      components: [row]
    });

    // Mark cooldown to prevent rapid panel creation
    markRecentAction("panel_creation", interaction.guild.id, cooldownKey, 30000); // 30 second cooldown

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Panel Posted",
          color: 0x57f287,
          fields: [{ name: "Channel", value: `${interaction.channel}` }]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};
