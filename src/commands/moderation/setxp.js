const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  getUserLevel,
  resolveLevelCap,
  setUserXp,
  totalXpForLevel,
  xpForNextLevel
} = require("../../utils/levelStore");
const { getGuildSettingsSync } = require("../../utils/guildSettings");
const { buildResultEmbed, buildLogEmbed, sendModLog } = require("../../utils/logger");
const { ensureRoleHasLevelSpecialPermissions } = require("../../utils/levelRolePermissions");

async function applyLevelRewards(member, level, settings) {
  if (!member || !Array.isArray(settings.levelRewards)) {
    return [];
  }

  const granted = [];
  for (const reward of settings.levelRewards) {
    if (!reward?.roleId || Number(reward.level) > level) {
      continue;
    }

    await ensureRoleHasLevelSpecialPermissions(member.guild, reward.roleId).catch(
      () => null
    );

    if (member.roles.cache.has(reward.roleId)) {
      continue;
    }

    await member.roles
      .add(reward.roleId, `Manual XP set reward sync at level ${level}`)
      .then(() => {
        granted.push(reward.roleId);
      })
      .catch(() => null);
  }

  return granted;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setlevel")
    .setDescription("Set a user's level")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to edit")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("level")
        .setDescription("Level to set")
        .setMinValue(0)
        .setMaxValue(5000)
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("xp_in_level")
        .setDescription("Optional progress XP inside that level")
        .setMinValue(0)
        .setMaxValue(5000000)
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user", true);
    const requestedLevel = interaction.options.getInteger("level", true);
    const requestedXpInLevel = interaction.options.getInteger("xp_in_level") || 0;
    const settings = getGuildSettingsSync(interaction.guild.id);
    const maxLevelCap = resolveLevelCap(settings.levelRewards, settings.levelMax);
    const targetLevel =
      maxLevelCap == null
        ? requestedLevel
        : Math.min(requestedLevel, maxLevelCap);

    const requiredForNext = xpForNextLevel(targetLevel);
    const xpInLevel = Math.min(
      Math.max(0, requestedXpInLevel),
      Math.max(0, requiredForNext - 1)
    );
    const totalXp = totalXpForLevel(targetLevel) + xpInLevel;

    const before = await getUserLevel({
      guildId: interaction.guild.id,
      userId: targetUser.id
    });

    const updated = await setUserXp({
      guildId: interaction.guild.id,
      userId: targetUser.id,
      totalXp,
      maxLevel: maxLevelCap
    });

    const member =
      interaction.guild.members.cache.get(targetUser.id) ||
      (await interaction.guild.members.fetch(targetUser.id).catch(() => null));
    const grantedRewards = await applyLevelRewards(
      member,
      updated.level,
      settings
    );

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "XP Updated",
          color: 0x57f287,
          fields: [
            { name: "User", value: `${targetUser} (${targetUser.id})` },
            { name: "Old Level", value: `${before.level}` },
            { name: "New Level", value: `${updated.level}` },
            { name: "XP In Level", value: `${updated.xp}/${updated.neededXp}` },
            { name: "Total XP", value: `${updated.totalXp}` },
            ...(maxLevelCap != null && requestedLevel > targetLevel
              ? [
                  {
                    name: "Level Cap Applied",
                    value: `Requested ${requestedLevel}, capped to ${targetLevel}.`
                  }
                ]
              : []),
            {
              name: "Granted Reward Roles",
              value:
                grantedRewards.length > 0
                  ? grantedRewards.map((roleId) => `<@&${roleId}>`).join(", ")
                  : "No new reward role."
            }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });

    const logEmbed = buildLogEmbed({
      title: "Level Set",
      color: 0x5865f2,
      fields: [
        { name: "Target", value: `${targetUser.tag} (${targetUser.id})` },
        { name: "Changed By", value: `${interaction.user.tag} (${interaction.user.id})` },
        { name: "Old Level", value: `${before.level}` },
        { name: "New Level", value: `${updated.level}` },
        { name: "XP In Level", value: `${updated.xp}/${updated.neededXp}` },
        { name: "Total XP", value: `${updated.totalXp}` }
      ],
      footer: "Level System"
    });

    await sendModLog(interaction.guild, logEmbed);
  }
};
