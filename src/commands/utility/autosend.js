const {
  ChannelType,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");
const { getGuildSettingsSync, patchGuildOverrides } = require("../../utils/guildSettings");
const { buildLogEmbed, buildResultEmbed, sendModLog } = require("../../utils/logger");

const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 10080;

function hasConfigAccess(interaction) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

function formatChannelValue(channelId) {
  return channelId ? `<#${channelId}>` : "Not set";
}

function formatMessagePreview(text) {
  const value = String(text || "").trim();
  if (!value) {
    return "Not set";
  }
  if (value.length <= 180) {
    return value;
  }
  return `${value.slice(0, 177)}...`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autosend")
    .setDescription("Configure automatic activity messages in your server")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show current autosend settings")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("enable")
        .setDescription("Enable autosend using current saved settings")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable autosend")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configure")
        .setDescription("Update autosend channel, interval, and message")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Text channel where messages are sent")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("interval_minutes")
            .setDescription("Minutes between messages (5 to 10080)")
            .setMinValue(MIN_INTERVAL_MINUTES)
            .setMaxValue(MAX_INTERVAL_MINUTES)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Message to post automatically")
            .setMaxLength(1800)
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Enable or disable autosend after saving")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("send_now")
        .setDescription("Send one autosend message now")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Optional channel override for this one send")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!hasConfigAccess(interaction)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Access Denied",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You need Administrator or Manage Server to configure autosend."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const action = interaction.options.getSubcommand();
    const settings = getGuildSettingsSync(interaction.guild.id);

    if (action === "status") {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Autosend Status",
            color: settings.autoMessageEnabled ? 0x57f287 : 0x5865f2,
            fields: [
              {
                name: "Enabled",
                value: settings.autoMessageEnabled ? "Yes" : "No",
                inline: true
              },
              {
                name: "Channel",
                value: formatChannelValue(settings.autoMessageChannelId),
                inline: true
              },
              {
                name: "Interval",
                value: `${Number(settings.autoMessageIntervalMinutes || 60)} minute(s)`,
                inline: true
              },
              {
                name: "Message Preview",
                value: formatMessagePreview(settings.autoMessageContent)
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (action === "enable") {
      if (!settings.autoMessageChannelId || !String(settings.autoMessageContent || "").trim()) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Autosend Enable Failed",
              color: 0xed4245,
              fields: [
                {
                  name: "Reason",
                  value:
                    "Set channel and message first with `/autosend configure channel:<channel> message:<text>`."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await patchGuildOverrides(interaction.guild.id, { autoMessageEnabled: true });
      const updated = getGuildSettingsSync(interaction.guild.id);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Autosend Enabled",
            color: 0x57f287,
            fields: [
              { name: "Channel", value: formatChannelValue(updated.autoMessageChannelId) },
              {
                name: "Interval",
                value: `${Number(updated.autoMessageIntervalMinutes || 60)} minute(s)`
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });

      await sendModLog(
        interaction.guild,
        buildLogEmbed({
          title: "Autosend Enabled",
          color: 0x57f287,
          fields: [
            { name: "By", value: `${interaction.user.tag} (${interaction.user.id})` },
            { name: "Channel", value: formatChannelValue(updated.autoMessageChannelId) },
            {
              name: "Interval",
              value: `${Number(updated.autoMessageIntervalMinutes || 60)} minute(s)`
            }
          ]
        })
      );
      return;
    }

    if (action === "disable") {
      await patchGuildOverrides(interaction.guild.id, { autoMessageEnabled: false });
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Autosend Disabled",
            color: 0xed4245,
            fields: [{ name: "Status", value: "Autosend is now disabled." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });

      await sendModLog(
        interaction.guild,
        buildLogEmbed({
          title: "Autosend Disabled",
          color: 0xed4245,
          fields: [{ name: "By", value: `${interaction.user.tag} (${interaction.user.id})` }]
        })
      );
      return;
    }

    if (action === "configure") {
      const channel = interaction.options.getChannel("channel");
      const intervalMinutes = interaction.options.getInteger("interval_minutes");
      const message = interaction.options.getString("message");
      const enabled = interaction.options.getBoolean("enabled");

      const patch = {};
      if (channel) {
        patch.autoMessageChannelId = channel.id;
      }
      if (Number.isInteger(intervalMinutes)) {
        patch.autoMessageIntervalMinutes = intervalMinutes;
      }
      if (message != null) {
        patch.autoMessageContent = String(message).trim();
      }
      if (enabled != null) {
        patch.autoMessageEnabled = enabled;
      }

      if (Object.keys(patch).length === 0) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Autosend Configure Failed",
              color: 0xed4245,
              fields: [
                {
                  name: "Reason",
                  value:
                    "Provide at least one option: channel, interval_minutes, message, or enabled."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (
        Object.prototype.hasOwnProperty.call(patch, "autoMessageContent") &&
        !String(patch.autoMessageContent || "").trim()
      ) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Autosend Configure Failed",
              color: 0xed4245,
              fields: [{ name: "Reason", value: "Message content cannot be empty." }]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await patchGuildOverrides(interaction.guild.id, patch);
      const updated = getGuildSettingsSync(interaction.guild.id);

      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Autosend Updated",
            color: 0x57f287,
            fields: [
              {
                name: "Enabled",
                value: updated.autoMessageEnabled ? "Yes" : "No",
                inline: true
              },
              {
                name: "Channel",
                value: formatChannelValue(updated.autoMessageChannelId),
                inline: true
              },
              {
                name: "Interval",
                value: `${Number(updated.autoMessageIntervalMinutes || 60)} minute(s)`,
                inline: true
              },
              { name: "Message Preview", value: formatMessagePreview(updated.autoMessageContent) }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });

      await sendModLog(
        interaction.guild,
        buildLogEmbed({
          title: "Autosend Configuration Changed",
          color: 0x5865f2,
          fields: [
            { name: "By", value: `${interaction.user.tag} (${interaction.user.id})` },
            {
              name: "Enabled",
              value: updated.autoMessageEnabled ? "Yes" : "No",
              inline: true
            },
            {
              name: "Channel",
              value: formatChannelValue(updated.autoMessageChannelId),
              inline: true
            },
            {
              name: "Interval",
              value: `${Number(updated.autoMessageIntervalMinutes || 60)} minute(s)`,
              inline: true
            }
          ]
        })
      );
      return;
    }

    const overrideChannel = interaction.options.getChannel("channel");
    const channelId = overrideChannel?.id || settings.autoMessageChannelId;
    const content = String(settings.autoMessageContent || "").trim();

    if (!channelId || !content) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Autosend Test Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value:
                  "Set both channel and message first using `/autosend configure`."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    let targetChannel = interaction.guild.channels.cache.get(channelId);
    if (!targetChannel) {
      targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    }
    if (!targetChannel?.isTextBased?.() || !targetChannel?.isSendable?.()) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Autosend Test Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Configured channel is not sendable." }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await targetChannel.send(content);
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Autosend Test Sent",
          color: 0x57f287,
          fields: [{ name: "Channel", value: `${targetChannel}` }]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
};
