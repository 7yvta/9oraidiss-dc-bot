const { SlashCommandBuilder } = require("discord.js");
const { economyEmbed } = require("../../utils/economyUi");
const answers = ["Yes.", "No.", "Maybe.", "Probably.", "Not today.", "100%.", "Ask again later.", "Looks good.", "Bad idea."];
module.exports = {
  data: new SlashCommandBuilder().setName("8ball").setDescription("Ask the magic 8ball")
    .addStringOption((option) => option.setName("question").setDescription("Your question").setRequired(true)),
  async execute(interaction) {
    await interaction.reply({ embeds: [economyEmbed({ title: "?? 8ball", color: 0x2b2d31, fields: [
      { name: "Question", value: interaction.options.getString("question", true).slice(0, 500) },
      { name: "Answer", value: answers[Math.floor(Math.random() * answers.length)] }
    ], footer: "Fun" })] });
  }
};
