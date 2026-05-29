const { Events, AuditLogEvent } = require("discord.js");
const { setTimeout: delay } = require("node:timers/promises");
const { buildLogEmbed, sendModLog, sendServerUpdate } = require("../utils/logger");
const { getGuildSettingsSync } = require("../utils/guildSettings");
const { addXp, resolveLevelCap } = require("../utils/levelStore");
const { runOnce } = require("../utils/idempotency");
const {
  canRemoveProtectedMemberRole,
  consumeApprovedProtectedMemberRoleRemoval,
  enforceAppMemberRolePolicy,
  isProtectedMemberRole,
  isStickyMemberRole,
  SELF_ASSIGNED_BLOCKED_ROLE_IDS,
  STICKY_MEMBER_ROLE_IDS,
  PROTECTED_MEMBER_ROLE_REMOVER_ROLE_IDS
} = require("../utils/memberRoleGuard");
const { sendTimeoutDM, sendUnmuteDM } = require("../utils/dmHelper");
const {
  ROLE_TRIGGER_RULES,
  syncTriggeredRolesForMember
} = require("../utils/roleTriggerSync");
const { hasRecentAction, markRecentAction } = require("../utils/actionDeduper");
const SERVER_BOOST_REWARD_ROLE_ID = "1483496153260625982";
const SERVER_BOOST_BONUS_XP = 250;
const SERVER_BOOST_XP_MULTIPLIER = 2;
const AUTO_TRIGGER_TARGET_ROLE_IDS = new Set(
  (Array.isArray(ROLE_TRIGGER_RULES) ? ROLE_TRIGGER_RULES : [])
    .flatMap((rule) => (Array.isArray(rule?.targetRoleIds) ? rule.targetRoleIds : []))
    .map((roleId) => String(roleId || "").trim())
    .filter(Boolean)
);

function isServerBooster(member) {
  return Boolean(member?.premiumSinceTimestamp || member?.premiumSince);
}

async function syncServerBoostRewardRole(member, shouldHaveRole) {
  const roleId = String(SERVER_BOOST_REWARD_ROLE_ID || "").trim();
  if (!roleId || member?.user?.bot) {
    return { action: null };
  }

  const hasRole = member.roles.cache.has(roleId);
  if (shouldHaveRole && hasRole) {
    return { action: null };
  }
  if (!shouldHaveRole && !hasRole) {
    return { action: null };
  }

  const role =
    member.guild.roles.cache.get(roleId) ||
    (await member.guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    return { action: null };
  }

  if (shouldHaveRole) {
    const added = await member.roles
      .add(role, "Server boost reward role assigned automatically")
      .then(() => true)
      .catch(() => false);
    return { action: added ? "added" : null };
  }

  const removed = await member.roles
    .remove(role, "Server boost reward role removed automatically (boost ended)")
    .then(() => true)
    .catch(() => false);
  return { action: removed ? "removed" : null };
}

async function findMemberUpdateEntry(guild, userId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberUpdate,
      limit: 8
    });
    const now = Date.now();
    return logs.entries.find((entry) => {
      const targetId = entry.target?.id;
      const createdAt = entry.createdTimestamp || 0;
      const hasTimeoutChange = Array.isArray(entry.changes)
        ? entry.changes.some(
            (change) => change.key === "communication_disabled_until"
          )
        : false;
      return targetId === userId && hasTimeoutChange && now - createdAt < 15000;
    });
  } catch {
    return null;
  }
}

function normalizeRoleIdList(roleIds) {
  return new Set(
    (Array.isArray(roleIds) ? roleIds : [])
      .map((roleId) => String(roleId || "").trim())
      .filter(Boolean)
  );
}

function extractRoleIdsFromAuditChange(entry, key) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const targetChange = changes.find((change) => change.key === key);
  if (!targetChange) {
    return [];
  }

  const values = Array.isArray(targetChange.new)
    ? targetChange.new
    : Array.isArray(targetChange.old)
      ? targetChange.old
      : [];

  return values
    .map((value) => String(value?.id || value || "").trim())
    .filter(Boolean);
}

function hasRoleIntersection(leftSet, rightIds) {
  if (!leftSet || leftSet.size === 0 || !Array.isArray(rightIds) || rightIds.length === 0) {
    return false;
  }
  return rightIds.some((roleId) => leftSet.has(String(roleId)));
}

