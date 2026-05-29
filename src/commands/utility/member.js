const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");

const onlineStates = new Set(["online", "idle", "dnd"]);

async function getMemberSnapshot(guild) {
  let totalMembers = Number(guild?.memberCount || guild?.members?.cache?.size || 0);
  let onlineMembers = 0;

  for (const member of guild.members.cache.values()) {
    if (onlineStates.has(String(member.presence?.status || "").toLowerCase())) {
      onlineMembers += 1;
    }
  }

  if (onlineMembers === 0 && guild.presences?.cache?.size) {
    onlineMembers = guild.presences.cache.filter((presence) =>
      onlineStates.has(String(presence?.status || "").toLowerCase())
    ).size;
  }

  if (onlineMembers === 0) {
    try {
      const fetchedGuild = await guild.fetch({ withCounts: true });
      if (Number.isFinite(Number(fetchedGuild.approximateMemberCount))) {
        totalMembers = Number(fetchedGuild.approximateMemberCount);
      }
      if (Number.isFinite(Number(fetchedGuild.approximatePresenceCount))) {
        onlineMembers = Number(fetchedGuild.approximatePresenceCount);
      }
    } catch {
      // Keep fallback counts.
    }
  }

  return {
    totalMembers: Math.max(0, Number(totalMembers || 0)),
    onlineMembers: Math.max(0, Number(onlineMembers || 0))
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("member")
    .setDescription("Show server total and online member counts"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const snapshot = await getMemberSnapshot(guild).catch(() => null);
    if (!snapshot) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Member Stats Failed",
            color: 0xed4245,
            fields: [{ name: "Reason", value: "Could not load member stats." }],
            footer: "Member Stats"
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Server Members",
          color: 0x5865f2,
          fields: [
            {
              name: "Total Members",
              value: new Intl.NumberFormat("en-US").format(snapshot.totalMembers),
              inline: true
            },
            {
              name: "Online Members",
              value: new Intl.NumberFormat("en-US").format(snapshot.onlineMembers),
              inline: true
            }
          ],
          footer: "Member Stats"
        })
      ]
    });
  }
};
