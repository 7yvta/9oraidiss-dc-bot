const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { createAppeal, getUserAppeals } = require("../../utils/appealStore");
const { buildResultEmbed, buildLogEmbed, sendLogToChannel } = require("../../utils/logger");
const {
  APPEAL_REVIEW_CHANNEL_ID,
  buildAppealReviewComponents
} = require("../../utils/appealReview");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("appeal")
    .setDescription("Submit a ban appeal")
    .setDMPermission(true)
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for your appeal")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("moderators_note")
        .setDescription("Additional information for moderators")
        .setMaxLength(500)
    ),

  async execute(interaction) {
    const reason = interaction.options.getString("reason", true);
    const moderatorsNote = interaction.options.getString("moderators_note");

    try {
      // Check if user already has pending appeals
      const userAppeals = await getUserAppeals({
        guildId: "global", // Use global for cross-guild appeals
        userId: interaction.user.id
      });

      const pendingAppeal = userAppeals.find(appeal => appeal.status === "pending");
      
      if (pendingAppeal) {
        await interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Appeal Already Pending",
              color: 0xff6b6b,
              fields: [
                { name: "Status", value: "You already have a pending appeal" },
                { name: "Appeal ID", value: pendingAppeal.id },
                { name: "Submitted", value: new Date(pendingAppeal.submittedAt).toLocaleDateString() }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Create new appeal
      const appeal = await createAppeal({
        guildId: "global",
        userId: interaction.user.id,
        reason,
        moderatorsNote,
        targetGuildId: process.env.GUILD_ID || interaction.guildId || null,
        source: "command"
      });

      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Appeal Submitted",
            color: 0x51cf66,
            fields: [
              { name: "Appeal ID", value: appeal.id },
              { name: "Status", value: "Pending Review" },
              { name: "Submitted", value: new Date(appeal.submittedAt).toLocaleDateString() },
              { name: "Reason", value: reason }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });

      const targetGuildId = process.env.GUILD_ID || interaction.guildId || null;
      if (targetGuildId) {
        const guild =
          interaction.client.guilds.cache.get(targetGuildId) ||
          (await interaction.client.guilds.fetch(targetGuildId).catch(() => null));
        if (guild) {
          const appealEmbed = buildLogEmbed({
            title: "New Ban Appeal",
            color: 0x5865f2,
            fields: [
              { name: "Appeal ID", value: appeal.id },
              { name: "User", value: `${interaction.user.tag} (${interaction.user.id})` },
              { name: "Status", value: "Pending Review" },
              { name: "Reason", value: reason.slice(0, 1000) },
              {
                name: "Moderator Note",
                value: moderatorsNote ? moderatorsNote.slice(0, 500) : "No extra note provided"
              }
            ],
            footer: "Applications & Appeals"
          });
          await sendLogToChannel(guild, APPEAL_REVIEW_CHANNEL_ID, appealEmbed, {
            components: buildAppealReviewComponents(appeal.id)
          });
        }
      }

    } catch (error) {
      console.error("Appeal submission error:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Appeal Failed",
            color: 0xff6b6b,
            fields: [
              { name: "Error", value: "Failed to submit appeal. Please try again later." }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
