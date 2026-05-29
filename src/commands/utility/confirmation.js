const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  createTrade,
  buildTradeButtons,
  buildTradeEmbed
} = require("../../utils/tradeConfirmationStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("confirmation")
    .setDescription("Create a two-user trade confirmation")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user1").setDescription("First user in the trade").setRequired(true)
    )
    .addUserOption((option) =>
      option.setName("user2").setDescription("Second user in the trade").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("info")
        .setDescription("Trade details/info")
        .setRequired(true)
        .setMaxLength(1000)
    ),

  async execute(interaction) {
    const user1 = interaction.options.getUser("user1", true);
    const user2 = interaction.options.getUser("user2", true);
    const info = interaction.options.getString("info", true);

    if (user1.id === user2.id) {
      await interaction.reply({
        content: "User1 and User2 must be different users.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (user1.bot || user2.bot) {
      await interaction.reply({
        content: "You cannot create a trade confirmation with bot accounts.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      content: `Trade confirmation opened for ${user1} and ${user2}.`,
      flags: MessageFlags.Ephemeral
    });

    const message = await interaction.channel.send({
      content: `${user1} ${user2}`,
      embeds: [
        buildTradeEmbed({
          user1Id: user1.id,
          user2Id: user2.id,
          info,
          creatorId: interaction.user.id,
          confirmedBy: {}
        })
      ]
    });

    const trade = createTrade({
      messageId: message.id,
      channelId: message.channel.id,
      guildId: interaction.guild.id,
      creatorId: interaction.user.id,
      user1Id: user1.id,
      user2Id: user2.id,
      info
    });

    await message.edit({
      embeds: [buildTradeEmbed(trade)],
      components: buildTradeButtons(trade)
    });
  }
};
