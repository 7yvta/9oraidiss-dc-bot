const config = require("../config");
const { PermissionFlagsBits } = require("discord.js");
const { getGuildSettingsSync } = require("./guildSettings");

const ROLE_TRIGGER_RULES = [
  {
    sourceRoleIds: [
      "1482862462155096166",
      "1482862407138279447",
      "1482862172366311444",
      "1481850905921065183",
      "1483546231841095731",
      "1483495496130629672",
      "1480011765151699054"
    ],
    targetRoleIds: ["1499840862417588225"]
  },
  {
    sourceRoleIds: [
      "1480029472353947839",
      "1480007082035118323",
      "1479911436032413768",
      "1479893376059965502",
      "1482198919646675014",
      "1479895061847085116"
    ],
    targetRoleIds: ["1499840816322187457"]
  },
  {
    sourceRoleIds: [
      "1487601467400392918",
      "1481709821844520970",
      "1479887231991939203",
      "1483634346333311160",
      "1483497619090178098",
      "1479264429383225520"
    ],
    targetRoleIds: ["1499841126129995897"]
  },
  {
    sourceRoleIds: [
      "1479264180866388089",
      "1479263836778532934",
      "1493298416363765941",
      "1483555926492451118"
    ],
    targetRoleIds: ["1499840193447071805"]
  },
  {
    sourceRoleIds: [
      "1483496972261265669",
      "1483496866279591977",
      "1479264717972308111"
    ],
    targetRoleIds: ["1499840987495665774", "1499837044237537460"]
  },
  {
    sourceRoleIds: [
      "1505612011579506711",
      "1505612010690314340",
      "1505612010077818991",
      "1505612011269132359"
    ],
    targetRoleIds: ["1505632362417885194", "1505637024588234993"]
  }
];
const ROLE_TRIGGER_TEMPLATE_SOURCE_GUILD_ID = String(
  process.env.ROLE_TRIGGER_TEMPLATE_SOURCE_GUILD_ID ||
    config.guildId ||
    "1479255758561480906"
).trim();
const ROLE_NAME_CACHE_TTL_MS = 10 * 60 * 1000;

