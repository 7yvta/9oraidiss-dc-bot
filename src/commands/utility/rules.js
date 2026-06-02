const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Post server rules in rich format")
    .setDMPermission(false),

  async execute(interaction) {
    const embed1 = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("?? Server Rules & Guidelines")
      .setDescription("Follow these rules to keep the server safe and fair.")
      .addFields(
        {
          name: "1) Respect Everyone",
          value:
            "No harassment, bullying, hate speech, or personal attacks. Respect keeps the server fun for everyone."
        },
        {
          name: "2) Keep Content Appropriate",
          value:
            "No NSFW or highly offensive content. Usernames, profile pictures, and messages must remain community-safe."
        },
        {
          name: "3) No Spam",
          value:
            "No flood messages, mass emojis, repeated pings, or copy-paste spam."
        },
        {
          name: "4) Trading & Middleman Team",
          value:
            "All trades must use verified middleman staff. Never send items, Robux, or accounts before staff confirms."
        },
        {
          name: "5) Self-Promotion",
          value:
            "Only post promotions in allowed channels. DM advertising members is not allowed."
        }
      )
      .setFooter({ text: "Rule violations may lead to warnings, timeout, or ban." })
      .setTimestamp();

    const embed2 = new EmbedBuilder()
      .setColor(0x5865f2)
      .addFields(
        {
          name: "6) Tickets & Support",
          value:
            "Use tickets for help/trades and provide full info (usernames, details, evidence) to avoid delays."
        },
        {
          name: "7) Follow Discord ToS",
          value:
            "Any ToS-breaking behavior may lead to immediate removal from the server."
        },
        {
          name: "8) Voice Chat Etiquette",
          value:
            "No mic spam, excessive noise, or disruption. Be respectful in voice channels."
        },
        {
          name: "9) Security Reminder",
          value:
            "Never share sensitive account information. Staff never asks for your password."
        }
      )
      .setFooter({ text: "Stay safe and enjoy the server." })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed1, embed2],
      allowedMentions: { parse: [] }
    });
  }
};


