const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tos")
    .setDescription("Post middleman terms of service")
    .setDMPermission(false),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📋 Middleman Terms of Service")
      .setDescription(
        [
          "**1. 🚫 No Refunds Once Confirmed**",
          "Once trade is confirmed, it is final.",
          "",
          "**2. 📸 Proof May Be Required**",
          "Valid screenshots or videos may be requested.",
          "",
          "**3. ⚖️ No Illegal Items**",
          "No stolen accounts, NSFW, or illegal goods.",
          "",
          "**4. ⏰ Be Ready**",
          "Both parties must be ready or trade may be canceled.",
          "",
          "**5. 🛡️ Scams and Disputes**",
          "Report to the support system immediately.",
          "",
          "**6. 💰 Fees**",
          "Middleman service fee applies if configured by staff.",
          "",
          "**7. ✅ Agreement**",
          "Using this service means you agree to these terms."
        ].join("\n")
      )
      .setFooter({ text: "Powered by Vault Middleman Service" })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
  }
};