let roleNameCacheSourceGuildId = "";
let roleNameByCanonicalId = new Map();
let roleNameCacheUpdatedAt = 0;
let roleNameCacheLoadPromise = null;
const memberSyncQueues = new Map();
const lastSyncResults = new Map();
const LAST_SYNC_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function shouldApplyRule(member, sourceRoleIds) {
  return sourceRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function collectAllCanonicalRoleIds() {
  const out = new Set();
  for (const rule of ROLE_TRIGGER_RULES) {
    for (const sourceRoleId of rule.sourceRoleIds || []) {
      out.add(String(sourceRoleId));
    }
    for (const targetRoleId of rule.targetRoleIds || []) {
      out.add(String(targetRoleId));
    }
  }
  return out;
}

function findRoleByName(guild, roleName) {
  const normalized = String(roleName || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const matches = guild.roles.cache
    .filter((role) => String(role.name || "").trim().toLowerCase() === normalized)
    .sort((a, b) => b.position - a.position);
  return matches.first() || null;
}

async function loadCanonicalRoleNameMap(client) {
  if (!client || !ROLE_TRIGGER_TEMPLATE_SOURCE_GUILD_ID) {
    return roleNameByCanonicalId;
  }

  const now = Date.now();
  if (
    roleNameCacheSourceGuildId === ROLE_TRIGGER_TEMPLATE_SOURCE_GUILD_ID &&
    roleNameByCanonicalId.size > 0 &&
    now - roleNameCacheUpdatedAt < ROLE_NAME_CACHE_TTL_MS
  ) {
    return roleNameByCanonicalId;
  }

  if (roleNameCacheLoadPromise) {
    return roleNameCacheLoadPromise;
  }

  roleNameCacheLoadPromise = (async () => {
    const nextMap = new Map();
    try {
      const sourceGuild =
        client.guilds.cache.get(ROLE_TRIGGER_TEMPLATE_SOURCE_GUILD_ID) ||
        (await client.guilds
          .fetch(ROLE_TRIGGER_TEMPLATE_SOURCE_GUILD_ID)
          .catch(() => null));
      if (sourceGuild) {
        await sourceGuild.roles.fetch().catch(() => null);
        for (const roleId of collectAllCanonicalRoleIds()) {
          const role =
            sourceGuild.roles.cache.get(roleId) ||
            (await sourceGuild.roles.fetch(roleId).catch(() => null));
          if (!role?.name) {
            continue;
          }
          nextMap.set(roleId, String(role.name));
        }
      }
    } catch {
      // non-fatal, keep fallback behavior
    }

    roleNameCacheSourceGuildId = ROLE_TRIGGER_TEMPLATE_SOURCE_GUILD_ID;
    roleNameByCanonicalId = nextMap;
    roleNameCacheUpdatedAt = Date.now();
    return roleNameByCanonicalId;
  })().finally(() => {
    roleNameCacheLoadPromise = null;
  });

  return roleNameCacheLoadPromise;
}

function resolveRoleIdsForGuild(guild, canonicalRoleIds, canonicalNameMap) {
  const out = new Set();
  for (const roleId of canonicalRoleIds || []) {
    const canonicalId = String(roleId || "").trim();
    if (!canonicalId) {
      continue;
    }

    if (guild.roles.cache.has(canonicalId)) {
      out.add(canonicalId);
      continue;
    }

    const fallbackName = canonicalNameMap.get(canonicalId);
    if (!fallbackName) {
      continue;
    }
    const fallbackRole = findRoleByName(guild, fallbackName);
    if (fallbackRole) {
      out.add(String(fallbackRole.id));
    }
  }
  return Array.from(out);
}

function collectAllTriggerTargetRoleIds(resolvedRules) {
  const out = new Set();
  for (const rule of resolvedRules) {
    for (const targetRoleId of rule.targetRoleIds || []) {
      out.add(String(targetRoleId));
    }
  }
  return out;
}

function collectDesiredTargetRoleIds(member, resolvedRules) {
  const out = new Set();
  for (const rule of resolvedRules) {
    if (!shouldApplyRule(member, rule.sourceRoleIds || [])) {
      continue;
    }
    for (const targetRoleId of rule.targetRoleIds || []) {
      out.add(String(targetRoleId));
    }
  }
  return out;
}

function buildMemberQueueKey(member) {
  const guildId = String(member?.guild?.id || "").trim();
  const memberId = String(member?.id || "").trim();
  if (!guildId || !memberId) {
    return null;
  }
  return `${guildId}:${memberId}`;
}

function runMemberSyncInQueue(member, task) {
  const key = buildMemberQueueKey(member);
  if (!key) {
    return task();
  }

  const previous = memberSyncQueues.get(key) || Promise.resolve();
  const next = previous
    .catch(() => null)
    .then(() => task())
    .finally(() => {
      if (memberSyncQueues.get(key) === next) {
        memberSyncQueues.delete(key);
      }
    });

  memberSyncQueues.set(key, next);
  return next;
}

function getRoleDisplayName(guild, roleId) {
  const role = guild?.roles?.cache?.get?.(String(roleId || "").trim()) || null;
  if (!role) {
    return null;
  }
  return String(role.name || "").trim() || null;
}

function cleanupLastSyncResults(now = Date.now()) {
  for (const [key, value] of lastSyncResults.entries()) {
    const timestamp = Number(value?.timestamp || 0);
    if (!timestamp || now - timestamp > LAST_SYNC_CACHE_TTL_MS) {
      lastSyncResults.delete(key);
    }
  }
}

function storeLastSyncResult(member, payload) {
  const key = buildMemberQueueKey(member);
  if (!key) {
    return;
  }
  cleanupLastSyncResults();
  lastSyncResults.set(key, {
    ...(payload || {}),
    timestamp: Date.now()
  });
}

function getLastSyncResult(guildId, memberId) {
  cleanupLastSyncResults();
  const key = `${String(guildId || "").trim()}:${String(memberId || "").trim()}`;
  return lastSyncResults.get(key) || null;
}

function buildRuleDiagnostics(member, resolvedRules) {
  const diagnostics = [];
  for (let idx = 0; idx < resolvedRules.length; idx += 1) {
    const rule = resolvedRules[idx];
    const sourceRoleIds = Array.isArray(rule.sourceRoleIds) ? rule.sourceRoleIds : [];
    const targetRoleIds = Array.isArray(rule.targetRoleIds) ? rule.targetRoleIds : [];
    const matchedSourceRoleIds = sourceRoleIds.filter((roleId) =>
      member.roles.cache.has(String(roleId || "").trim())
    );
    const missingSourceRoleIds = sourceRoleIds.filter(
      (roleId) => !matchedSourceRoleIds.includes(String(roleId || "").trim())
    );

    diagnostics.push({
      ruleIndex: idx + 1,
      applies: matchedSourceRoleIds.length > 0,
      sourceRoleIds,
      sourceRoleNames: sourceRoleIds.map((roleId) => ({
        roleId,
        roleName: getRoleDisplayName(member.guild, roleId)
      })),
      matchedSourceRoleIds,
      missingSourceRoleIds,
      targetRoleIds,
      targetRoleNames: targetRoleIds.map((roleId) => ({
        roleId,
        roleName: getRoleDisplayName(member.guild, roleId)
      }))
    });
  }
  return diagnostics;
}

function buildTargetDiagnostics(member, allTargetRoleIds, desiredTargetRoleIds) {
  const details = [];
  for (const roleId of allTargetRoleIds) {
    const hasRole = member.roles.cache.has(roleId);
    const desired = desiredTargetRoleIds.has(roleId);
    details.push({
      roleId,
      roleName: getRoleDisplayName(member.guild, roleId),
      hasRole,
      desired,
      plannedAction: desired && !hasRole ? "add" : !desired && hasRole ? "remove" : "none"
    });
  }
  return details.sort((a, b) => a.roleId.localeCompare(b.roleId));
}

async function resolveRulesForGuild(guild, client) {
  await guild.roles.fetch().catch(() => null);
  const canonicalNameMap = await loadCanonicalRoleNameMap(client);
  const settings = getGuildSettingsSync(guild.id);
  const customRules = Array.isArray(settings.roleTriggerRules)
    ? settings.roleTriggerRules
    : [];
  const rules = [...ROLE_TRIGGER_RULES, ...customRules];
  return rules.map((rule) => ({
    sourceRoleIds: resolveRoleIdsForGuild(guild, rule.sourceRoleIds || [], canonicalNameMap),
    targetRoleIds: resolveRoleIdsForGuild(guild, rule.targetRoleIds || [], canonicalNameMap)
  })).filter((rule) => rule.sourceRoleIds.length > 0 && rule.targetRoleIds.length > 0);
}

async function diagnoseRoleTriggersForMember(member) {
  if (!member?.guild) {
    return null;
  }

  const freshMember =
    (await member.guild.members.fetch(member.id).catch(() => null)) || member;

  const resolvedRules = await resolveRulesForGuild(freshMember.guild, freshMember.client);
  const allTargetRoleIds = collectAllTriggerTargetRoleIds(resolvedRules);
  const desiredTargetRoleIds = collectDesiredTargetRoleIds(freshMember, resolvedRules);
  const ruleDiagnostics = buildRuleDiagnostics(freshMember, resolvedRules);
  const targetDiagnostics = buildTargetDiagnostics(
    freshMember,
    allTargetRoleIds,
    desiredTargetRoleIds
  );

  return {
    guildId: String(freshMember.guild.id),
    memberId: String(freshMember.id),
    generatedAt: Date.now(),
    ruleDiagnostics,
    targetDiagnostics,
    desiredTargetRoleIds: Array.from(desiredTargetRoleIds).sort(),
    allTargetRoleIds: Array.from(allTargetRoleIds).sort(),
    currentRoleIds: Array.from(freshMember.roles.cache.keys()).sort()
  };
}

async function syncTriggeredRolesForMemberInternal(member, reason = "Role trigger sync") {
  if (!member || !member.guild) {
    return {
      addedRoleIds: [],
      removedRoleIds: [],
      failedRoleIds: [],
      failedDetails: []
    };
  }

  const freshMember =
    (await member.guild.members.fetch(member.id).catch(() => null)) || member;

  const botMember =
    freshMember.guild.members.me ||
    (await freshMember.guild.members.fetchMe().catch(() => null));
  if (!botMember) {
    return {
      addedRoleIds: [],
      removedRoleIds: [],
      failedRoleIds: [],
      failedDetails: []
    };
  }
  if (!botMember.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    return {
      addedRoleIds: [],
      removedRoleIds: [],
      failedRoleIds: [],
      failedDetails: [
        {
          action: "sync",
          reason: "bot_missing_manage_roles_permission"
        }
      ]
    };
  }

  const resolvedRules = await resolveRulesForGuild(freshMember.guild, freshMember.client);

  const allTargetRoleIds = collectAllTriggerTargetRoleIds(resolvedRules);
  const desiredTargetRoleIds = collectDesiredTargetRoleIds(freshMember, resolvedRules);
  const ruleDiagnostics = buildRuleDiagnostics(freshMember, resolvedRules);
  const targetDiagnostics = buildTargetDiagnostics(
    freshMember,
    allTargetRoleIds,
    desiredTargetRoleIds
  );

  const addedRoleIds = [];
  const removedRoleIds = [];
  const failedRoleIds = [];
  const failedDetails = [];

  // Phase 1: add required trigger roles.
  for (const targetRoleId of desiredTargetRoleIds) {
    if (freshMember.roles.cache.has(targetRoleId)) {
      continue;
    }

    const role =
      freshMember.guild.roles.cache.get(targetRoleId) ||
      (await freshMember.guild.roles.fetch(targetRoleId).catch(() => null));
    if (!role) {
      failedRoleIds.push(targetRoleId);
      failedDetails.push({
        roleId: targetRoleId,
        action: "add",
        reason: "target_role_not_found"
      });
      continue;
    }

    if (role.position >= botMember.roles.highest.position) {
      failedRoleIds.push(targetRoleId);
      failedDetails.push({
        roleId: targetRoleId,
        action: "add",
        reason: "bot_role_hierarchy"
      });
      continue;
    }

    try {
      await freshMember.roles.add(role, reason);
      addedRoleIds.push(targetRoleId);
    } catch (error) {
      failedRoleIds.push(targetRoleId);
      failedDetails.push({
        roleId: targetRoleId,
        action: "add",
        reason: "discord_api_error",
        error: String(error?.message || error)
      });
    }
  }

  // Phase 2: remove trigger roles that are no longer required.
  for (const targetRoleId of allTargetRoleIds) {
    if (desiredTargetRoleIds.has(targetRoleId)) {
      continue;
    }
    if (!freshMember.roles.cache.has(targetRoleId)) {
      continue;
    }

    const role =
      freshMember.guild.roles.cache.get(targetRoleId) ||
      (await freshMember.guild.roles.fetch(targetRoleId).catch(() => null));
    if (!role) {
      failedRoleIds.push(targetRoleId);
      failedDetails.push({
        roleId: targetRoleId,
        action: "remove",
        reason: "target_role_not_found"
      });
      continue;
    }

    if (role.position >= botMember.roles.highest.position) {
      failedRoleIds.push(targetRoleId);
      failedDetails.push({
        roleId: targetRoleId,
        action: "remove",
        reason: "bot_role_hierarchy"
      });
      continue;
    }

    try {
      await freshMember.roles.remove(role, reason);
      removedRoleIds.push(targetRoleId);
    } catch (error) {
      failedRoleIds.push(targetRoleId);
      failedDetails.push({
        roleId: targetRoleId,
        action: "remove",
        reason: "discord_api_error",
        error: String(error?.message || error)
      });
    }
  }

  const result = {
    addedRoleIds,
    removedRoleIds,
    failedRoleIds,
    failedDetails,
    ruleDiagnostics,
    targetDiagnostics,
    desiredTargetRoleIds: Array.from(desiredTargetRoleIds).sort()
  };
  storeLastSyncResult(freshMember, result);
  return result;
}

async function syncTriggeredRolesForMember(member, reason = "Role trigger sync") {
  return runMemberSyncInQueue(member, () =>
    syncTriggeredRolesForMemberInternal(member, reason)
  );
}

module.exports = {
  ROLE_TRIGGER_RULES,
  syncTriggeredRolesForMember,
  diagnoseRoleTriggersForMember,
  getLastSyncResult
};
