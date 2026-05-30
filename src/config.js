const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

function parseBoolean(value, fallback = false) {
  if (value == null) {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

function parseIdList(value, fallback = []) {
  if (!value) {
    return fallback;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizePublicBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return trimTrailingSlash(raw);
  }

  return trimTrailingSlash(`https://${raw}`);
}

function resolveRenderExternalUrl() {
  const externalUrl = normalizePublicBaseUrl(process.env.RENDER_EXTERNAL_URL || "");
  if (externalUrl) {
    return externalUrl;
  }

  const externalHostname = String(process.env.RENDER_EXTERNAL_HOSTNAME || "").trim();
  if (!externalHostname) {
    return "";
  }

  return normalizePublicBaseUrl(`https://${externalHostname}`);
}

function isRailwayPublicUrl(url) {
  const normalized = String(url || "").toLowerCase();
  return normalized.includes(".railway.app");
}

function resolvePublicBaseUrl() {
  const explicit =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    "";
  const explicitUrl = normalizePublicBaseUrl(explicit);
  const renderUrl = resolveRenderExternalUrl();
  const runningOnRender = String(process.env.RENDER || "").toLowerCase() === "true";

  if (runningOnRender && renderUrl && (!explicitUrl || isRailwayPublicUrl(explicitUrl))) {
    return renderUrl;
  }

  if (explicitUrl) {
    return explicitUrl;
  }

  if (renderUrl) {
    return renderUrl;
  }

  const railwayDomain =
    process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "";
  const railwayUrl = normalizePublicBaseUrl(railwayDomain);
  if (railwayUrl) {
    return railwayUrl;
  }

  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

function mergeUniqueIdLists(...lists) {
  const result = [];
  for (const list of lists) {
    const ids = Array.isArray(list) ? list : [];
    for (const entry of ids) {
      const id = String(entry || "").trim();
      if (!id || result.includes(id)) {
        continue;
      }
      result.push(id);
    }
  }
  return result;
}

function parseNumber(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return numberValue;
}

function parseBlockedWords(value) {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\r\n]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

function parseWarnConsequence(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    if (!isPlainObject(parsed)) {
      return fallback;
    }

    return {
      enabled: parsed.enabled !== false,
      threshold:
        Number.isInteger(Number(parsed.threshold)) && Number(parsed.threshold) > 0
          ? Number(parsed.threshold)
          : fallback.threshold,
      action: ["none", "timeout", "kick", "ban"].includes(String(parsed.action || "").toLowerCase())
        ? String(parsed.action).toLowerCase()
        : fallback.action,
      timeoutMinutes:
        Number.isFinite(Number(parsed.timeoutMinutes)) && Number(parsed.timeoutMinutes) > 0
          ? Number(parsed.timeoutMinutes)
          : fallback.timeoutMinutes,
      clearWarningsOnAction: parsed.clearWarningsOnAction !== false,
      reason:
        String(parsed.reason || "").trim() || fallback.reason
    };
  } catch {
    return fallback;
  }
}

function normalizeWarnRule(rawRule, fallback) {
  if (!isPlainObject(rawRule)) {
    return fallback;
  }

  const action = String(rawRule.action || "").toLowerCase();
  return {
    enabled: rawRule.enabled !== false,
    threshold:
      Number.isInteger(Number(rawRule.threshold)) && Number(rawRule.threshold) > 0
        ? Number(rawRule.threshold)
        : fallback.threshold,
    action: ["none", "timeout", "kick", "ban"].includes(action)
      ? action
      : fallback.action,
    timeoutMinutes:
      Number.isFinite(Number(rawRule.timeoutMinutes)) && Number(rawRule.timeoutMinutes) > 0
        ? Number(rawRule.timeoutMinutes)
        : fallback.timeoutMinutes,
    clearWarningsOnAction: rawRule.clearWarningsOnAction !== false,
    reason: String(rawRule.reason || "").trim() || fallback.reason
  };
}

function parseWarnConsequences(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return fallback;
    }

    const normalized = parsed
      .map((rule) => normalizeWarnRule(rule, defaultWarnConsequence))
      .filter(Boolean)
      .sort((a, b) => a.threshold - b.threshold);

    return normalized.length > 0 ? normalized : fallback;
  } catch {
    return fallback;
  }
}

