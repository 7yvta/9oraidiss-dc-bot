const { SlashCommandBuilder } = require("discord.js");
const { economyEmbed } = require("../../utils/economyUi");
const { fetchCryptoPrice, formatUsd } = require("../../utils/cryptoPrice");

module.exports = {
  data: new SlashCommandBuilder().setName("crypto").setDescription("Convert crypto to USD")
    .addStringOption((option) => option.setName("coin").setDescription("Coin").setRequired(true).addChoices({ name: "BTC", value: "btc" }, { name: "ETH", value: "eth" }, { name: "SOL", value: "sol" }, { name: "XMR", value: "xmr" }))
    .addNumberOption((option) => option.setName("amount").setDescription("Amount").setMinValue(0.00000001).setRequired(false)),
  async execute(interaction) {
    const coin = interaction.options.getString("coin", true);
    const amount = interaction.options.getNumber("amount") || 1;
    const price = await fetchCryptoPrice(coin);
    await interaction.reply({ embeds: [economyEmbed({ title: "?? Crypto Convert", description: `**${amount.toLocaleString("en-US")} ${coin.toUpperCase()}** = **${formatUsd(price.usd * amount)}**`, fields: [{ name: "Single Price", value: formatUsd(price.usd), inline: true }], footer: "Crypto Prices" })] });
  }
};
