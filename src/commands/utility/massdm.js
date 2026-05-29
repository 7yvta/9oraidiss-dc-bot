const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const { isOwner } = require("../../utils/ownerOnly");

const WAIT_MS = 1500;
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName("massdm")
    .setDescription("Mass DM all members with a role (Owner only)")
    .setDMPermission(false)
    .addRoleOption((option) => option.setName("role").setDescription("Role to DM").setRequired(true))
    .addStringOption((option) => option.setName("message").setDescription("Message to send").setRequired(true).setMaxLength(1500))
    .addStringOption((option) => option.setName("confirm").setDescription("Type CONFIRM to send").setRequired(true)),
  async execute(interaction) {
    if (!isOwner(interaction)) {
      await interaction.reply({ embeds: [buildResultEmbed({ title: "Owner Only", color: 0xed4245 })], flags: MessageFlags.Ephemeral });
      return;
    }
    const confirm = interaction.options.getString("confirm", true);
    if (confirm !== "CONFIRM") {
      await interaction.reply({ embeds: [buildResultEmbed({ title: "Confirmation Required", color: 0xed4245, description: "Type `CONFIRM` in the confirm option." })], flags: MessageFlags.Ephemeral });
      return;
    }
    const role = interaction.options.getRole("role", true);
    const text = interaction.options.getString("message", true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.guild.members.fetch().catch(() => null);
    const targets = role.members.filter((member) => !member.user.bot).map((member) => member);
    let sent = 0;
    let failed = 0;
    for (const member of targets) {
      const ok = await member.send(text).then(() => true).catch(() => false);
      if (ok) sent += 1; else failed += 1;
      await sleep(WAIT_MS);
    }
    await interaction.editReply({ embeds: [buildResultEmbed({ title: "Mass DM Complete", color: 0x57f287, fields: [
      { name: "Role", value: `${role}` },
      { name: "Sent", value: String(sent), inline: true },
      { name: "Failed", value: String(failed), inline: true }
    ], footer: "Owner Tools" })] });
  }
};