function parseLevelRewards(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [levelPart, roleIdPart] = entry.split(":").map((chunk) => chunk.trim());
      const level = Number(levelPart);
      if (!Number.isInteger(level) || level <= 0 || !roleIdPart) {
        return null;
      }
      return { level, roleId: roleIdPart };
    })
    .filter(Boolean)
    .sort((a, b) => a.level - b.level);
}

function parseAllowedGuildIds(value, guildId) {
  const fromEnv = parseIdList(value, []);
  if (fromEnv.length > 0) {
    return fromEnv;
  }
  if (guildId) {
    return [guildId];
  }
  return [];
}

function parseCommandPermissions(value, fallback = {}) {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonArray(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseStringList(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  if (raw.startsWith("[")) {
    const parsed = parseJsonArray(raw, null);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .filter((entry, index, arr) => arr.indexOf(entry) === index);
    }
  }

  return raw
    .split(/[\r\n,|]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry, index, arr) => arr.indexOf(entry) === index);
}

function parseRoleBonusList(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  const fromArray = (arr) => {
    if (!Array.isArray(arr)) {
      return [];
    }
    const seen = new Set();
    const out = [];
    for (const entry of arr) {
      const roleId = String(entry?.roleId || "").match(/\d{8,}/)?.[0] || "";
      const bonus = Math.max(1, Math.floor(Number(entry?.bonus) || 0));
      if (!roleId || !bonus || seen.has(roleId)) {
        continue;
      }
      seen.add(roleId);
      out.push({ roleId, bonus });
    }
    return out;
  };

  if (raw.startsWith("[")) {
    const parsed = parseJsonArray(raw, null);
    const normalized = fromArray(parsed);
    return normalized.length > 0 ? normalized : fallback;
  }

  const lines = raw
    .split(/[\r\n,|]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const roleId = line.match(/\d{8,}/)?.[0] || "";
    const bonus = Math.max(
      1,
      Math.floor(Number(line.match(/(\d+)(?:\s*entries?)?\s*$/i)?.[1]) || 0)
    );
    if (!roleId || !bonus || seen.has(roleId)) {
      continue;
    }
    seen.add(roleId);
    out.push({ roleId, bonus });
  }
  return out.length > 0 ? out : fallback;
}

function parseModuleToggles(value, fallback = {}) {
  if (!value) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value);
    if (!isPlainObject(parsed)) {
      return fallback;
    }
    const normalized = {};
    for (const [key, entry] of Object.entries(parsed)) {
      normalized[String(key)] = entry !== false;
    }
    return normalized;
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepCloneJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepCloneJsonValue(entry));
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, entryValue] of Object.entries(value)) {
      result[key] = deepCloneJsonValue(entryValue);
    }
    return result;
  }
  return value;
}

