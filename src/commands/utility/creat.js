const {
  PermissionsBitField,
  PermissionFlagsBits,
  MessageFlags,
  SlashCommandBuilder
} = require("discord.js");
const { buildLogEmbed, buildResultEmbed, sendServerUpdate } = require("../../utils/logger");
const { isOwner } = require("../../utils/ownerOnly");

function parseHexColor(rawColor) {
  const input = String(rawColor || "").trim();
  if (!input) {
    return null;
  }

  const match = input.match(/^#?([0-9a-f]{6})$/i);
  if (!match) {
    return undefined;
  }

  return Number.parseInt(match[1], 16);
}

function formatBoolean(value) {
  return value ? "Yes" : "No";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("creat")
    .setDescription("Owner tools")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("role")
        .setDescription("Create a server role")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Role name")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(100)
        )
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription("Hex color, example #ff9900")
            .setRequired(false)
            .setMaxLength(7)
        )
        .addBooleanOption((option) =>
          option
            .setName("hoist")
            .setDescription("Show role separately in the member list")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("mentionable")
            .setDescription("Allow members to mention this role")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("administrator")
            .setDescription("Give Administrator permission to the new role")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Audit log reason")
            .setRequired(false)
            .setMaxLength(300)
        )
    ),

  async execute(interaction) {
    if (!isOwner(interaction)) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Owner Only",
            color: 0xed4245,
            description: "Only the server owner or configured bot owner can create roles with this command."
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand !== "role") {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Unknown Subcommand",
            color: 0xed4245
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const botMember =
      interaction.guild.members.me ||
      (await interaction.guild.members.fetchMe().catch(() => null));

    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Create Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "I need the Manage Roles permission."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const name = interaction.options.getString("name", true).trim();
    const colorInput = interaction.options.getString("color");
    const parsedColor = parseHexColor(colorInput);

    if (parsedColor === undefined) {
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Create Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "Color must be a valid hex color like `#ff9900`."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const hoist = interaction.options.getBoolean("hoist") || false;
    const mentionable = interaction.options.getBoolean("mentionable") || false;
    const administrator = interaction.options.getBoolean("administrator") || false;
    const reason =
      interaction.options.getString("reason")?.trim() ||
      `Role created by ${interaction.user.tag} (${interaction.user.id})`;

    try {
      const roleData = {
        name,
        hoist,
        mentionable,
        permissions: administrator
          ? new PermissionsBitField([PermissionFlagsBits.Administrator])
          : undefined,
        reason
      };
      if (parsedColor != null) {
        roleData.color = parsedColor;
      }

      const role = await interaction.guild.roles.create(roleData);

      const embed = buildResultEmbed({
        title: "Role Created",
        color: parsedColor || 0x57f287,
        fields: [
          { name: "Role", value: `${role} (\`${role.id}\`)`, inline: false },
          {
            name: "Color",
            value:
              parsedColor == null
                ? "Default"
                : `#${parsedColor.toString(16).padStart(6, "0")}`,
            inline: true
          },
          { name: "Hoist", value: formatBoolean(hoist), inline: true },
          { name: "Mentionable", value: formatBoolean(mentionable), inline: true },
          { name: "Administrator", value: formatBoolean(administrator), inline: true },
          { name: "Created By", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
        ]
      });

      await interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });

      await sendServerUpdate(
        interaction.guild,
        buildLogEmbed({
          title: "Role Created",
          color: parsedColor || 0x57f287,
          fields: [
            { name: "Role", value: `${role.name} (${role.id})`, inline: false },
            { name: "Created By", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
            { name: "Reason", value: reason, inline: false }
          ],
          footer: "Role Log"
        })
      );
    } catch (error) {
      console.error("Role creation failed:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Role Create Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: error?.message || "Discord rejected the role creation."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
