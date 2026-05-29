const path = require("node:path");
const fs = require("node:fs");
const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("middleman")
    .setDescription("Post service information with rich style")
    .setDMPermission(false),

  async execute(interaction) {
    const imagePath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "assets",
      "middleman-flow.webp"
    );

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("ðŸ›¡ï¸ Service Team System (Hold Both Method)")
      .setDescription("Our service staff secures **BOTH** sides before completing the trade.")
      .addFields(
        {
          name: "ðŸ“Œ How it works",
          value: [
            "1. Open a **Service ticket** ðŸŽŸï¸",
            "2. Both users join and confirm the deal",
            "3. Service staff verifies everything"
          ].join("\n")
        },
        {
          name: "ðŸ”’ Secure Process",
          value: [
            "4. BOTH users send items/payment to the Service staff",
            "5. Service staff confirms receiving EVERYTHING",
            "6. Service staff delivers each side to the correct user",
            "âœ… Trade completed safely with no risk"
          ].join("\n")
        },
        {
          name: "âš ï¸ Important Rules",
          value: [
            "â€¢ Do NOT send anything before the MM says",
            "â€¢ Only send to the official service staff",
            "â€¢ Stay inside the ticket",
            "â€¢ No DMs allowed",
            "ðŸ” This method prevents scams from BOTH sides"
          ].join("\n")
        }
      )
      .setFooter({ text: "Safe Trading Protocol" })
      .setTimestamp();

    if (fs.existsSync(imagePath)) {
      await interaction.reply({
        files: [new AttachmentBuilder(imagePath, { name: "middleman-flow.webp" })],
        embeds: [embed]
      });
      return;
    }

    await interaction.reply({
      embeds: [embed]
    });
  }
};


