const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { buildApplicationSelectorPayload } = require("./apply");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("applypanel")
    .setDescription("Post the application panel")
    .setDMPermission(false),

  async execute(interaction) {
    const selectorPayload = buildApplicationSelectorPayload();
    const channel = interaction.channel;
    const respond = async (payload) => {
      if (interaction.deferred && !interaction.replied) {
        const normalized =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? { ...payload }
            : payload;
        if (
          normalized &&
          typeof normalized === "object" &&
          Object.prototype.hasOwnProperty.call(normalized, "flags")
        ) {
          delete normalized.flags;
        }
        return interaction.editReply(normalized);
      }
      if (interaction.replied) {
        return interaction.followUp(payload);
      }
      return interaction.reply(payload);
    };

    if (!channel || !channel.isTextBased()) {
      await respond({
        embeds: [
          buildResultEmbed({
            title: "Command Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "Use this command in a text channel."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const me =
      interaction.guild?.members?.me ||
      (await interaction.guild?.members.fetchMe().catch(() => null));
    const permissions = me ? channel.permissionsFor(me) : null;
    if (
      permissions &&
      (!permissions.has(PermissionFlagsBits.SendMessages) ||
        !permissions.has(PermissionFlagsBits.EmbedLinks) ||
        !permissions.has(PermissionFlagsBits.ViewChannel))
    ) {
      await respond({
        embeds: [
          buildResultEmbed({
            title: "Missing Permissions",
            color: 0xed4245,
            fields: [
              {
                name: "Needed",
                value:
                  "`View Channel`, `Send Messages`, and `Embed Links` in this channel."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await channel.send({
        embeds: selectorPayload.embeds,
        components: selectorPayload.components
      });

      await respond({
        embeds: [
          buildResultEmbed({
            title: "Application Panel Posted",
            color: 0x57f287,
            fields: [{ name: "Channel", value: `${channel}` }]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await respond({
        embeds: [
          buildResultEmbed({
            title: "Command Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: String(error?.message || "Failed to post the panel.")
                  .slice(0, 1000)
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