async function ensureDataDir(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function readRuntimeConfigSync(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const raw = fs.readFileSync(configPath, "utf8");
    if (!raw.trim()) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const middlemanTicketRoleId =
  process.env.MIDDLEMAN_TICKET_ROLE_ID || "1499837044237537460";
const middlemanTeamRoleIds = parseIdList(process.env.MIDDLEMAN_TEAM_ROLE_IDS, [
  "1499837044237537460"
]);

const dataDir = path.join(__dirname, "..", "data");
const runtimeConfigPath = path.join(dataDir, "runtime-config.json");

const defaultTicketPanel = {
  color: 0x2ecc71,
  title: "Welcome to the Ticket System!",
  description: [
    "Please choose the type of ticket you want by clicking one of the buttons below:",
    "",
    "ðŸ’¬ **Support Ticket**",
    "Use this ticket if you need help with the server or questions.",
    "",
    "ðŸ¤ **Trade / Service Ticket**",
    "Use this ticket for secure trades. Both parties must confirm first.",
    "",
    "ðŸ“Š **Index Ticket**",
    "Use this ticket to request your base to be reviewed and indexed."
  ].join("\n"),
  footer: "One open ticket per type per user"
};

const defaultRoleRequestPanel = {
  color: 0x5865f2,
  title: "Role Request Panel",
  descriptionTemplate: [
    "Click the button below to open a role request ticket.",
    "",
    "Handled by authorized role(s):",
    "{{roles}}"
  ].join("\n")
};

const defaultTicketTypes = {
  support: {
    enabled: true,
    buttonLabel: "Request Support Team",
    introMessage: `Support Ticket

Please describe your issue clearly.

Include:
- What problem you have
- Screenshots (if needed)
- Extra details

Staff will respond soon.
Be patient and respectful.`
  },
  middleman: {
    enabled: true,
    buttonLabel: "Request MM Team",
    introMessage: `Middleman System

Need a safe trade? Open a ticket below.

A trusted middleman will assist you.
Secure and monitored trades.

Do not trade without a middleman.
Stay in the ticket during the trade.

Click below to start.`
  },
  service: {
    enabled: true,
    buttonLabel: "Request Service Team",
    introMessage: `Service System

Need help with Blox Fruits services? Open a ticket below.

A service staff member will assist you.
Fast and trusted support for service requests.

Please explain clearly what service you need.
Stay in the ticket until service is done.`
  },
  index: {
    enabled: true,
    buttonLabel: "Index Request",
    introMessage: `Base Index System

Want your base to be indexed? Open a ticket below.

We will review and list your base.
Get more visibility and customers.
Trusted indexing system.

Requirements:
- Legit base only
- No scams
- Must follow server rules

Click below to request an index.`
  },
  role: {
    enabled: true,
    buttonLabel: "Role Request",
    introMessage: `Role Request Ticket

Please send your role request clearly.

Include:
- The role you want
- Why you need it
- Any proof/screenshots if needed

Staff will review and respond soon.`
  },
  report: {
    enabled: true,
    buttonLabel: "Open Report Ticket",
    introMessage: `Report Ticket

{user}, thank you for opening a report ticket.

Please send full proof and details so staff can review quickly.

One report staff member will assist you soon.`
  },
  host: {
    enabled: true,
    buttonLabel: "Open Host Giveaway Ticket",
    introMessage: `Host Giveaway Ticket

{user}, thank you for requesting a giveaway host ticket.

A giveaway host team member will review your request soon.

Please include your giveaway details and requirements.`
  }
};

const defaultWarnConsequence = {
  enabled: false,
  threshold: 3,
  action: "timeout",
  timeoutMinutes: 60,
  clearWarningsOnAction: true,
  reason: "Automatic moderation consequence after warning threshold"
};

const parsedLegacyWarnConsequence = parseWarnConsequence(
  process.env.WARN_CONSEQUENCE,
  defaultWarnConsequence
);
const parsedWarnConsequences = parseWarnConsequences(
  process.env.WARN_CONSEQUENCES,
  []
);
const initialWarnConsequences =
  parsedWarnConsequences.length > 0 ? parsedWarnConsequences : [parsedLegacyWarnConsequence];

const defaultWelcomeMessageTemplate =
  "{userMention} welcome to **{guildName}**. Please read the rules in {rulesChannelMention}. Invited by: {inviterMention}.";

const baseConfig = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  supportRoleId: process.env.SUPPORT_ROLE_ID || "1479264429383225520",
  ticketCategoryId: process.env.TICKET_CATEGORY_ID || "1489735635253071872",
  modLogChannelId:
    process.env.MOD_LOG_CHANNEL_ID || "1499436699074170981",
  reportChannelId:
    process.env.REPORT_CHANNEL_ID ||
    "1483282356520620203",
  levelLogChannelId:
    process.env.LEVEL_LOG_CHANNEL_ID || "1482863406351515709",
  ticketTranscriptLogId:
    process.env.TICKET_TRANSCRIPT_LOG_ID || "1499962658051326022",
  welcomeChannelId:
    process.env.WELCOME_CHANNEL_ID || "1479258652870185041",
  serverUpdateChannelId:
    process.env.SERVER_UPDATE_CHANNEL_ID || "1499436772206317569",
  rulesChannelId: process.env.RULES_CHANNEL_ID || null,
  welcomeEnabled: parseBoolean(process.env.WELCOME_ENABLED, true),
  welcomeMessageTemplate:
    process.env.WELCOME_MESSAGE_TEMPLATE || defaultWelcomeMessageTemplate,
  levelRewards: parseLevelRewards(process.env.LEVEL_REWARDS, [
    { level: 5, roleId: "1482862462155096166" },
    { level: 15, roleId: "1482862407138279447" },
    { level: 25, roleId: "1482862172366311444" },
    { level: 40, roleId: "1481850905921065183" },
    { level: 65, roleId: "1483546231841095731" },
    { level: 100, roleId: "1483495496130629672" }
  ]),
  prefix: process.env.PREFIX || "!",
  ownerOnlyMode: parseBoolean(process.env.OWNER_ONLY_MODE, false),
  botOwnerId: process.env.BOT_OWNER_ID || "1474509136606789715",
  botOwnerIds: Array.from(
    new Set(
      [
        process.env.BOT_OWNER_ID || "1474509136606789715",
        ...parseIdList(process.env.BOT_OWNER_IDS, [])
      ]
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ),
  ticketPanelChannelId: process.env.TICKET_PANEL_CHANNEL_ID || null,
  disabledCommands: parseIdList(process.env.DISABLED_COMMANDS, []),
  commandPermissions: parseCommandPermissions(process.env.COMMAND_PERMISSIONS, {}),
  guildMembersIntent: parseBoolean(process.env.GUILD_MEMBERS_INTENT, true),
  messageContentIntent: parseBoolean(process.env.MESSAGE_CONTENT_INTENT, true),
  automodEnabled: parseBoolean(process.env.AUTOMOD_ENABLED, true),
  blockInvites: parseBoolean(process.env.BLOCK_INVITES, true),
  blockLinks: parseBoolean(process.env.BLOCK_LINKS, false),
  blockedWords: parseBlockedWords(process.env.BLOCKED_WORDS),
  warnConsequence: parsedLegacyWarnConsequence,
  warnConsequences: initialWarnConsequences,
  autoresponderEnabled: parseBoolean(process.env.AUTORESPONDER_ENABLED, false),
  autoresponderRules: parseJsonArray(process.env.AUTORESPONDER_RULES, []),
  autoMessageEnabled: parseBoolean(process.env.AUTO_MESSAGE_ENABLED, false),
  autoMessageChannelId: process.env.AUTO_MESSAGE_CHANNEL_ID || null,
  autoMessageIntervalMinutes: parseNumber(process.env.AUTO_MESSAGE_INTERVAL_MINUTES, 60),
  autoMessageContent: process.env.AUTO_MESSAGE_CONTENT || "Remember to read the rules and stay respectful.",
  autoVouchEnabled: parseBoolean(process.env.AUTO_VOUCH_ENABLED, true),
  autoVouchChannelId: process.env.AUTO_VOUCH_CHANNEL_ID || "1479671208349012100",
  autoVouchIntervalDays: parseNumber(process.env.AUTO_VOUCH_INTERVAL_DAYS, 7),
  autoVouchPerCycle: parseNumber(process.env.AUTO_VOUCH_PER_CYCLE, 3),
  autoVouchMemberIds: parseIdList(process.env.AUTO_VOUCH_MEMBER_IDS, [
    "1473683031356346586",
    "1474509136606789715",
    "1408476307720769569",
    "1408487078307827823",
    "1479920539815510056"
  ]),
  autoVouchMmReasons: parseStringList(process.env.AUTO_VOUCH_MM_REASONS, []),
  autoVouchIndexReasons: parseStringList(
    process.env.AUTO_VOUCH_INDEX_REASONS,
    []
  ),

  levelCurve: (process.env.LEVEL_CURVE || "linear").toLowerCase(),
  levelCurveMultiplier: parseNumber(process.env.LEVEL_CURVE_MULTIPLIER, 1),
  levelMax: parseNumber(process.env.LEVEL_MAX, 100),
  messageXpMin: parseNumber(process.env.MESSAGE_XP_MIN, 15),
  messageXpMax: parseNumber(process.env.MESSAGE_XP_MAX, 40),
  messageXpCooldownSeconds: parseNumber(process.env.MESSAGE_XP_COOLDOWN_SECONDS, 60),
  levelUpChannelId: process.env.LEVEL_UP_CHANNEL_ID || null,
  autoRoleThemeEnabled: parseBoolean(process.env.AUTO_ROLE_THEME_ENABLED, true),
  autoRoleThemeGuildIds: parseIdList(
    process.env.AUTO_ROLE_THEME_GUILD_IDS,
    process.env.GUILD_ID ? [process.env.GUILD_ID] : []
  ),
  autoChannelThemeEnabled: parseBoolean(process.env.AUTO_CHANNEL_THEME_ENABLED, false),
  autoChannelThemeGuildIds: parseIdList(
    process.env.AUTO_CHANNEL_THEME_GUILD_IDS,
    process.env.GUILD_ID ? [process.env.GUILD_ID] : []
  ),
  autoTicketPanelPlacementEnabled: parseBoolean(
    process.env.AUTO_TICKET_PANEL_PLACEMENT_ENABLED,
    false
  ),
  autoTicketPanelGuildIds: parseIdList(
    process.env.AUTO_TICKET_PANEL_GUILD_IDS,
    process.env.GUILD_ID ? [process.env.GUILD_ID] : []
  ),

  publicBaseUrl: resolvePublicBaseUrl(),

  memberRoleId: process.env.MEMBER_ROLE_ID || "1480011765151699054",
  autoMemberRoleEnabled: parseBoolean(process.env.AUTO_MEMBER_ROLE_ENABLED, true),
  stickyMemberRoleEnabled: parseBoolean(process.env.STICKY_MEMBER_ROLE_ENABLED, true),
  giveawayHostRoleId:
    process.env.GIVEAWAY_HOST_ROLE_ID || "1481709821844520970",
  hostGiveawayRoleIds: parseIdList(
    process.env.HOST_GIVEAWAY_ROLE_IDS,
    [process.env.GIVEAWAY_HOST_ROLE_ID || "1481709821844520970"]
  ),
  reportHandlerRoleIds: parseIdList(
    process.env.REPORT_HANDLER_ROLE_IDS,
    [
      "1479264180866388089",
      "1479263836778532934",
      "1483555926492451118"
    ]
  ),

  supportTicketCategoryId:
    process.env.SUPPORT_TICKET_CATEGORY_ID || "1489735635253071872",
  middlemanTicketCategoryId:
    process.env.MIDDLEMAN_TICKET_CATEGORY_ID || "1489735694283833455",
  serviceTicketCategoryId:
    process.env.SERVICE_TICKET_CATEGORY_ID || "1506034008222339242",
  indexTicketCategoryId:
    process.env.INDEX_TICKET_CATEGORY_ID || "1489735769340903524",
  roleRequestTicketCategoryId:
    process.env.ROLE_REQUEST_TICKET_CATEGORY_ID ||
    process.env.SUPPORT_TICKET_CATEGORY_ID ||
    "1489735635253071872",
  reportTicketCategoryId:
    process.env.REPORT_TICKET_CATEGORY_ID ||
    process.env.SUPPORT_TICKET_CATEGORY_ID ||
    "1489735635253071872",
  hostGiveawayTicketCategoryId:
    process.env.HOST_GIVEAWAY_TICKET_CATEGORY_ID ||
    process.env.SUPPORT_TICKET_CATEGORY_ID ||
    "1489735635253071872",

  middlemanTeamRoleIds,
  middlemanTicketRoleId,
  serviceTeamRoleIds: parseIdList(process.env.SERVICE_TEAM_ROLE_IDS, [
    "1505637024588234993"
  ]),
  supportTeamRoleIds: parseIdList(process.env.SUPPORT_TEAM_ROLE_IDS, [
    "1479264429383225520"
  ]),
  indexTeamRoleIds: parseIdList(process.env.INDEX_TEAM_ROLE_IDS, [
    "1483634346333311160"
  ]),
  roleRequestTeamRoleIds: parseIdList(process.env.ROLE_REQUEST_TEAM_ROLE_IDS, [
    "1493298416363765941"
  ]),
  reportTeamRoleIds: parseIdList(process.env.REPORT_TEAM_ROLE_IDS, [
    "1479264180866388089",
    "1479263836778532934",
    "1483555926492451118"
  ]),
  hostGiveawayTeamRoleIds: parseIdList(process.env.HOST_GIVEAWAY_TEAM_ROLE_IDS, [
    process.env.GIVEAWAY_HOST_ROLE_ID || "1481709821844520970"
  ]),

  ticketPanel: defaultTicketPanel,
  roleRequestPanel: defaultRoleRequestPanel,
  ticketTypes: defaultTicketTypes,
  moduleToggles: parseModuleToggles(process.env.MODULE_TOGGLES, {
    moderation: true,
    tickets: true,
    utility: true,
    fun: true
  }),

  ticketForceClaimRoleIds: parseIdList(process.env.TICKET_FORCECLAIM_ROLE_IDS, [
    "1479263062065152111",
    "1479263536797454489"
  ]),

  fullCommandRoleIds: parseIdList(process.env.FULL_COMMAND_ROLE_IDS, [
    "1479263062065152111",
    "1483555926492451118",
    "1479263836778532934",
    "1493298416363765941",
    "1479264180866388089"
  ]),
  timeoutOnlyRoleIds: parseIdList(process.env.TIMEOUT_ONLY_ROLE_IDS, [
    "1483497619090178098",
    "1479264429383225520"
  ]),
  prefixAnywhereRoleIds: parseIdList(process.env.PREFIX_ANYWHERE_ROLE_IDS, [
    "1483555926492451118",
    "1479263836778532934",
    "1493298416363765941",
    "1479264180866388089",
    "1479263062065152111",
    "1479264429383225520",
    "1483497619090178098"
  ]),
  confirmationRoleIds: parseIdList(process.env.CONFIRMATION_ROLE_IDS, middlemanTeamRoleIds),
  strictGuildLock: parseBoolean(process.env.STRICT_GUILD_LOCK, false),
  allowedGuildIds: parseAllowedGuildIds(
    process.env.ALLOWED_GUILD_IDS,
    process.env.GUILD_ID || null
  )
};

const nonOverridableKeys = new Set([
  "token",
  "clientId",
  "publicBaseUrl"
]);
const allowedKeys = new Set(Object.keys(baseConfig));

function applyRuntimeConfig(config, overrides) {
  if (!isPlainObject(overrides)) {
    return;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (!allowedKeys.has(key) || nonOverridableKeys.has(key)) {
      continue;
    }

    config[key] = deepCloneJsonValue(value);
  }

  const enforcedMiddlemanRoleId = String(
    config.middlemanTicketRoleId || middlemanTicketRoleId || ""
  ).trim();
  config.middlemanTeamRoleIds = enforcedMiddlemanRoleId
    ? [enforcedMiddlemanRoleId]
    : [];
}

const config = {
  ...baseConfig,
  runtimeConfigPath,
  reloadRuntimeConfig: async () => {
    const overrides = readRuntimeConfigSync(runtimeConfigPath);
    if (overrides) {
      applyRuntimeConfig(config, overrides);
      return { ok: true, overrides };
    }
    return { ok: true, overrides: null };
  },
  writeRuntimeConfig: async (overrides) => {
    if (!isPlainObject(overrides)) {
      return { ok: false, reason: "invalid_json" };
    }

    await ensureDataDir(dataDir);
    const sanitized = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (!allowedKeys.has(key) || nonOverridableKeys.has(key)) {
        continue;
      }
      sanitized[key] = deepCloneJsonValue(value);
    }

    await fsp.writeFile(
      runtimeConfigPath,
      JSON.stringify(sanitized, null, 2),
      "utf8"
    );

    applyRuntimeConfig(config, sanitized);
    return { ok: true, overrides: sanitized };
  }
};

applyRuntimeConfig(config, readRuntimeConfigSync(runtimeConfigPath) || null);

module.exports = config;

