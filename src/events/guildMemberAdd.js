const { Events } = require("discord.js");
const { buildLogEmbed, sendModLog } = require("../utils/logger");
const { resolveUsedInvite } = require("../utils/inviteTracker");
const { recordInviteJoin, getInviteStats } = require("../utils/inviteStore");
const { getGuildSettingsSync } = require("../utils/guildSettings");
const { syncTriggeredRolesForMember } = require("../utils/roleTriggerSync");
const { getAutoRoles, getGreetChannels } = require("../utils/vulcanGame");
const { enforceAppMemberRolePolicy } = require("../utils/memberRoleGuard");

const INVITE_REWARD_ROLE_ID = "1500183699529142482";
const INVITE_REWARD_THRESHOLD = 1;

function fillTemplate(template, values) {
  let output = String(template || "");
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, String(value ?? ""));
  }
  return output;
}

function toRelativeTimestamp(timestamp) {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "Unknown";
  }
  return `<t:${Math.floor(value / 1000)}:R>`;
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const settings = getGuildSettingsSync(member.guild.id);
    const extraAutoRoles = await getAutoRoles(member.guild.id).catch(() => []);
    const joinRoleIds = Array.from(
      new Set(
        [
          ...(!member.user?.bot && settings.autoMemberRoleEnabled !== false
            ? [settings.memberRoleId]
            : []),
          "1499840862417588225",
          "1499840816322187457",
          ...(Array.isArray(extraAutoRoles) ? extraAutoRoles : [])
        ].filter(Boolean)
      )
    );

    const assignedJoinRoleIds = [];
    const failedJoinRoleIds = [];

    for (const roleId of joinRoleIds) {
      if (member.roles.cache.has(roleId)) {
        continue;
      }

      try {
        await member.roles.add(roleId, "Auto role on member join");
        assignedJoinRoleIds.push(roleId);
      } catch (error) {
        console.error(`Auto role assign failed for ${roleId}:`, error);
        failedJoinRoleIds.push(roleId);
      }
    }

    const autoRoleStatus =
      assignedJoinRoleIds.length === 0 && failedJoinRoleIds.length === 0
        ? "No join roles configured"
        : [
            assignedJoinRoleIds.length > 0
              ? `Assigned: ${assignedJoinRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")}`
              : null,
            failedJoinRoleIds.length > 0
              ? `Failed: ${failedJoinRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")}`
              : null
          ]
            .filter(Boolean)
            .join(" | ");

    const triggerResult =
      (await syncTriggeredRolesForMember(
        member,
        "Automatic role trigger on member join"
      ).catch(() => null)) || {
        addedRoleIds: [],
        removedRoleIds: [],
        failedRoleIds: []
      };
    const appRolePolicyResult = await enforceAppMemberRolePolicy(
      member,
      settings,
      "App join policy: app accounts cannot keep member role"
    ).catch(() => ({
      removedRoleIds: [],
      addedRoleIds: [],
      failedRoleIds: []
    }));
    const triggerStatus = [
      triggerResult.addedRoleIds.length > 0
        ? `Added: ${triggerResult.addedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")}`
        : null,
      triggerResult.removedRoleIds?.length > 0
        ? `Removed: ${triggerResult.removedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")}`
        : null,
      triggerResult.failedRoleIds.length > 0
        ? `Failed: ${triggerResult.failedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")}`
        : null
    ]
      .filter(Boolean)
      .join(" | ") || "No trigger role changes";
    const appRolePolicyStatus = member.user?.bot
      ? [
          appRolePolicyResult.addedRoleIds.length > 0
            ? `Added: ${appRolePolicyResult.addedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")}`
            : null,
          appRolePolicyResult.removedRoleIds.length > 0
            ? `Removed: ${appRolePolicyResult.removedRoleIds
                .map((roleId) => `<@&${roleId}>`)
                .join(", ")}`
            : null,
          appRolePolicyResult.failedRoleIds.length > 0
            ? `Failed: ${appRolePolicyResult.failedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")}`
            : null
        ]
          .filter(Boolean)
          .join(" | ") || "No app role changes"
      : "Not an app account";

    const usedInvite = await resolveUsedInvite(member);
    let inviteRewardStatus = "No reward check";
    if (usedInvite?.inviterId && usedInvite.inviterId !== member.id) {
      await recordInviteJoin({
        guildId: member.guild.id,
        inviterId: usedInvite.inviterId,
        inviteeId: member.id,
        inviteCode: usedInvite.code
      }).catch(() => null);

      const inviterStats = await getInviteStats({
        guildId: member.guild.id,
        userId: usedInvite.inviterId
      }).catch(() => null);

      const inviterMember = await member.guild.members
        .fetch(usedInvite.inviterId)
        .catch(() => null);

      if (!inviterStats) {
        inviteRewardStatus = "Failed to read inviter stats";
      } else if (!inviterMember) {
        inviteRewardStatus = "Inviter not in guild";
      } else if (inviterStats.joins < INVITE_REWARD_THRESHOLD) {
        inviteRewardStatus = `Inviter has ${inviterStats.joins}/${INVITE_REWARD_THRESHOLD} invites`;
      } else if (inviterMember.roles.cache.has(INVITE_REWARD_ROLE_ID)) {
        inviteRewardStatus = `Inviter already has <@&${INVITE_REWARD_ROLE_ID}>`;
      } else {
        try {
          await inviterMember.roles.add(
            INVITE_REWARD_ROLE_ID,
            `Auto invite reward at ${INVITE_REWARD_THRESHOLD} invite(s)`
          );
          inviteRewardStatus = `Assigned <@&${INVITE_REWARD_ROLE_ID}> to <@${usedInvite.inviterId}>`;
        } catch {
          inviteRewardStatus = `Failed to assign <@&${INVITE_REWARD_ROLE_ID}>`;
        }
      }
    } else {
      inviteRewardStatus = "No valid inviter found";
    }

    if (settings.welcomeEnabled && settings.welcomeChannelId) {
      const welcomeChannel = member.guild.channels.cache.get(settings.welcomeChannelId);
      if (welcomeChannel?.isTextBased()) {
        const inviterMention = usedInvite?.inviterId
          ? `<@${usedInvite.inviterId}>`
          : "Unknown";
        const rulesChannelMention = settings.rulesChannelId
          ? `<#${settings.rulesChannelId}>`
          : `<#${settings.welcomeChannelId}>`;
        const welcomeText = fillTemplate(settings.welcomeMessageTemplate, {
          userMention: `${member}`,
          userTag: member.user.tag,
          userId: member.id,
          guildName: member.guild.name,
          guildId: member.guild.id,
          inviterMention,
          rulesChannelMention,
          welcomeChannelMention: `<#${settings.welcomeChannelId}>`,
          memberCount: member.guild.memberCount
        });

        const welcomeEmbed = buildLogEmbed({
          title: "👋 Welcome!",
          color: 0x57f287,
          description: `${member} has joined **${member.guild.name}**.`,
          fields: [
            { name: "🏷 Username", value: member.user.username, inline: true },
            { name: "🆔 User ID", value: member.id, inline: true },
            { name: "📅 Account Created", value: toRelativeTimestamp(member.user.createdTimestamp) },
            { name: "📨 Invited By", value: inviterMention, inline: true },
            { name: "📘 Rules", value: rulesChannelMention, inline: true }
          ],
          footer: `Member #${member.guild.memberCount} • ${member.guild.name}`
        })
          .setThumbnail(
            member.user.displayAvatarURL({
              extension: "png",
              size: 512,
              forceStatic: false
            })
          );

        await welcomeChannel
          .send({
            content: welcomeText.slice(0, 350),
            embeds: [welcomeEmbed]
          })
          .catch(() => null);
      }
    }

    const greetChannels = await getGreetChannels(member.guild.id).catch(() => []);
    if (Array.isArray(greetChannels) && greetChannels.length > 0) {
      for (const channelId of greetChannels) {
        const greetChannel =
          member.guild.channels.cache.get(channelId) ||
          (await member.guild.channels.fetch(channelId).catch(() => null));
        if (!greetChannel?.isTextBased?.() || !greetChannel?.isSendable?.()) {
          continue;
        }
        await greetChannel
          .send(`Welcome ${member} to **${member.guild.name}**.`)
          .catch(() => null);
      }
    }

    const inviteFields = usedInvite
      ? [
          { name: "Invited By", value: usedInvite.inviterId ? `<@${usedInvite.inviterId}>` : "Unknown" },
          { name: "Invite Code", value: usedInvite.code ? `\`${usedInvite.code}\`` : "Unknown" }
        ]
      : [{ name: "Invited By", value: "Unknown / Vanity / Expired invite" }];

    const embed = buildLogEmbed({
      title: "Member Joined",
      color: 0x57f287,
      fields: [
        { name: "User", value: `${member.user.tag} (${member.id})` },
        { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` },
        { name: "Auto Role", value: autoRoleStatus },
        { name: "Trigger Roles", value: triggerStatus },
        { name: "App Role Policy", value: appRolePolicyStatus },
        { name: "Invite Reward", value: inviteRewardStatus },
        ...inviteFields
      ]
    });

    await sendModLog(member.guild, embed);
  }
};