async function findMemberRoleUpdateEntry(guild, userId, expectedAddedRoleIds = [], expectedRemovedRoleIds = []) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberRoleUpdate,
      limit: 12
    });
    const now = Date.now();
    const expectedAddedSet = normalizeRoleIdList(expectedAddedRoleIds);
    const expectedRemovedSet = normalizeRoleIdList(expectedRemovedRoleIds);
    const candidates = logs.entries.filter((entry) => {
      const targetId = entry.target?.id;
      const createdAt = entry.createdTimestamp || 0;
      const hasRoleChange = Array.isArray(entry.changes)
        ? entry.changes.some(
            (change) => change.key === "$add" || change.key === "$remove" || change.key === "roles"
          )
        : false;
      return targetId === userId && hasRoleChange && now - createdAt < 30000;
    });

    if (candidates.length === 0) {
      return null;
    }

    const scored = candidates.map((entry) => {
      const executorId = entry.executor?.id || "";
      const addedIds = extractRoleIdsFromAuditChange(entry, "$add");
      const removedIds = extractRoleIdsFromAuditChange(entry, "$remove");

      const addedMatch =
        expectedAddedSet.size === 0 ||
        hasRoleIntersection(expectedAddedSet, addedIds);
      const removedMatch =
        expectedRemovedSet.size === 0 ||
        hasRoleIntersection(expectedRemovedSet, removedIds);
      const roleMatchScore = addedMatch && removedMatch ? 1 : 0;
      const selfExecutorScore = executorId && executorId === userId ? 1 : 0;
      const recencyScore = Number(entry.createdTimestamp || 0);

      return {
        entry,
        roleMatchScore,
        selfExecutorScore,
        recencyScore
      };
    });

    scored.sort((a, b) => {
      if (b.selfExecutorScore !== a.selfExecutorScore) {
        return b.selfExecutorScore - a.selfExecutorScore;
      }
      if (b.roleMatchScore !== a.roleMatchScore) {
        return b.roleMatchScore - a.roleMatchScore;
      }
      return b.recencyScore - a.recencyScore;
    });

    return scored[0].entry || null;
  } catch {
    return null;
  }
}

function didRolesChange(oldMember, newMember) {
  if (!oldMember?.roles?.cache || !newMember?.roles?.cache) {
    // If either cache is unavailable, treat it as changed and run trigger sync.
    return true;
  }

  if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
    return true;
  }

  for (const roleId of oldMember.roles.cache.keys()) {
    if (!newMember.roles.cache.has(roleId)) {
      return true;
    }
  }

  return false;
}

function getRoleChanges(oldMember, newMember) {
  if (!oldMember?.roles?.cache || !newMember?.roles?.cache) {
    return { reliable: false, addedRoles: [], removedRoles: [] };
  }

  const everyoneRoleId = newMember.guild?.roles?.everyone?.id;
  const oldRoles = oldMember.roles.cache.filter((role) => role.id !== everyoneRoleId);
  const newRoles = newMember.roles.cache.filter((role) => role.id !== everyoneRoleId);

  const addedRoles = newRoles.filter((role) => !oldRoles.has(role.id));
  const removedRoles = oldRoles.filter((role) => !newRoles.has(role.id));

  return {
    reliable: true,
    addedRoles: Array.from(addedRoles.values()),
    removedRoles: Array.from(removedRoles.values())
  };
}

function formatRoleList(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return "None";
  }

  const preview = roles.slice(0, 12).map((role) => `<@&${role.id}> (\`${role.id}\`)`);
  if (roles.length > preview.length) {
    preview.push(`... +${roles.length - preview.length} more`);
  }

  return preview.join("\n");
}

function buildRoleChangeFingerprint(memberId, addedRoles, removedRoles) {
  const added = (Array.isArray(addedRoles) ? addedRoles : [])
    .map((role) => role.id)
    .sort()
    .join(",");
  const removed = (Array.isArray(removedRoles) ? removedRoles : [])
    .map((role) => role.id)
    .sort()
    .join(",");
  return `${memberId}|a:${added}|r:${removed}`;
}

