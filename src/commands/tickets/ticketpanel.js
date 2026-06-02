const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const { getTicketTypeConfig } = require("../../utils/tickets");
const { buildResultEmbed } = require("../../utils/logger");
const { hasRecentAction, markRecentAction } = require("../../utils/actionDeduper");
const { getGuildSettingsSync } = require("../../utils/guildSettings");

const PANEL_TYPE_ORDER = ["support", "middleman", "index", "role", "report", "host"];
const PANEL_TYPE_STYLE = {
  support: {
    emoji: "🎫",
    title: "Support Ticket",
    color: 0x57f287,
    description: "Need help from staff? Open a support ticket and explain your issue clearly.",
    buttonStyle: ButtonStyle.Primary
  },
  middleman: {
    emoji: "💱",
    title: "Middleman Ticket",
    color: 0x3b82f6,
    description: "Need safe trading? Open a middleman ticket and wait for MM staff.",
    buttonStyle: ButtonStyle.Secondary
  },
  index: {
    emoji: "📊",
    title: "Index Ticket",
    color: 0x3498db,
    description: "Need index help? Open an index ticket and share what you need reviewed.",
    buttonStyle: ButtonStyle.Success
  },
  role: {
    emoji: "��",
    title: "Role Request Ticket",
    color: 0xf1c40f,
    description: "Need to request a role? Open a role request ticket and provide full details.",
    buttonStyle: ButtonStyle.Primary
  },
  report: {
    emoji: "�",
    title: "Report Ticket",
    color: 0xe67e22,
    description: "Need to report a problem/user? Open a report ticket and include full proof.",
    buttonStyle: ButtonStyle.Danger
  },
  host: {
    emoji: "👥",
    title: "Host Giveaway Ticket",
    color: 0x9b59b6,
    description: "Want to host a giveaway? Open a host giveaway ticket and provide giveaway details.",
    buttonStyle: ButtonStyle.Secondary
  }
};

function findPanelMessageByType(messages, typeKey) {
  if (!messages) {
    return null;
  }

  const customId = `ticket_open_${typeKey}`;
  return (
    messages.find((msg) =>
      msg.components?.some((row) =>
        row.components?.some((button) => button.customId === customId)
      )
    ) || null
  );
}

function buildTypePanelEmbed(typeKey) {
  const style = PANEL_TYPE_STYLE[typeKey] || PANEL_TYPE_STYLE.support;
  return new EmbedBuilder()
    .setColor(style.color)
    .setTitle(`${style.emoji} ${style.title}`)
    .setDescription(style.description)
    .setFooter({ text: "One open ticket per type per user" });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Post separate ticket panels in this channel")
    .setDMPermission(false),

  async execute(interaction) {
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
    if (
      settings.ticketPanelChannelId &&
      interaction.channelId !== settings.ticketPanelChannelId
    ) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ticket Panel Blocked",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: `Use this command in <#${settings.ticketPanelChannelId}> only.`
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const enabledTypes = PANEL_TYPE_ORDER.filter(
      (typeKey) => ticketTypeConfig[typeKey]?.enabled !== false
    );

    if (enabledTypes.length === 0) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Ticket Panel Disabled",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "All ticket types are disabled. Enable at least one ticket type in settings."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const recentMessages = await interaction.channel.messages
      .fetch({ limit: 100 })
      .catch(() => null);

    const postedTypes = [];
    const existingTypes = [];
    const failedTypes = [];

    for (const typeKey of enabledTypes) {
      const existingPanel = findPanelMessageByType(recentMessages, typeKey);
      if (existingPanel) {
        existingTypes.push(
          `${PANEL_TYPE_STYLE[typeKey]?.title || typeKey}: [Jump](${existingPanel.url})`
        );
        continue;
      }

      const customId = `ticket_open_${typeKey}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(
            String(ticketTypeConfig[typeKey]?.buttonLabel || "").trim() ||
              PANEL_TYPE_STYLE[typeKey]?.title ||
              "Open Ticket"
          )
          .setStyle(PANEL_TYPE_STYLE[typeKey]?.buttonStyle || ButtonStyle.Primary)
      );
      const embed = buildTypePanelEmbed(typeKey);

      try {
        await interaction.channel.send({
          embeds: [embed],
          components: [row]
        });
        postedTypes.push(PANEL_TYPE_STYLE[typeKey]?.title || typeKey);
      } catch (error) {
        console.error(`Ticket panel post failed for ${typeKey}:`, error);
        failedTypes.push(PANEL_TYPE_STYLE[typeKey]?.title || typeKey);
      }
    }

    markRecentAction("panel_creation", interaction.guild.id, cooldownKey, 30000);

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Ticket Panels Updated",
          color: failedTypes.length > 0 ? 0xfaa61a : 0x57f287,
          fields: [
            { name: "Channel", value: `${interaction.channel}` },
            {
              name: "Posted",
              value:
                postedTypes.length > 0 ? postedTypes.join("\n") : "No new panels posted."
            },
            {
              name: "Already Exists",
              value:
                existingTypes.length > 0
                  ? existingTypes.join("\n").slice(0, 1024)
                  : "None"
            },
            {
              name: "Failed",
              value: failedTypes.length > 0 ? failedTypes.join(", ") : "None"
            }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};

