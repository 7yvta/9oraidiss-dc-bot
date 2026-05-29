const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { getRoleApplications } = require("../../utils/roleApplicationStore");
const { readRoleAppSettings } = require("../../utils/roleApplicationStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reviewapps")
    .setDescription("Review and manage role applications")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Choose an action")
        .setRequired(true)
        .addChoices(
          { name: "View Applications", value: "view" },
          { name: "Approve Application", value: "approve" },
          { name: "Reject Application", value: "reject" },
          { name: "Delete Application", value: "delete" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("role")
        .setDescription("Optional role application id filter")
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Permission Denied",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You need Administrator permissions to review applications."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const action = interaction.options.getString("action", true);
    const selectedRole = interaction.options.getString("role");

    try {
      const settings = await readRoleAppSettings();
      const applications = await getRoleApplications({ guildId: interaction.guildId });
      const pendingApps = applications.filter((app) => app.status === "pending");
      const filteredApps = selectedRole
        ? pendingApps.filter((app) => app.applicationId === selectedRole)
        : pendingApps;

      if (pendingApps.length === 0) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "No Applications",
              color: 0xf59e0b,
              fields: [
                {
                  name: "Info",
                  value: "There are no pending role applications."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (filteredApps.length === 0) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "No Matching Applications",
              color: 0xf59e0b,
              fields: [
                {
                  name: "Filter",
                  value: selectedRole || "none"
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (action === "view") {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Role Applications Overview")
              .setColor(0x7289da)
              .setDescription(`Showing ${filteredApps.length} pending application(s).`)
          ],
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Applications To ${action.charAt(0).toUpperCase() + action.slice(1)}`)
              .setColor(0x7289da)
              .setDescription(`Use the buttons below to ${action} each application.`)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      for (const app of filteredApps) {
        await sendApplicationCard(interaction, app, settings, action);
      }
    } catch (error) {
      console.error("Review apps error:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Review Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Error",
                value: "Failed to process application review. Please try again."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

async function sendApplicationCard(interaction, app, settings, action) {
  const user = await interaction.client.users.fetch(app.userId).catch(() => null);
  const appConfig = settings.applications.find((entry) => entry.id === app.applicationId);
  const questions = Array.isArray(appConfig?.questions) ? appConfig.questions : [];

  const answerFields = [];
  for (const [questionId, answer] of Object.entries(app.answers || {})) {
    const question = questions.find((entry) => entry.id === questionId);
    answerFields.push({
      name: question?.question || questionId,
      value: String(answer || "No answer provided").slice(0, 1024),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Application #${app.id}`)
    .setColor(0x7289da)
    .addFields(
      {
        name: "User",
        value: `${user?.tag || "Unknown User"} (${app.userId})`,
        inline: true
      },
      {
        name: "Role",
        value: appConfig?.roleName || app.applicationId,
        inline: true
      },
      {
        name: "Submitted",
        value: `<t:${Math.floor(new Date(app.submittedAt).getTime() / 1000)}:R>`,
        inline: true
      },
      ...answerFields
    );

  if (action === "view") {
    await interaction.followUp({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_app_${app.id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reject_app_${app.id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`delete_app_${app.id}`)
      .setLabel("Delete")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.followUp({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}