function isRoleChangeOnlyFromAutoManagedRoles(roleChanges, settings) {
  const changedRoleIds = [
    ...(Array.isArray(roleChanges?.addedRoles) ? roleChanges.addedRoles : []),
    ...(Array.isArray(roleChanges?.removedRoles) ? roleChanges.removedRoles : [])
  ]
    .map((role) => String(role?.id || "").trim())
    .filter(Boolean);

  if (changedRoleIds.length === 0) {
    return false;
  }

  const managedRoleIds = new Set(AUTO_TRIGGER_TARGET_ROLE_IDS);
  if (settings?.memberRoleId) {
    managedRoleIds.add(String(settings.memberRoleId));
  }
  for (const stickyRoleId of STICKY_MEMBER_ROLE_IDS) {
    managedRoleIds.add(String(stickyRoleId));
  }

  return changedRoleIds.every((roleId) => managedRoleIds.has(roleId));
}

function getStickyRoleIdsToEnforce(settings, member) {
  if (member?.user?.bot || settings?.stickyMemberRoleEnabled === false) {
    return [];
  }
  const stickyRoleIds = new Set(STICKY_MEMBER_ROLE_IDS.map((roleId) => String(roleId)));
  if (settings?.memberRoleId) {
    stickyRoleIds.add(String(settings.memberRoleId));
  }
  return Array.from(stickyRoleIds).filter(Boolean);
}

async function enforceStickyRoles(member, settings, reason) {
  const restoredRoleIds = [];
  const failedRoleIds = [];
  for (const roleId of getStickyRoleIdsToEnforce(settings, member)) {
    if (!roleId || member.roles.cache.has(roleId)) {
      continue;
    }

    const role =
      member.guild.roles.cache.get(roleId) ||
      (await member.guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      failedRoleIds.push(roleId);
      continue;
    }

    const restored = await member.roles
      .add(role, reason)
      .then(() => true)
      .catch(() => false);
    if (restored) {
      restoredRoleIds.push(roleId);
    } else {
      failedRoleIds.push(roleId);
    }
  }

  return { restoredRoleIds, failedRoleIds };
}

