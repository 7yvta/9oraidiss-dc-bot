const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("middleman")
    .setDescription("Post Vault middleman information")
    .setDMPermission(false),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xff6a00)
      .setTitle("Vault Middleman System (Hold Both Method)")
      .setDescription("Vault staff secures both sides before completing the trade.")
      .addFields(
        {
          name: "How it works",
          value: [
            "1. Open a Middleman ticket",
            "2. Both users join and confirm the deal",
            "3. Middleman staff verifies everything"
          ].join("\n")
        },
        {
          name: "Secure Process",
          value: [
            "4. Both users send items/payment to the middleman",
            "5. The middleman confirms receiving everything",
            "6. The middleman delivers each side to the correct user",
            "Trade completed safely with no risk"
          ].join("\n")
        },
        {
          name: "Important Rules",
          value: [
            "Do not send anything before the middleman says so",
            "Only send to official Vault middleman staff",
            "Stay inside the ticket",
            "No DMs for trade handling",
            "This method protects both sides from scams"
          ].join("\n")
        }
      )
      .setFooter({ text: "Vault Safe Trading Protocol" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
