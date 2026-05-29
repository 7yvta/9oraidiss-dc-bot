const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { initPostgres, getDocument, putDocument } = require("./postgres");

const dataDir = path.join(__dirname, "..", "..", "data");
const settingsPath = path.join(dataDir, "guild-settings.json");
const SETTINGS_NAMESPACE = "core_store";
const SETTINGS_DOC_KEY = "guild_settings";

const allowedOverrideKeys = new Set([
  "disabledCommands",
  "commandPermissions",
  "ownerOnlyMode",
  "botAdminRoleIds",
  "roleTriggerRules",
  "supportTeamRoleIds",
  "middlemanTeamRoleIds",
  "serviceTeamRoleIds",
  "indexTeamRoleIds",
  "roleRequestTeamRoleIds",
  "reportTeamRoleIds",
  "hostGiveawayTeamRoleIds",
  "middlemanTicketRoleId",
  "serviceTicketRoleId",
  "supportTicketCategoryId",
  "middlemanTicketCategoryId",
  "serviceTicketCategoryId",
  "indexTicketCategoryId",
  "roleRequestTicketCategoryId",
  "reportTicketCategoryId",
  "hostGiveawayTicketCategoryId",
  "supportTicketPanelChannelId",
  "middlemanTicketPanelChannelId",
  "serviceTicketPanelChannelId",
  "indexTicketPanelChannelId",
  "roleRequestTicketPanelChannelId",
  "reportTicketPanelChannelId",
  "hostGiveawayTicketPanelChannelId",
  "modLogChannelId",
  "reportChannelId",
  "serverUpdateChannelId",
  "ticketTranscriptLogId",
  "ticketPanel",
  "roleRequestPanel",
  "ticketTypes",
  "moduleToggles",
  "ticketForceClaimRoleIds",
  "memberRoleId",
  "autoMemberRoleEnabled",
  "stickyMemberRoleEnabled",
  "welcomeEnabled",
  "welcomeChannelId",
  "welcomeMessageTemplate",
  "rulesChannelId",
  "giveawayHostRoleId",
  "hostGiveawayRoleIds",
  "reportHandlerRoleIds",
  "automodEnabled",
  "blockInvites",
  "blockLinks",
  "blockedWords",
  "warnConsequence",
  "warnConsequences",
  "autoresponderEnabled",
  "autoresponderRules",
  "autoMessageEnabled",
  "autoMessageChannelId",
  "autoMessageIntervalMinutes",
  "autoMessageContent",
  "autoVouchEnabled",
  "autoVouchChannelId",
  "autoVouchIntervalDays",
  "autoVouchPerCycle",
  "autoVouchMemberIds",
  "autoVouchMmReasons",
  "autoVouchIndexReasons",
  "levelCurve",
  "levelCurveMultiplier",
  "levelMax",
  "messageXpMin",
  "messageXpMax",
  "messageXpCooldownSeconds",
  "levelRewards",
  "levelUpChannelId",
  "fullCommandRoleIds",
  "timeoutOnlyRoleIds",
  "prefixAnywhereRoleIds",
  "confirmationRoleIds"
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }

  if (isPlainObject(value)) {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = deepClone(entry);
    }
    return result;
  }

  return value;
}

function deepMerge(baseValue, overrideValue) {
  if (Array.isArray(overrideValue)) {
    return deepClone(overrideValue);
  }

  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return deepClone(overrideValue);
  }

  const result = deepClone(baseValue);
  for (const [key, value] of Object.entries(overrideValue)) {
    result[key] = deepMerge(result[key], value);
  }
  return result;
}

function ensureStoreSync() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({ guilds: {} }, null, 2), "utf8");
  }
}

let storeCache = null;

function readStoreSync() {
  if (storeCache && isPlainObject(storeCache) && isPlainObject(storeCache.guilds)) {
    return deepClone(storeCache);
  }

  ensureStoreSync();

  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (isPlainObject(parsed) && isPlainObject(parsed.guilds)) {
      storeCache = deepClone(parsed);
      return deepClone(storeCache);
    }
  } catch {
    // fall through to reset invalid store
  }

  const emptyStore = { guilds: {} };
  fs.writeFileSync(settingsPath, JSON.stringify(emptyStore, null, 2), "utf8");
  storeCache = deepClone(emptyStore);
  return deepClone(storeCache);
}