async function getExecutorMember(guild, entry) {
  const executorId = entry?.executor?.id;
  if (!executorId) {
    return null;
  }
  return guild.members.fetch(executorId).catch(() => null);
}

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const settings = getGuildSettingsSync(newMember.guild.id);
    const timeoutBefore = oldMember.communicationDisabledUntilTimestamp || null;
    const timeoutAfter = newMember.communicationDisabledUntilTimestamp || null;
    const timeoutChanged = timeoutBefore !== timeoutAfter;
    const rolesChanged = didRolesChange(oldMember, newMember);
    const boostBefore = oldMember.premiumSinceTimestamp || null;
    const boostAfter = newMember.premiumSinceTimestamp || null;
    const boostChanged = boostBefore !== boostAfter;
    const boosterNow = isServerBooster(newMember);

    if (!timeoutChanged && !rolesChanged && !boostChanged) {
      return;
    }

    if (boostChanged || rolesChanged) {
      await syncServerBoostRewardRole(newMember, boosterNow).catch(() => ({ action: null }));
    }

    if (boostChanged && boosterNow && !newMember.user?.bot) {
      const boostSessionId = String(boostAfter || Date.now());
      const rewardKey = `${newMember.guild.id}:${newMember.id}:${boostSessionId}`;
      const rewardResult = await runOnce({
        scope: "server_boost_bonus_xp",
        key: rewardKey,
        ttlMs: 1000 * 60 * 60 * 24 * 365,
        action: async () => {
          const maxLevel = resolveLevelCap(settings.levelRewards, settings.levelMax);
          return addXp({
            guildId: newMember.guild.id,
            userId: newMember.id,
            amount: SERVER_BOOST_BONUS_XP,
            maxLevel
          });
        }
      }).catch(() => ({ skipped: true }));

      if (!rewardResult?.skipped) {
        const boostRewardEmbed = buildLogEmbed({
          title: "Server Boost Rewards Applied",
          color: 0x57f287,
          footer: "Boost Rewards",
          fields: [
            { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
            {
              name: "Reward Role",
              value: `<@&${SERVER_BOOST_REWARD_ROLE_ID}>`
            },
            {
              name: "Bonus XP",
              value: `+${SERVER_BOOST_BONUS_XP} XP`
            },
            {
              name: "Active Booster Multiplier",
              value: `${SERVER_BOOST_XP_MULTIPLIER}x message XP while boosting`
            }
          ]
        });
        await sendServerUpdate(newMember.guild, boostRewardEmbed);
      }
    }

    if (rolesChanged) {
      const isAppAccount = Boolean(newMember.user?.bot);

      const appPolicyResult = await enforceAppMemberRolePolicy(
        newMember,
        settings,
        "App role policy: app accounts cannot keep member role"
      ).catch(() => ({
        removedRoleIds: [],
        addedRoleIds: [],
        failedRoleIds: []
      }));

      if (
        isAppAccount &&
        (appPolicyResult.addedRoleIds.length > 0 ||
          appPolicyResult.removedRoleIds.length > 0 ||
          appPolicyResult.failedRoleIds.length > 0)
      ) {
        const appPolicyEmbed = buildLogEmbed({
          title: "App Role Policy Applied",
          color: appPolicyResult.failedRoleIds.length > 0 ? 0xfaa61a : 0x57f287,
          footer: "Role Protection",
          fields: [
            { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
            {
              name: "Added Roles",
              value:
                appPolicyResult.addedRoleIds.length > 0
                  ? appPolicyResult.addedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")
                  : "None"
            },
            {
              name: "Removed Roles",
              value:
                appPolicyResult.removedRoleIds.length > 0
                  ? appPolicyResult.removedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")
                  : "None"
            },
            {
              name: "Failed Roles",
              value:
                appPolicyResult.failedRoleIds.length > 0
                  ? appPolicyResult.failedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")
                  : "None"
            }
          ]
        });
        await sendServerUpdate(newMember.guild, appPolicyEmbed);
      }

      const roleChanges = getRoleChanges(oldMember, newMember);
      if (roleChanges.reliable && (roleChanges.addedRoles.length > 0 || roleChanges.removedRoles.length > 0)) {
        const addedRoleIds = roleChanges.addedRoles.map((role) => role.id);
        const removedRoleIds = roleChanges.removedRoles.map((role) => role.id);
        const removedStickyRole = isAppAccount
          ? null
          : roleChanges.removedRoles.find((role) =>
              isStickyMemberRole(role.id, settings)
            );
        const removedProtectedRole = isAppAccount
          ? null
          : roleChanges.removedRoles.find((role) =>
              isProtectedMemberRole(role.id, settings)
            );

        let roleEntry = null;
        const expectsSelfCheck = addedRoleIds.length > 0;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          if (attempt > 0) {
            await delay(1100).catch(() => null);
          }
          roleEntry = await findMemberRoleUpdateEntry(
            newMember.guild,
            newMember.id,
            addedRoleIds,
            removedRoleIds
          );
          if (!roleEntry) {
            continue;
          }
          if (!expectsSelfCheck || roleEntry.executor?.id === newMember.id || attempt >= 4) {
            break;
          }
        }

        const executorMember = await getExecutorMember(newMember.guild, roleEntry);
        const selfAssignedBlockedRole = isAppAccount
          ? null
          : roleChanges.addedRoles.find((role) =>
              SELF_ASSIGNED_BLOCKED_ROLE_IDS.includes(String(role.id))
            );

        if (selfAssignedBlockedRole && roleEntry?.executor?.id === newMember.id) {
          const roleToRemove =
            newMember.guild.roles.cache.get(selfAssignedBlockedRole.id) ||
            (await newMember.guild.roles.fetch(selfAssignedBlockedRole.id).catch(() => null));

          let removed = false;
          if (roleToRemove) {
            const removeFingerprint = buildRoleChangeFingerprint(
              newMember.id,
              [],
              [selfAssignedBlockedRole]
            );
            markRecentAction(
              "role_change_log_suppress",
              newMember.guild.id,
              removeFingerprint,
              20000
            );
            removed = await newMember.roles
              .remove(
                roleToRemove,
                "Self-assigned blocked role removed automatically"
              )
              .then(() => true)
              .catch(() => false);
          }

          const blockedSelfRoleEmbed = buildLogEmbed({
            title: "Self Role Assignment Blocked",
            color: 0xed4245,
            footer: "Role Protection",
            fields: [
              { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
              { name: "Role", value: `<@&${selfAssignedBlockedRole.id}> (\`${selfAssignedBlockedRole.id}\`)` },
              { name: "Removed", value: removed ? "Yes" : "No" },
              {
                name: "Reason",
                value: "This role cannot be self-assigned."
              }
            ]
          });

          await sendServerUpdate(newMember.guild, blockedSelfRoleEmbed);
        }

        if (removedStickyRole) {
          consumeApprovedProtectedMemberRoleRemoval({
            guildId: newMember.guild.id,
            memberId: newMember.id
          });

          const roleToRestore =
            newMember.guild.roles.cache.get(removedStickyRole.id) ||
            (await newMember.guild.roles.fetch(removedStickyRole.id).catch(() => null));

          let restored = false;
          if (roleToRestore) {
            restored = await newMember.roles
              .add(
                roleToRestore,
                "Sticky member role auto-restored after removal"
              )
              .then(() => true)
              .catch(() => false);
          }

          const stickyEmbed = buildLogEmbed({
            title: "Sticky Member Role Auto-Restored",
            color: 0xed4245,
            footer: "Role Protection",
            fields: [
              { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
              {
                name: "Changed By",
                value: roleEntry?.executor
                  ? `${roleEntry.executor.tag} (${roleEntry.executor.id})`
                  : "Unknown"
              },
              { name: "Role", value: `<@&${removedStickyRole.id}> (\`${removedStickyRole.id}\`)` },
              {
                name: "Sticky Roles",
                value: STICKY_MEMBER_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(", ")
              },
              { name: "Restored", value: restored ? "Yes" : "No" },
              { name: "Reason", value: roleEntry?.reason || "No reason provided" }
            ]
          });

          await sendServerUpdate(newMember.guild, stickyEmbed);
        } else if (removedProtectedRole) {
          const approvedByCommand = consumeApprovedProtectedMemberRoleRemoval({
            guildId: newMember.guild.id,
            memberId: newMember.id
          });
          const hasRoleAccess = canRemoveProtectedMemberRole(executorMember);
          const authorizedRemoval = approvedByCommand || hasRoleAccess;

          if (!authorizedRemoval) {
            const roleToRestore =
              newMember.guild.roles.cache.get(removedProtectedRole.id) ||
              (await newMember.guild.roles.fetch(removedProtectedRole.id).catch(() => null));

            let restored = false;
            if (roleToRestore) {
              restored = await newMember.roles
                .add(
                  roleToRestore,
                  "Protected member role removal blocked: unauthorized staff role"
                )
                .then(() => true)
                .catch(() => false);
            }

            const blockedEmbed = buildLogEmbed({
              title: "Protected Member Role Removal Blocked",
              color: 0xed4245,
              footer: "Role Protection",
              fields: [
                { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
                {
                  name: "Changed By",
                  value: roleEntry?.executor
                    ? `${roleEntry.executor.tag} (${roleEntry.executor.id})`
                    : "Unknown"
                },
                { name: "Role", value: `<@&${removedProtectedRole.id}> (\`${removedProtectedRole.id}\`)` },
                {
                  name: "Allowed Roles",
                  value: PROTECTED_MEMBER_ROLE_REMOVER_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(", ")
                },
                { name: "Restored", value: restored ? "Yes" : "No" },
                { name: "Reason", value: roleEntry?.reason || "No reason provided" }
              ]
            });

            await sendServerUpdate(newMember.guild, blockedEmbed);
          }
        }

        const roleChangeKey = buildRoleChangeFingerprint(
          newMember.id,
          roleChanges.addedRoles,
          roleChanges.removedRoles
        );
        const suppressedByCommand = hasRecentAction(
          "role_change_log_suppress",
          newMember.guild.id,
          roleChangeKey
        );
        const hasExecutor = Boolean(roleEntry?.executor);
        const executorIsBot = roleEntry?.executor?.id === newMember.client.user.id;
        const skipBotManagedOnlyChange =
          executorIsBot && isRoleChangeOnlyFromAutoManagedRoles(roleChanges, settings);
        const duplicateAny = hasRecentAction(
          "member_role_log_any",
          newMember.guild.id,
          roleChangeKey
        );
        const duplicateKnown = hasRecentAction(
          "member_role_log_known",
          newMember.guild.id,
          roleChangeKey
        );

        const shouldLogRoleUpdate =
          !suppressedByCommand &&
          !skipBotManagedOnlyChange &&
          (!duplicateAny || (hasExecutor && !duplicateKnown));

        if (shouldLogRoleUpdate) {
          markRecentAction(
            "member_role_log_any",
            newMember.guild.id,
            roleChangeKey,
            20000
          );
          if (hasExecutor) {
            markRecentAction(
              "member_role_log_known",
              newMember.guild.id,
              roleChangeKey,
              20000
            );
          }

          const roleEmbed = buildLogEmbed({
            title: "Member Roles Updated",
            color: 0x5865f2,
            footer: "Role Update Log",
            fields: [
              { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
              {
                name: "Changed By",
                value: roleEntry?.executor
                  ? `${roleEntry.executor.tag} (${roleEntry.executor.id})`
                  : "Unknown"
              },
              { name: "Added Roles", value: formatRoleList(roleChanges.addedRoles) },
              { name: "Removed Roles", value: formatRoleList(roleChanges.removedRoles) },
              { name: "Reason", value: roleEntry?.reason || "No reason provided" }
            ]
          });

          await sendServerUpdate(newMember.guild, roleEmbed);
        }
      }

      const stickySync = await enforceStickyRoles(
        newMember,
        settings,
        "Sticky member role enforcement: role cannot be removed"
      );
      if (stickySync.restoredRoleIds.length > 0 || stickySync.failedRoleIds.length > 0) {
        const stickyEnforceEmbed = buildLogEmbed({
          title: "Sticky Member Role Enforcement",
          color: stickySync.failedRoleIds.length > 0 ? 0xed4245 : 0x57f287,
          footer: "Role Protection",
          fields: [
            { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
            {
              name: "Restored Roles",
              value:
                stickySync.restoredRoleIds.length > 0
                  ? stickySync.restoredRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")
                  : "None"
            },
            {
              name: "Failed Roles",
              value:
                stickySync.failedRoleIds.length > 0
                  ? stickySync.failedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")
                  : "None"
            },
            {
              name: "Reason",
              value: "Configured sticky member role cannot be removed."
            }
          ]
        });
        await sendServerUpdate(newMember.guild, stickyEnforceEmbed);
      }

      // Final reconciliation pass ensures trigger removals/additions follow the final role state
      // after sticky/protected/self-role enforcement adjustments.
      const latestMember =
        (await newMember.guild.members.fetch(newMember.id).catch(() => null)) ||
        newMember;
      const finalTriggerResult = await syncTriggeredRolesForMember(
        latestMember,
        "Final role trigger reconciliation after member role update"
      ).catch(() => null);
      if (finalTriggerResult?.failedDetails?.length > 0) {
        console.warn(
          `[RoleTrigger] Final reconciliation failed for ${newMember.id}: ${JSON.stringify(finalTriggerResult.failedDetails)}`
        );
      }
    }

    if (!timeoutChanged) {
      return;
    }

    const entry = await findMemberUpdateEntry(newMember.guild, newMember.id);
    if (entry?.executor?.id === newMember.client.user.id) {
      return;
    }

    const applied = Boolean(timeoutAfter && (!timeoutBefore || timeoutAfter > timeoutBefore));
    if (applied && hasRecentAction("timeout", newMember.guild.id, newMember.id)) {
      return;
    }
    if (!applied && hasRecentAction("unmute", newMember.guild.id, newMember.id)) {
      return;
    }

    const title = applied ? "Member Timed Out" : "Member Timeout Removed";

    const embed = buildLogEmbed({
      title,
      color: applied ? 0xf1c40f : 0x57f287,
      fields: [
        { name: "User", value: `${newMember.user.tag} (${newMember.id})` },
        {
          name: "Moderator",
          value: entry?.executor
            ? `${entry.executor.tag} (${entry.executor.id})`
            : "Unknown"
        },
        {
          name: "Until",
          value: timeoutAfter ? `<t:${Math.floor(timeoutAfter / 1000)}:F>` : "None"
        },
        { name: "Reason", value: entry?.reason || "No reason provided" }
      ]
    });

    await sendModLog(newMember.guild, embed);

    try {
      const reason = entry?.reason || "No reason provided";
      const moderatorTag = entry?.executor?.tag || "Unknown";

      if (applied) {
        const minutes = timeoutAfter
          ? Math.max(1, Math.round((timeoutAfter - Date.now()) / 60000))
          : 1;
        const timeoutEndsAt = timeoutAfter
          ? Math.floor(timeoutAfter / 1000)
          : Math.floor(Date.now() / 1000);
        await sendTimeoutDM(
          newMember.client,
          newMember.user,
          newMember.guild.name,
          reason,
          moderatorTag,
          minutes,
          timeoutEndsAt
        );
      } else {
        await sendUnmuteDM(
          newMember.client,
          newMember.user,
          newMember.guild.name,
          moderatorTag
        );
      }
    } catch {
      // DM failures are non-fatal
    }
  }
};
