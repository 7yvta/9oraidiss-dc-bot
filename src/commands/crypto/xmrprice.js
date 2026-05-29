const { SlashCommandBuilder } = require("discord.js");
const { economyEmbed } = require("../../utils/economyUi");
const { fetchCryptoPrice, formatUsd } = require("../../utils/cryptoPrice");
module.exports = {
  data: new SlashCommandBuilder().setName("xmrprice").setDescription("Live XMR price, 24h change, and market cap"),
  async execute(interaction) {
    const price = await fetchCryptoPrice("xmr");
    await interaction.reply({ embeds: [economyEmbed({ title: "? Monero Price", fields: [
      { name: "?? Price", value: formatUsd(price.usd), inline: true },
      { name: "?? 24h", value: `${Number(price.usd_24h_change || 0).toFixed(2)}%`, inline: true },
      { name: "?? Market Cap", value: formatUsd(price.usd_market_cap), inline: true }
    ], footer: "Crypto Prices" })] });
  }
};
