const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config");
const { buildResultEmbed } = require("../../utils/logger");

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function resolveBaseUrl() {
  const explicit =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    config.publicBaseUrl ||
    "";
  return trimTrailingSlash(explicit);
}

function resolveTermsUrl() {
  const explicit = String(process.env.TERMS_URL || "").trim();
  if (explicit) {
    return explicit;
  }
  const baseUrl = resolveBaseUrl();
  return baseUrl ? `${baseUrl}/terms` : "Not configured";
}

function resolvePrivacyUrl() {
  const explicit = String(process.env.PRIVACY_URL || "").trim();
  if (explicit) {
    return explicit;
  }
  const baseUrl = resolveBaseUrl();
  return baseUrl ? `${baseUrl}/privacy` : "Not configured";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("terms")
    .setDescription("Show Terms of Service and Privacy Policy links"),
  async execute(interaction) {
    const termsUrl = resolveTermsUrl();
    const privacyUrl = resolvePrivacyUrl();

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Legal Links",
          color: 0x5865f2,
          fields: [
            {
              name: "Terms of Service",
              value:
                termsUrl === "Not configured"
                  ? "Not configured."
                  : `[Open Terms](${termsUrl})`
            },
            {
              name: "Privacy Policy",
              value:
                privacyUrl === "Not configured"
                  ? "Not configured."
                  : `[Open Privacy Policy](${privacyUrl})`
            }
          ],
          footer: "Bot Legal"
        })
      ]
    });
  }
};
