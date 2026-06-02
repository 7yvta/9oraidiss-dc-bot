const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketruls")
    .setDescription("Post ticket rules in rich format")
    .setDMPermission(false),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("?? Ticket Rules")
      .setDescription(
        "Welcome to our ticket system. Follow these rules so staff can help you faster."
      )
      .addFields(
        {
          name: "Be Respectful",
          value:
            "Always be polite to staff and members. Rude behavior can lead to ticket closure."
        },
        {
          name: "One Issue per Ticket",
          value:
            "Open a separate ticket for each problem, trade, or role request."
        },
        {
          name: "Clear Information",
          value:
            "Provide complete details and screenshots/links when needed."
        },
        {
          name: "No Spam or Self-Promotion",
          value:
            "Spamming or advertising servers/accounts is not allowed."
        },
        {
          name: "Follow Staff Instructions",
          value:
            "Staff may ask for verification or additional details. Please cooperate."
        },
        {
          name: "Middleman/Trade Tickets",
          value:
            "Both parties must confirm before completion. Middleman staff will not complete trades without agreement."
        },
        {
          name: "Role Requests",
          value:
            "Only request roles you are eligible for. Some roles require Manager/Admin approval."
        },
        {
          name: "Ticket Closure",
          value:
            "Ticket closes when resolved. Reopen/create a new one if another issue appears."
        }
      )
      .setFooter({
        text: "Tip: Be patient and provide all details clearly for faster support."
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
  }
};