function writeStoreSync(store) {
  ensureStoreSync();
  const normalized =
    isPlainObject(store) && isPlainObject(store.guilds) ? store : { guilds: {} };
  storeCache = deepClone(normalized);
  fs.writeFileSync(settingsPath, JSON.stringify(storeCache, null, 2), "utf8");
  putDocument(SETTINGS_NAMESPACE, SETTINGS_DOC_KEY, storeCache).catch(() => null);
}

function sanitizeOverrides(overrides) {
  if (!isPlainObject(overrides)) {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowedOverrideKeys.has(key)) {
      continue;
    }
    sanitized[key] = deepClone(value);
  }
  return sanitized;
}

function getGuildOverridesSync(guildId) {
  if (!guildId) {
    return {};
  }

  const store = readStoreSync();
  const entry = store.guilds[String(guildId)];
  return isPlainObject(entry) ? deepClone(entry) : {};
}

function getGuildSettingsSync(guildId) {
  const merged = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "function") {
      continue;
    }
    merged[key] = deepClone(value);
  }

  const overrides = getGuildOverridesSync(guildId);
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowedOverrideKeys.has(key)) {
      continue;
    }

    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }

    merged[key] = deepClone(value);
  }

  const configuredMiddlemanRoleIds = Array.isArray(merged.middlemanTeamRoleIds)
    ? merged.middlemanTeamRoleIds.map((roleId) => String(roleId || "").trim()).filter(Boolean)
    : [];
  const fallbackMiddlemanRoleId = String(
    merged.middlemanTicketRoleId || "1499837044237537460"
  ).trim();
  merged.middlemanTeamRoleIds =
    configuredMiddlemanRoleIds.length > 0
      ? configuredMiddlemanRoleIds
      : fallbackMiddlemanRoleId
        ? [fallbackMiddlemanRoleId]
        : [];

  const configuredServiceRoleIds = Array.isArray(merged.serviceTeamRoleIds)
    ? merged.serviceTeamRoleIds.map((roleId) => String(roleId || "").trim()).filter(Boolean)
    : [];
  const fallbackServiceRoleId = String(
    merged.serviceTicketRoleId || "1505637024588234993"
  ).trim();
  merged.serviceTeamRoleIds =
    configuredServiceRoleIds.length > 0
      ? configuredServiceRoleIds
      : fallbackServiceRoleId
        ? [fallbackServiceRoleId]
        : [];

  return merged;
}

function listGuildOverridesSync() {
  const store = readStoreSync();
  return deepClone(store.guilds);
}

async function writeGuildOverrides(guildId, overrides) {
  if (!guildId) {
    return { ok: false, reason: "missing_guild_id" };
  }

  const store = readStoreSync();
  store.guilds[String(guildId)] = sanitizeOverrides(overrides);
  writeStoreSync(store);
  return { ok: true, overrides: store.guilds[String(guildId)] };
}

async function patchGuildOverrides(guildId, partialOverrides) {
  if (!guildId) {
    return { ok: false, reason: "missing_guild_id" };
  }

  const store = readStoreSync();
  const current = isPlainObject(store.guilds[String(guildId)])
    ? store.guilds[String(guildId)]
    : {};
  store.guilds[String(guildId)] = {
    ...current,
    ...sanitizeOverrides(partialOverrides)
  };
  writeStoreSync(store);
  return { ok: true, overrides: deepClone(store.guilds[String(guildId)]) };
}

module.exports = {
  allowedOverrideKeys,
  getGuildOverridesSync,
  getGuildSettingsSync,
  listGuildOverridesSync,
  patchGuildOverrides,
  settingsPath,
  writeGuildOverrides
};

(async () => {
  await initPostgres().catch(() => null);
  const remoteStore = await getDocument(
    SETTINGS_NAMESPACE,
    SETTINGS_DOC_KEY
  ).catch(() => null);

  if (isPlainObject(remoteStore) && isPlainObject(remoteStore.guilds)) {
    storeCache = deepClone(remoteStore);
    ensureStoreSync();
    fs.writeFileSync(settingsPath, JSON.stringify(storeCache, null, 2), "utf8");
    return;
  }

  const localStore = readStoreSync();
  await putDocument(SETTINGS_NAMESPACE, SETTINGS_DOC_KEY, localStore).catch(() => null);
})();
