const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { createRoleApplication, readRoleAppSettings } = require("../../utils/roleApplicationStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roleapply")
    .setDescription("Apply for a specific role")
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const settings = await readRoleAppSettings();
      
      if (!settings.enabled) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Role Applications Disabled",
              color: 0xed4245,
              fields: [
                {
                  name: "Reason",
                  value: "Role applications are currently disabled for this server."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const enabledApplications = settings.applications.filter(app => app.enabled);
      
      if (enabledApplications.length === 0) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "No Available Roles",
              color: 0xf59e0b,
              fields: [
                {
                  name: "Info",
                  value: "There are currently no role applications available."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Check if user already has pending applications
      const existingApplications = await require("../../utils/roleApplicationStore").getRoleApplications({
        guildId: interaction.guildId,
        status: "pending"
      });

      const userApplications = existingApplications.filter(app => app.userId === interaction.user.id);
      if (userApplications.length > 0) {
        const pendingRoles = userApplications.map(app => {
          const appConfig = settings.applications.find(a => a.id === app.applicationId);
          return appConfig?.roleName || "Unknown Role";
        }).join(", ");

        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Pending Applications",
              color: 0xf59e0b,
              fields: [
                {
                  name: "Status",
                  value: `You already have pending applications for: **${pendingRoles}**`
                },
                {
                  name: "Wait",
                  value: "Please wait for your current applications to be reviewed before submitting new ones."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Create role selection menu
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`role_select_${Date.now()}`)
          .setPlaceholder("Select a role to apply for...")
          .addOptions(
            enabledApplications.map(app => ({
              label: app.roleName,
              description: app.description,
              value: app.id
            }))
          )
      );

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Role Application")
            .setColor(0x7289da)
            .setDescription("Select a role below to start your application:")
            .addFields(
              {
                name: "Available Roles",
                value: enabledApplications.map(app => `• **${app.roleName}** - ${app.description}`).join('\n')
              }
            )
        ],
        components: [row],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error("Role apply command error:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Application Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Error",
                value: "Failed to process role application. Please try again."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
