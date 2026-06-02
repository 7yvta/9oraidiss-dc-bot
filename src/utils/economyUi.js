const { EmbedBuilder } = require("discord.js");

const ECONOMY_COLOR = 0xffd000;
const SUCCESS_COLOR = 0x22c55e;
const FAIL_COLOR = 0xed4245;
const FOOTER = "Powered by Vault Economy";

function coins(value) {
  return `💰 ${Math.floor(Number(value || 0)).toLocaleString("en-US")}`;
}

function economyEmbed({
  title,
  description,
  color = ECONOMY_COLOR,
  fields = [],
  user,
  thumbnail = false,
  footer = FOOTER,
  timestamp = true
}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title);

  if (description) {
    embed.setDescription(description);
  }

  if (fields.length > 0) {
    embed.addFields(
      fields.map((field) => ({
        name: field.name,
        value: String(field.value ?? "-"),
        inline: Boolean(field.inline)
      }))
    );
  }

  if (thumbnail && user?.displayAvatarURL) {
    embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
  }

  if (footer) {
    embed.setFooter({ text: footer });
  }

  if (timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

module.exports = {
  ECONOMY_COLOR,
  SUCCESS_COLOR,
  FAIL_COLOR,
  FOOTER,
  coins,
  economyEmbed
};

