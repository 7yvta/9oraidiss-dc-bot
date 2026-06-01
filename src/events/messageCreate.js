const { Events, PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const { addWarning, clearWarnings, getWarnings } = require("../utils/warnStore");
const {
  buildLogEmbed,
  buildResultEmbed,
  sendLogToChannel,
  sendModLog
} = require("../utils/logger");
const { addXp, getLeaderboard, getUserLevel, resolveLevelCap } = require("../utils/levelStore");
const { saveMessage } = require("../utils/messageCache");
const { recordGuildMessage } = require("../utils/messageStatsStore");
const { getGuildSettingsSync } = require("../utils/guildSettings");
const {
  sendDM,
  sendWarnDM,
  sendTimeoutDM,
  sendClearWarningsDM,
  sendUnmuteDM
} = require("../utils/dmHelper");
const { ensureRoleHasLevelSpecialPermissions } = require("../utils/levelRolePermissions");
const { shouldAnnounceLevelUp } = require("../utils/levelAnnouncementStore");
const { getAutoWinOrLoseChannel, recordWinOrLose } = require("../utils/vulcanGame");
const { getAccount, updateAccount } = require("../utils/economyStore");
const { runOnce } = require("../utils/idempotency");
const { canUseCommand, isBotOwnerId } = require("../utils/permissionEngine");
const { canModerate } = require("../utils/moderation");
const { checkCooldown, formatRetryAfter, parseCooldownMs } = require("../utils/cooldowns");

const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)/i;
const linkRegex = /https?:\/\/[^\s]+/i;
const xpCooldown = new Map();
const autoresponderCooldown = new Map();
const processedMessageIds = new Map();
const userMentionRegex = /^<@!?(\d+)>$/;
const WHOIS_ROLE_FIELD_MAX_CHARS = 1000;
const WHOIS_ROLE_DESCRIPTION_MAX_CHARS = 3800;
const WHOIS_PERMISSION_FIELD_MAX_CHARS = 1000;
const MESSAGE_PROCESS_TTL_MS = 2 * 60 * 1000;
const PREFIX_COMMAND_COOLDOWN_MS = parseCooldownMs(
  process.env.PREFIX_COMMAND_COOLDOWN_MS,
  2500
);
const PREFIX_RESPONSE_DEDUPE_LOOKBACK_MS = 15000;
const PREFIX_RESPONSE_FETCH_LIMIT = 20;
const PREFIX_RESPONSE_JITTER_MIN_MS = 180;
const PREFIX_RESPONSE_JITTER_MAX_MS = 720;
const PREFIX_RESPONSE_SETTLE_MS = 220;
const PREFIX_RESPONSE_SECOND_PASS_MS = 2200;
const LEVEL_ANNOUNCE_LOOKBACK_LIMIT = 60;
const SERVER_BOOST_XP_MULTIPLIER = 2;
const AFK_NICK_PREFIX = "[AFK]";
const AFK_CONFIRM_DELETE_MS = 20 * 1000;
const PREFIX_ANYWHERE_COMMANDS = new Set([
  "w",
  "whois",
  "userinfo",
  "member",
  "members",
  "warn",
  "warnings",
  "clearwarnings",
  "clearwarns",
  "timeout",
  "unmute"
]);
const PREFIX_MODERATION_COMMANDS = new Set([
  "warn",
  "mute",
  "timeout",
  "warnings",
  "clearwarnings",
  "unmute"
]);
const PREFIX_MODERATION_ROLE_IDS = [
  "1479263062065152111",
  "1479263536797454489",
  "1483555926492451118",
  "1479263836778532934",
  "1493298416363765941",
  "1479264180866388089",
  "1479264429383225520",
  "1483497619090178098"
];
const WHOIS_ORGANIZER_ROLE_HINTS = [
  "division",
  "hub",
  "system",
  "command core",
  "level roles",
  "ping roles",
  "staff division",
  "support hub",
  "alert system"
];

function formatAfkDuration(ms) {
  const duration = Math.max(0, Number(ms) || 0);
  const totalMinutes = Math.floor(duration / 60000);
  if (totalMinutes <= 0) {
    return "just now";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  if (minutes <= 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function stripAfkPrefix(name) {
  return String(name || "")
    .replace(/^\s*\[AFK\]\s*/i, "")
    .trim();
}

function buildAfkNickname(baseName) {
  const cleaned = stripAfkPrefix(baseName) || "AFK";
  return `${AFK_NICK_PREFIX} ${cleaned}`.slice(0, 32);
}

async function setAfkNickname(member, originalNickname) {
  if (!member?.manageable) {
    return false;
  }

  const baseName =
    stripAfkPrefix(originalNickname) ||
    stripAfkPrefix(member.displayName) ||
    member.user?.username ||
    "AFK";
  const nextNickname = buildAfkNickname(baseName);
  if (member.nickname === nextNickname) {
    return true;
  }

  await member.setNickname(nextNickname, "AFK status enabled").catch(() => null);
  return true;
}

async function restoreAfkNickname(member, originalNickname) {
  if (!member?.manageable) {
    return false;
  }

  const currentName = String(member.nickname || member.displayName || "");
  if (!/^\s*\[AFK\]/i.test(currentName)) {
    return true;
  }

  const nextNickname =
    originalNickname === undefined || originalNickname === null
      ? null
      : String(originalNickname).slice(0, 32);
  await member.setNickname(nextNickname, "AFK status cleared").catch(() => null);
  return true;
}

async function handlePrefixAfk(message, args) {
  const reason = String(Array.isArray(args) ? args.join(" ") : "")
    .trim()
    .slice(0, 160);
  const previousAccount = await getAccount(message.guild.id, message.author.id).catch(
    () => null
  );
  const member =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  const originalNickname =
    previousAccount?.afk && Object.prototype.hasOwnProperty.call(previousAccount, "afkOriginalNickname")
      ? previousAccount.afkOriginalNickname
      : member?.nickname ?? null;

  await updateAccount(message.guild.id, message.author.id, async (acc) => {
    acc.afk = true;
    acc.afkSince = Date.now();
    acc.afkReason = reason || null;
    acc.afkOriginalNickname = originalNickname;
  }).catch(() => null);

  await setAfkNickname(member, originalNickname);

  const sent = await message.channel
    .send({
      content: reason
        ? `${message.author} i set ur afk : ${reason}`
        : `${message.author} i set ur afk`,
      allowedMentions: { users: [message.author.id], roles: [] }
    })
    .catch(() => null);

  if (sent?.deletable) {
    setTimeout(() => sent.delete().catch(() => null), AFK_CONFIRM_DELETE_MS);
  }

  return true;
}

async function clearAuthorAfk(message, account) {
  const originalNickname = Object.prototype.hasOwnProperty.call(
    account || {},
    "afkOriginalNickname"
  )
    ? account.afkOriginalNickname
    : null;
  const member =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));

  await updateAccount(message.guild.id, message.author.id, async (acc) => {
    acc.afk = false;
    acc.afkSince = null;
    acc.afkReason = null;
    acc.afkOriginalNickname = null;
  }).catch(() => null);

  await restoreAfkNickname(member, originalNickname);
}

async function buildAfkMentionLines(message) {
  const users = message?.mentions?.users;
  if (!users || users.size === 0) {
    return [];
  }

  const lines = [];
  const now = Date.now();
  for (const user of users.values()) {
    if (!user || user.bot || user.id === message.author.id) {
      continue;
    }

    const account = await getAccount(message.guild.id, user.id).catch(() => null);
    if (!account?.afk) {
      continue;
    }

    const reason = String(account.afkReason || "").trim();
    const since = Number(account.afkSince || 0);
    const sinceText = since > 0 ? formatAfkDuration(now - since) : "unknown";
    lines.push(
      reason
        ? `${user} is AFK (${sinceText}). Reason: ${reason}`
        : `${user} is AFK (${sinceText}).`
    );
  }

  return lines;
}

function sleep(ms) {
  const delay = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function extractReferencedMessageId(candidateMessage) {
  return (
    String(candidateMessage?.reference?.messageId || "").trim() ||
    String(candidateMessage?.reference?.message_id || "").trim() ||
    null
  );
}

async function hasExistingBotReplyForSource(message) {
  const replies = await fetchRecentBotRepliesForSource(message);
  return replies.length > 0;
}

async function fetchRecentBotRepliesForSource(message, options = {}) {
  if (!message?.channel?.messages?.fetch) {
    return [];
  }

  const sourceMessageId = String(message.id || "").trim();
  const botId = String(message.client?.user?.id || "").trim();
  if (!sourceMessageId || !botId) {
    return [];
  }

  const recent = await message.channel.messages
    .fetch({ after: sourceMessageId, limit: PREFIX_RESPONSE_FETCH_LIMIT })
    .catch(() => null);
  if (!recent) {
    return [];
  }

  const now = Date.now();
  const withinMs =
    Number.isFinite(Number(options.withinMs)) && Number(options.withinMs) > 0
      ? Number(options.withinMs)
      : PREFIX_RESPONSE_DEDUPE_LOOKBACK_MS;
  const replies = [];
  for (const candidate of recent.values()) {
    if (String(candidate.author?.id || "") !== botId) {
      continue;
    }
    if (now - Number(candidate.createdTimestamp || 0) > withinMs) {
      continue;
    }
    if (extractReferencedMessageId(candidate) === sourceMessageId) {
      replies.push(candidate);
    }
  }

  return replies;
}

async function sendDedupedPrefixReply(message, payload) {
  if (await hasExistingBotReplyForSource(message)) {
    return false;
  }

  let sent = await message.reply(payload).catch(() => null);
  if (!sent && message?.channel?.send) {
    sent = await message.channel.send(payload).catch(() => null);
  }
  if (!sent) {
    return false;
  }

  const cleanupDuplicates = async () => {
    const replies = await fetchRecentBotRepliesForSource(message, {
      withinMs: PREFIX_RESPONSE_DEDUPE_LOOKBACK_MS * 2
    });
    if (replies.length <= 1) {
      return true;
    }

    replies.sort((left, right) => {
      const byCreated =
        Number(left.createdTimestamp || 0) - Number(right.createdTimestamp || 0);
      if (byCreated !== 0) {
        return byCreated;
      }
      return String(left.id || "").localeCompare(String(right.id || ""));
    });

    const survivor = replies[0];
    for (const candidate of replies) {
      if (candidate.id === survivor.id) {
        continue;
      }
      await candidate.delete().catch(() => null);
    }
    return sent.id === survivor.id;
  };

  await sleep(PREFIX_RESPONSE_SETTLE_MS);
  const firstPass = await cleanupDuplicates();

  // Late pass catches duplicates from slower second instance/host.
  setTimeout(() => {
    cleanupDuplicates().catch(() => null);
  }, PREFIX_RESPONSE_SECOND_PASS_MS);

  return firstPass;
}

function shouldSkipDuplicateMessage(messageId) {
  if (!messageId) {
    return false;
  }

  const now = Date.now();
  const seenAt = processedMessageIds.get(messageId);
  if (seenAt && now - seenAt < MESSAGE_PROCESS_TTL_MS) {
    return true;
  }

  processedMessageIds.set(messageId, now);

  for (const [cachedMessageId, cachedAt] of processedMessageIds) {
    if (now - cachedAt > MESSAGE_PROCESS_TTL_MS) {
      processedMessageIds.delete(cachedMessageId);
    }
  }

  return false;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBlockedWord(content, blockedWords) {
  if (!content || !Array.isArray(blockedWords) || blockedWords.length === 0) {
    return null;
  }

  for (const rawWord of blockedWords) {
    const word = String(rawWord || "").trim().toLowerCase();
    if (!word) {
      continue;
    }
    const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
    if (pattern.test(content)) {
      return word;
    }
  }

  return null;
}

function getAutoWarnConsequence(totalWarnings) {
  if (totalWarnings >= 5) {
    return { action: "ban", text: "User was banned at 5 warnings" };
  }
  if (totalWarnings >= 4) {
    return { action: "kick", text: "User was kicked at 4 warnings" };
  }
  if (totalWarnings >= 3) {
    return {
      action: "timeout",
      timeoutMinutes: 60,
      text: "User was timed out for 60 minutes at 3 warnings"
    };
  }
  return null;
}

async function applyAutoWarnConsequence(member, consequence, actorTag) {
  if (!member || !consequence) {
    return { applied: false };
  }

  if (consequence.action === "timeout") {
    if (!member.moderatable) {
      return { applied: false, failure: "Could not timeout user due to role hierarchy." };
    }
    await member.timeout(
      consequence.timeoutMinutes * 60 * 1000,
      `Blocked words automod threshold reached | By ${actorTag}`
    );
    return { applied: true, actionText: consequence.text };
  }

  if (consequence.action === "kick") {
    if (!member.kickable) {
      return { applied: false, failure: "Could not kick user due to role hierarchy." };
    }
    await member.kick(`Blocked words automod threshold reached | By ${actorTag}`);
    return { applied: true, actionText: consequence.text };
  }

  if (consequence.action === "ban") {
    if (!member.bannable) {
      return { applied: false, failure: "Could not ban user due to role hierarchy." };
    }
    await member.ban({
      reason: `Blocked words automod threshold reached | By ${actorTag}`,
      deleteMessageSeconds: 0
    });
    return { applied: true, actionText: consequence.text };
  }

  return { applied: false };
}

function shouldAwardXp(guildId, userId, settings) {
  const key = `${guildId}:${userId}`;
  const lastXpAt = xpCooldown.get(key) || 0;
  const now = Date.now();
  const cooldownSecondsRaw =
    settings.messageXpCooldownSeconds == null
      ? 60
      : Number(settings.messageXpCooldownSeconds);
  const cooldownMs =
    Number.isFinite(cooldownSecondsRaw) && cooldownSecondsRaw > 0
      ? cooldownSecondsRaw * 1000
      : 60 * 1000;

  if (now - lastXpAt < cooldownMs) {
    return false;
  }
  xpCooldown.set(key, now);
  return true;
}

async function grantLevelRewards(member, level, settings) {
  if (!member || !Array.isArray(settings.levelRewards)) {
    return [];
  }

  const granted = [];
  const eligibleRewards = settings.levelRewards.filter(
    (reward) => level >= reward.level
  );

  for (const reward of eligibleRewards) {
    if (member.roles.cache.has(reward.roleId)) {
      continue;
    }

    try {
      await member.roles.add(
        reward.roleId,
        `Level reward for reaching level ${level}`
      );
      await ensureRoleHasLevelSpecialPermissions(member.guild, reward.roleId).catch(
        () => null
      );
      granted.push(reward);
    } catch {
      // continue applying other rewards even if one fails
    }
  }

  return granted;
}

function truncateFieldValue(text, maxLength = 1024) {
  const value = String(text || "");
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 14))}\n... (trimmed)`;
}

function formatDynoStyleDate(timestamp) {
  if (!timestamp || !Number.isFinite(Number(timestamp))) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(Number(timestamp)));
}

function getAcceptedPrefixes(settings) {
  const configuredPrefixRaw = String(settings?.prefix || config.prefix || "!").trim();
  const configuredPrefix = configuredPrefixRaw === "/" ? "+" : configuredPrefixRaw;
  const prefixes = Array.from(
    new Set(
      [configuredPrefix, "+", "!"].filter((entry) => String(entry || "").trim().length > 0)
    )
  );
  return prefixes.sort((a, b) => b.length - a.length);
}

function parseUserIdFromArg(arg) {
  const raw = String(arg || "").trim();
  if (!raw) {
    return null;
  }

  const mentionMatch = raw.match(userMentionRegex);
  if (mentionMatch?.[1]) {
    return mentionMatch[1];
  }

  if (/^\d{17,20}$/.test(raw)) {
    return raw;
  }

  return null;
}

function normalizeMemberSearchQuery(value) {
  return String(value || "").trim().replace(/^@+/, "");
}

function getMemberSearchScore(member, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!member || !normalizedQuery) {
    return 0;
  }

  const displayName = String(member.displayName || "").toLowerCase();
  const username = String(member.user?.username || "").toLowerCase();
  const tag = String(member.user?.tag || "").toLowerCase();
  const id = String(member.id || "").toLowerCase();

  if (id === normalizedQuery) {
    return 1000;
  }
  if (tag === normalizedQuery) {
    return 950;
  }
  if (displayName === normalizedQuery) {
    return 900;
  }
  if (username === normalizedQuery) {
    return 850;
  }
  if (displayName.startsWith(normalizedQuery)) {
    return 800;
  }
  if (username.startsWith(normalizedQuery)) {
    return 780;
  }
  if (displayName.includes(normalizedQuery)) {
    return 700;
  }
  if (username.includes(normalizedQuery)) {
    return 680;
  }

  return 0;
}

async function resolveMemberByQuery(guild, rawQuery) {
  const query = normalizeMemberSearchQuery(rawQuery);
  if (!guild || !query) {
    return null;
  }

  const cachedMatches = guild.members.cache
    .map((member) => ({ member, score: getMemberSearchScore(member, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  if (cachedMatches.length > 0) {
    return cachedMatches[0].member;
  }

  const fetched = await guild.members.fetch({ query, limit: 25 }).catch(() => null);
  if (!fetched || fetched.size === 0) {
    return null;
  }

  const fetchedMatches = [...fetched.values()]
    .map((member) => ({ member, score: getMemberSearchScore(member, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return fetchedMatches[0]?.member || null;
}

function detectWinOrLoseResult(content) {
  const text = String(content || "").toLowerCase();
  if (!text) {
    return null;
  }
  if (text.includes("you won") || text.includes(" won ")) {
    return "win";
  }
  if (text.includes("you lost") || text.includes(" lose ") || text.includes(" loss ")) {
    return "loss";
  }
  return null;
}

function parseAnnouncedLevelFromMessage(candidate, targetUserId) {
  const normalizedTargetUserId = String(targetUserId || "").trim();
  if (!normalizedTargetUserId) {
    return null;
  }

  const contentText = String(candidate?.content || "");
  const contentMatch = contentText.match(
    new RegExp(`<@!?${escapeRegex(normalizedTargetUserId)}>.*?Level\\s+(\\d+)`, "i")
  );
  if (contentMatch?.[1]) {
    const parsed = Number(contentMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  const embed = candidate?.embeds?.[0];
  const fields = Array.isArray(embed?.fields) ? embed.fields : [];
  const userField = fields.find(
    (field) => String(field?.name || "").toLowerCase() === "user"
  );
  const levelField = fields.find(
    (field) => String(field?.name || "").toLowerCase() === "new level"
  );
  if (!userField || !levelField) {
    return null;
  }

  if (!String(userField.value || "").includes(normalizedTargetUserId)) {
    return null;
  }

  const parsed = Number(String(levelField.value || "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

async function getRecentHighestAnnouncedLevel(channel, botUserId, targetUserId) {
  if (!channel?.messages?.fetch || !botUserId || !targetUserId) {
    return null;
  }

  const recent = await channel.messages
    .fetch({ limit: LEVEL_ANNOUNCE_LOOKBACK_LIMIT })
    .catch(() => null);
  if (!recent) {
    return null;
  }

  let highest = null;
  for (const candidate of recent.values()) {
    if (String(candidate.author?.id || "") !== String(botUserId)) {
      continue;
    }
    const announcedLevel = parseAnnouncedLevelFromMessage(candidate, targetUserId);
    if (announcedLevel == null) {
      continue;
    }
    if (highest == null || announcedLevel > highest) {
      highest = announcedLevel;
    }
  }

  return highest;
}

function extractTargetUserIdFromMessage(message) {
  const mentioned = message.mentions?.users?.first?.();
  if (mentioned?.id) {
    return mentioned.id;
  }
  const match = String(message.content || "").match(/<@!?(\d{17,20})>/);
  return match?.[1] || null;
}

async function resolveTargetFromArgs(message, args) {
  const queryText = String(Array.isArray(args) ? args.join(" ").trim() : "");
  const hasQuery = queryText.length > 0;
  const mentionedMember = message.mentions?.members?.first?.();
  if (mentionedMember) {
    return { member: mentionedMember, user: mentionedMember.user };
  }

  const userId = parseUserIdFromArg(args?.[0]);
  if (userId) {
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (member) {
      return { member, user: member.user };
    }

    const user = await message.client.users.fetch(userId).catch(() => null);
    if (user) {
      return { member: null, user };
    }
  }

  if (hasQuery) {
    const queriedMember = await resolveMemberByQuery(message.guild, queryText);
    if (queriedMember) {
      return { member: queriedMember, user: queriedMember.user };
    }
    return { member: null, user: null };
  }

  return { member: message.member || null, user: message.author };
}

function collectModerationPermissionLabels(member) {
  if (!member?.permissions?.has) {
    return null;
  }

  const checks = [
    [PermissionFlagsBits.Administrator, "Administrator"],
    [PermissionFlagsBits.ManageGuild, "Manage Server"],
    [PermissionFlagsBits.ManageChannels, "Manage Channels"],
    [PermissionFlagsBits.ManageRoles, "Manage Roles"],
    [PermissionFlagsBits.ModerateMembers, "Timeout Members"],
    [PermissionFlagsBits.KickMembers, "Kick Members"],
    [PermissionFlagsBits.BanMembers, "Ban Members"],
    [PermissionFlagsBits.ManageMessages, "Manage Messages"],
    [PermissionFlagsBits.ViewAuditLog, "View Audit Log"],
    [PermissionFlagsBits.MentionEveryone, "Mention Everyone"]
  ];

  const enabled = checks
    .filter(([permissionBit]) => member.permissions.has(permissionBit))
    .map(([, label]) => label);

  return enabled;
}

function isOrganizerRoleName(roleName) {
  const name = String(roleName || "");
  const normalized = name.toLowerCase();
  if (/[─—_=]{3,}|[|│┃]{2,}|[-_ ]{6,}/.test(name)) {
    return true;
  }

  return WHOIS_ORGANIZER_ROLE_HINTS.some((hint) => normalized.includes(hint));
}

function getPreferredWhoisColor(member) {
  if (!member?.roles?.cache) {
    return 0x2b2d31;
  }

  const sortedRoles = member.roles.cache
    .filter((role) => role.id !== member.guild.roles.everyone.id)
    .sort((a, b) => b.position - a.position);

  const firstColoredNonOrganizer = sortedRoles.find((role) => {
    if (!role || Number(role.color || 0) <= 0) {
      return false;
    }
    return !isOrganizerRoleName(role.name);
  });

  if (firstColoredNonOrganizer) {
    return Number(firstColoredNonOrganizer.color) || 0x2b2d31;
  }

  const firstColored = sortedRoles.find((role) => Number(role?.color || 0) > 0);
  if (firstColored) {
    return Number(firstColored.color) || 0x2b2d31;
  }

  return Number(member.displayColor) || 0x2b2d31;
}

function splitTextItems(items, maxChars) {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) {
    return [];
  }

  const chunks = [];
  let current = "";
  for (const item of source) {
    const piece = String(item || "").trim();
    if (!piece) {
      continue;
    }
    const next = current ? `${current}, ${piece}` : piece;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = piece;
      continue;
    }
    current = next;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

async function handlePrefixWhois(message, args, commandPrefix = null) {
  if (!(await ensureCmdsOnly(message, "w", commandPrefix))) {
    return true;
  }

  const target = await resolveTargetFromArgs(message, args);
  if (!target.member) {
    await message.reply({
      embeds: [
        buildResultEmbed({
          title: "User Check Failed",
          color: 0xed4245,
          fields: [
            {
              name: "Reason",
              value: "That user is not in this server."
            }
          ],
          footer: "Prefix Commands"
        })
      ]
    });
    return true;
  }

  const member = target.member;
  const sortedRoles = member.roles.cache
    .filter((role) => role.id !== message.guild.roles.everyone.id)
    .sort((a, b) => b.position - a.position);
  const rolePills = sortedRoles.map((role) => `${role}`);
  const allRolesInline = rolePills.length > 0 ? rolePills.join(" ") : "No roles";
  const rolesNeedDescription = allRolesInline.length > WHOIS_ROLE_FIELD_MAX_CHARS;
  const rolesFieldValue = rolesNeedDescription
    ? "All roles are listed in the embed description below."
    : allRolesInline;
  const topRoleColor = getPreferredWhoisColor(member);

  const joinedAt = formatDynoStyleDate(member.joinedTimestamp);
  const createdAt = formatDynoStyleDate(member.user.createdTimestamp);
  const fields = [
      { name: "\u200B", value: `<@${member.id}>` },
      { name: "Joined", value: joinedAt, inline: true },
      { name: "Registered", value: createdAt, inline: true },
      {
        name: `Roles [${rolePills.length}]`,
        value: truncateFieldValue(rolesFieldValue, 1000)
      }
  ];

  const permissionLabels = collectModerationPermissionLabels(member);
  if (!permissionLabels) {
    fields.push({
      name: "Moderation Permissions",
      value: "Unknown"
    });
  } else if (permissionLabels.length === 0) {
    fields.push({
      name: "Moderation Permissions",
      value: "None"
    });
  } else {
    const permissionChunks = splitTextItems(
      permissionLabels,
      WHOIS_PERMISSION_FIELD_MAX_CHARS
    );
    permissionChunks.forEach((chunk, index) => {
      fields.push({
        name:
          permissionChunks.length === 1
            ? `Moderation Permissions [${permissionLabels.length}]`
            : `Moderation Permissions ${index + 1}/${permissionChunks.length} [${permissionLabels.length}]`,
        value: chunk
      });
    });
  }

  const embed = buildResultEmbed({
    title: member.displayName || member.user.username,
    color: topRoleColor,
    description: rolesNeedDescription
      ? `**Roles [${rolePills.length}]**\n${truncateFieldValue(
          allRolesInline,
          WHOIS_ROLE_DESCRIPTION_MAX_CHARS
        )}`
      : undefined,
    fields,
    footer: `ID: ${member.id}`
  }).setThumbnail(
    member.user.displayAvatarURL({
      extension: "png",
      size: 512,
      forceStatic: false
    })
  );

  await sendDedupedPrefixReply(message, {
    allowedMentions: { parse: [] },
    embeds: [embed]
  });
  return true;
}

async function handlePrefixAvatar(message, args, commandPrefix = null) {
  if (!(await ensureCmdsOnly(message, "pfp", commandPrefix))) {
    return true;
  }

  const target = await resolveTargetFromArgs(message, args);
  if (!target.user && Array.isArray(args) && args.length > 0) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Avatar Check Failed",
          color: 0xed4245,
          fields: [
            {
              name: "Reason",
              value: "That user is not in this server."
            }
          ],
          footer: "Prefix Commands"
        })
      ]
    });
    return true;
  }

  const user = target.user || message.author;
  if (!user) {
    return false;
  }

  const avatarUrl = user.displayAvatarURL({
    extension: "png",
    size: 4096,
    forceStatic: false
  });

  const embed = buildResultEmbed({
    title: `${user.username}'s Profile Picture`,
    color: 0x57f287,
    fields: [
      { name: "User", value: `${user.tag} (${user.id})` },
      { name: "Link", value: `[Open Avatar](${avatarUrl})` }
    ],
    footer: "Prefix Commands"
  }).setImage(avatarUrl);

  await sendDedupedPrefixReply(message, { embeds: [embed] });
  return true;
}

async function handlePrefixMemberStats(message, commandPrefix = null) {
  if (!(await ensureCmdsOnly(message, "member", commandPrefix))) {
    return true;
  }

  const guild = message.guild;
  if (!guild) {
    return false;
  }

  let totalMembers = Number(guild.memberCount || guild.members.cache.size || 0);
  const onlineStates = new Set(["online", "idle", "dnd"]);

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

  // Fallback that does not rely on presence cache/intents.
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
      // ignore fallback fetch errors
    }
  }

  const embed = buildResultEmbed({
    title: "Server Members",
    color: 0x5865f2,
    fields: [
      {
        name: "Total Members",
        value: new Intl.NumberFormat("en-US").format(totalMembers),
        inline: true
      },
      {
        name: "Online Members",
        value: new Intl.NumberFormat("en-US").format(onlineMembers),
        inline: true
      }
    ],
    footer: "Prefix Commands"
  });

  await sendDedupedPrefixReply(message, {
    allowedMentions: { parse: [] },
    embeds: [embed]
  });
  return true;
}

function normalizeChannelLookup(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isCmdsChannel(channel) {
  const normalized = normalizeChannelLookup(channel?.name || "");
  return (
    normalized.includes("cmds") ||
    normalized.includes("command") ||
    normalized.includes("bot commands")
  );
}

function findCmdsChannel(guild) {
  if (!guild?.channels?.cache) {
    return null;
  }
  return (
    guild.channels.cache.find(
      (channel) => channel.type === 0 && isCmdsChannel(channel)
    ) || null
  );
}

function hasAnyRoleInList(member, roleIds) {
  if (!member?.roles?.cache?.has || !Array.isArray(roleIds) || roleIds.length === 0) {
    return false;
  }
  return roleIds.some((roleId) => member.roles.cache.has(String(roleId || "").trim()));
}

function canUsePrefixAnywhere(member, commandName, settings) {
  const normalizedCommandName = String(commandName || "").trim().toLowerCase();
  if (!PREFIX_ANYWHERE_COMMANDS.has(normalizedCommandName)) {
    return false;
  }
  const allowedRoleIds = Array.isArray(settings?.prefixAnywhereRoleIds)
    ? settings.prefixAnywhereRoleIds
    : [];
  return hasAnyRoleInList(member, allowedRoleIds);
}

function canUsePrefixModeration(member, commandName) {
  const normalizedCommandName = String(commandName || "").trim().toLowerCase();
  if (!PREFIX_MODERATION_COMMANDS.has(normalizedCommandName)) {
    return false;
  }
  return (
    member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) ||
    hasAnyRoleInList(member, PREFIX_MODERATION_ROLE_IDS)
  );
}

async function ensureCmdsOnly(message, commandName, commandPrefix = null) {
  const settings = getGuildSettingsSync(message.guild?.id);
  if (isCmdsChannel(message.channel)) {
    return true;
  }
  if (
    message.member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
    message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    message.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages)
  ) {
    return true;
  }
  if (hasAnyRoleInList(message.member, settings?.fullCommandRoleIds || [])) {
    return true;
  }
  if (hasAnyRoleInList(message.member, settings?.timeoutOnlyRoleIds || [])) {
    return true;
  }
  if (canUsePrefixAnywhere(message.member, commandName, settings)) {
    return true;
  }

  const cmdsChannel = findCmdsChannel(message.guild);
  const displayPrefix = (() => {
    const direct = String(commandPrefix || "").trim();
    if (direct) {
      return direct;
    }
    const configured = String(config.prefix || "!").trim();
    return configured || "!";
  })();
  await sendDedupedPrefixReply(message, {
    allowedMentions: { parse: [] },
    embeds: [
      buildResultEmbed({
        title: "Wrong Channel",
        color: 0xed4245,
        fields: [
          {
            name: "Use",
            value: cmdsChannel
              ? `Use \`${displayPrefix}${commandName}\` in ${cmdsChannel}.`
              : `Use \`${displayPrefix}${commandName}\` in your cmds channel.`
          }
        ],
        footer: "Prefix Commands"
      })
    ]
  });
  return false;
}

async function handlePrefixRank(message, args, commandPrefix = null) {
  if (!(await ensureCmdsOnly(message, "rank", commandPrefix))) {
    return true;
  }

  const target = await resolveTargetFromArgs(message, args);
  if (!target.user) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Rank Check Failed",
          color: 0xed4245,
          fields: [{ name: "Reason", value: "That user was not found." }],
          footer: "Prefix Commands"
        })
      ]
    });
    return true;
  }

  const stats = await getUserLevel({
    guildId: message.guild.id,
    userId: target.user.id
  });
  const leaderboard = await getLeaderboard({
    guildId: message.guild.id,
    limit: Math.max(500, Number(message.guild.memberCount || 0) + 100)
  });
  const rankIndex = leaderboard.findIndex((entry) => String(entry.userId) === String(target.user.id));
  const rankText = rankIndex >= 0 ? `#${rankIndex + 1}` : "Unranked";

  await sendDedupedPrefixReply(message, {
    allowedMentions: { parse: [] },
    embeds: [
      buildResultEmbed({
        title: "Rank Stats",
        color: 0x57f287,
        fields: [
          { name: "User", value: `<@${target.user.id}>` },
          { name: "Rank", value: rankText, inline: true },
          { name: "Level", value: String(stats.level), inline: true },
          { name: "XP", value: `${stats.xp}/${stats.neededXp}`, inline: true }
        ],
        footer: "Prefix Commands"
      })
    ]
  });
  return true;
}

function splitTargetAndReason(args) {
  const parts = Array.isArray(args) ? [...args] : [];
  const targetArg = parts.shift();
  return {
    targetArg,
    reason: parts.join(" ").trim()
  };
}

async function resolvePrefixModerationTarget(message, targetArg) {
  if (!targetArg) {
    return { member: null, user: null };
  }
  return resolveTargetFromArgs(message, [targetArg]);
}

async function handlePrefixWarn(message, args, commandPrefix = null) {
  if (!(await ensureCmdsOnly(message, "warn", commandPrefix))) {
    return true;
  }
  if (!canUsePrefixModeration(message.member, "warn") && !canUseCommand(message.member, "warn")) {
    return true;
  }

  const { targetArg, reason } = splitTargetAndReason(args);
  const target = await resolvePrefixModerationTarget(message, targetArg);
  if (!target.member || !reason) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Warn Failed",
          color: 0xed4245,
          description: `Use \`${commandPrefix || "+"}warn user reason\`.`
        })
      ]
    });
    return true;
  }
  if (!canModerate(message.member, target.member)) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Warn Failed",
          color: 0xed4245,
          description: "You cannot warn this user due to role hierarchy."
        })
      ]
    });
    return true;
  }

  const warning = await addWarning({
    guildId: message.guild.id,
    userId: target.user.id,
    moderatorId: message.author.id,
    reason
  });
  const warnings = await getWarnings({
    guildId: message.guild.id,
    userId: target.user.id
  });

  const warnEmbed = buildLogEmbed({
    title: "User Warned",
    color: 0xffae42,
    fields: [
      { name: "User", value: `${target.user.tag} (${target.user.id})` },
      { name: "Moderator", value: `${message.author.username}` },
      { name: "Reason", value: reason.slice(0, 1024) },
      { name: "Warning ID", value: warning.id },
      { name: "Total Warnings", value: String(warnings.length) }
    ]
  });

  const resultEmbed = buildResultEmbed({
    title: `✅ ${target.user.username} has been warned.`,
    color: 0x57f287,
    footer: "Prefix Commands"
  });
  await sendDedupedPrefixReply(message, { embeds: [resultEmbed] });
  await sendModLog(message.guild, warnEmbed).catch(() => null);
  await sendWarnDM(
    message.client,
    target.user,
    message.guild.name,
    reason,
    message.author.tag,
    warning.id,
    warnings.length
  ).catch(() => null);
  return true;
}

function parseTimeoutArgs(args) {
  const parts = Array.isArray(args) ? [...args] : [];
  const targetArg = parts.shift();
  let minutes = 10;
  const durationArg = String(parts[0] || "").trim().toLowerCase();
  if (/^\d+$/.test(durationArg)) {
    minutes = Math.min(10080, Math.max(1, Number(parts.shift())));
  } else if (/^\d+[mhd]$/.test(durationArg)) {
    const raw = Number(durationArg.slice(0, -1));
    const unit = durationArg.slice(-1);
    parts.shift();
    if (unit === "m") {
      minutes = Math.min(10080, Math.max(1, raw));
    } else if (unit === "h") {
      minutes = Math.min(10080, Math.max(1, raw * 60));
    } else if (unit === "d") {
      minutes = Math.min(10080, Math.max(1, raw * 60 * 24));
    }
  }
  return { targetArg, minutes, reason: parts.join(" ").trim() };
}

async function handlePrefixTimeout(message, args, commandPrefix = null, mode = "timeout") {
  const isMute = mode === "mute";
  if (!(await ensureCmdsOnly(message, isMute ? "mute" : "timeout", commandPrefix))) {
    return true;
  }
  if (
    !canUsePrefixModeration(message.member, isMute ? "mute" : "timeout") &&
    !canUseCommand(message.member, "timeout")
  ) {
    return true;
  }

  const { targetArg, minutes, reason } = parseTimeoutArgs(args);
  const target = await resolvePrefixModerationTarget(message, targetArg);
  if (!target.member || !reason) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: isMute ? "Mute Failed" : "Timeout Failed",
          color: 0xed4245,
          description: isMute
            ? `Use \`${commandPrefix || "+"}mute user [5m|1h|1d|minutes] reason\`.`
            : `Use \`${commandPrefix || "+"}timeout user [5m|1h|1d|minutes] reason\`.`
        })
      ]
    });
    return true;
  }
  if (!target.member.moderatable || !canModerate(message.member, target.member)) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: isMute ? "Mute Failed" : "Timeout Failed",
          color: 0xed4245,
          description: isMute
            ? "I cannot mute this user due to role hierarchy."
            : "I cannot timeout this user due to role hierarchy."
        })
      ]
    });
    return true;
  }

  await target.member.timeout(minutes * 60 * 1000, `${reason} | By ${message.author.tag}`);
  await sendTimeoutDM(
    message.client,
    target.user,
    message.guild.name,
    reason,
    message.author.tag,
    minutes,
    Math.floor((Date.now() + minutes * 60 * 1000) / 1000)
  ).catch(() => null);
  const logEmbed = buildLogEmbed({
    title: isMute ? "User Muted" : "User Timed Out",
    color: 0xf1c40f,
    fields: [
      { name: "User", value: `${target.user.tag} (${target.user.id})` },
      { name: "Moderator", value: `${message.author.username}` },
      { name: "Duration", value: `${minutes} minute(s)` },
      { name: "Reason", value: reason.slice(0, 1024) }
    ]
  });

  const resultEmbed = buildResultEmbed({
    title: isMute
      ? `✅ ${target.user.username} was muted.`
      : `✅ ${target.user.username} was timed out.`,
    color: 0x57f287,
    footer: "Prefix Commands"
  });
  await sendDedupedPrefixReply(message, { embeds: [resultEmbed] });
  await sendModLog(message.guild, logEmbed).catch(() => null);
  return true;
}

async function handlePrefixUnmute(message, args, commandPrefix = null) {
  if (!(await ensureCmdsOnly(message, "unmute", commandPrefix))) {
    return true;
  }
  if (!canUsePrefixModeration(message.member, "unmute") && !canUseCommand(message.member, "unmute")) {
    return true;
  }

  const { targetArg, reason } = splitTargetAndReason(args);
  const target = await resolvePrefixModerationTarget(message, targetArg);
  if (!target.member) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Unmute Failed",
          color: 0xed4245,
          description: `Use \`${commandPrefix || "+"}unmute user [reason]\`.`
        })
      ]
    });
    return true;
  }
  if (!canModerate(message.member, target.member)) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Unmute Failed",
          color: 0xed4245,
          description: "You cannot unmute this user due to role hierarchy."
        })
      ]
    });
    return true;
  }
  if (!target.member.isCommunicationDisabled()) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Unmute Failed",
          color: 0xed4245,
          description: "This user is not muted."
        })
      ]
    });
    return true;
  }

  const finalReason = reason || "No reason provided";
  await target.member.timeout(null, `${finalReason} | By ${message.author.tag}`);
  await sendUnmuteDM(
    message.client,
    target.user,
    message.guild.name,
    message.author.tag
  ).catch(() => null);
  const logEmbed = buildLogEmbed({
    title: "User Unmuted",
    color: 0x57f287,
    fields: [
      { name: "User", value: `${target.user.tag} (${target.user.id})` },
      { name: "Moderator", value: `${message.author.username}` },
      { name: "Reason", value: finalReason.slice(0, 1024) }
    ]
  });
  const resultEmbed = buildResultEmbed({
    title: `✅ ${target.user.username} was unmuted.`,
    color: 0x57f287,
    footer: "Prefix Commands"
  });
  await sendDedupedPrefixReply(message, { embeds: [resultEmbed] });
  await sendModLog(message.guild, logEmbed).catch(() => null);
  return true;
}

async function handlePrefixWarnings(message, args, commandPrefix = null) {
  if (!(await ensureCmdsOnly(message, "warnings", commandPrefix))) {
    return true;
  }
  if (!canUsePrefixModeration(message.member, "warnings") && !canUseCommand(message.member, "warnings")) {
    return true;
  }

  const target = await resolveTargetFromArgs(message, args);
  if (!target.user) {
    return true;
  }

  const warnings = await getWarnings({ guildId: message.guild.id, userId: target.user.id });
  const total = warnings.length;

  if (total === 0) {
    await sendDedupedPrefixReply(message, {
      allowedMentions: { parse: [] },
      embeds: [
        buildResultEmbed({
          title: `0 Warnings for ${target.user.username} (${target.user.id})`,
          color: 0x57f287,
          footer: "Moderation Log"
        })
      ]
    });
    return true;
  }

  const lines = warnings.slice(-10).map((entry, index) => {
    const unix = Math.floor(new Date(entry.timestamp).getTime() / 1000);
    const when = Number.isFinite(unix) && unix > 0 ? `<t:${unix}:R>` : "unknown time";
    return `**Moderator:** <@${entry.moderatorId}>\n${entry.reason}\n${index + 1} - ${when}`;
  });

  await sendDedupedPrefixReply(message, {
    allowedMentions: { parse: [] },
    embeds: [
      buildResultEmbed({
        title: `${total} Warnings for ${target.user.username} (${target.user.id})`,
        color: 0xed4245,
        fields: [
          {
            name: "\u200b",
            value: truncateFieldValue(lines.join("\n\n"), 1024)
          }
        ],
        footer: "Moderation Log"
      })
    ]
  });

  await sendModLog(
    message.guild,
    buildLogEmbed({
      title: "Warnings Lookup",
      color: 0xfaa61a,
      fields: [
        { name: "Target User", value: `${target.user.tag} (${target.user.id})` },
        { name: "Checked By", value: `${message.author.tag}` },
        { name: "Total Warnings", value: String(total) }
      ]
    })
  ).catch(() => null);

  return true;
}

async function handlePrefixClearWarnings(message, args, commandPrefix = null) {
  if (!(await ensureCmdsOnly(message, "clearwarnings", commandPrefix))) {
    return true;
  }
  if (
    !canUsePrefixModeration(message.member, "clearwarnings") &&
    !canUseCommand(message.member, "clearwarnings")
  ) {
    return true;
  }
  const { targetArg, reason } = splitTargetAndReason(args);
  const target = await resolvePrefixModerationTarget(message, targetArg);
  if (!target.user) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Clear Warnings Failed",
          color: 0xed4245,
          description: `Use \`${commandPrefix || "+"}clearwarnings user [reason]\`.`
        })
      ]
    });
    return true;
  }
  if (target.user.id === message.author.id) {
    await sendDedupedPrefixReply(message, {
      embeds: [
        buildResultEmbed({
          title: "Clear Warnings Failed",
          color: 0xed4245,
          description: "You cannot clear your own warnings."
        })
      ]
    });
    return true;
  }
  const removedCount = await clearWarnings({
    guildId: message.guild.id,
    userId: target.user.id
  });
  const resultEmbed = buildResultEmbed({
    title: `\u2705 Cleared ${removedCount} warning${removedCount === 1 ? "" : "s"} for ${target.user.username}`,
    color: 0x57f287,
    footer: "Prefix Commands"
  });
  const finalReason = reason || "No reason provided";
  const logEmbed = buildLogEmbed({
    title: "Warnings Cleared",
    color: 0x57f287,
    fields: [
      { name: "User", value: `${target.user.tag} (${target.user.id})` },
      { name: "Moderator", value: `${message.author.username}` },
      { name: "Removed Warnings", value: String(removedCount) },
      { name: "Reason", value: finalReason.slice(0, 1024) }
    ]
  });
  await sendDedupedPrefixReply(message, { embeds: [resultEmbed] });
  await sendModLog(message.guild, logEmbed).catch(() => null);
  await sendClearWarningsDM(
    message.client,
    target.user,
    message.guild.name,
    message.author.tag,
    removedCount
  ).catch(() => null);
  return true;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild) {
      return;
    }

    if (shouldSkipDuplicateMessage(message.id)) {
      return;
    }

    const globalExecution = await runOnce({
      scope: "message_event",
      key: String(message.id || ""),
      ttlMs: MESSAGE_PROCESS_TTL_MS,
      action: async () => true
    });
    if (globalExecution.skipped) {
      return;
    }

    if (message.author.bot) {
      const autoWinOrLose = await getAutoWinOrLoseChannel(message.guild.id).catch(
        () => ({ channelId: null })
      );
      if (autoWinOrLose?.channelId && String(autoWinOrLose.channelId) === String(message.channel.id)) {
        const result = detectWinOrLoseResult(message.content);
        const targetUserId = extractTargetUserIdFromMessage(message);
        if (result && targetUserId) {
          await recordWinOrLose(message.guild.id, targetUserId, result).catch(() => null);
        }
      }
      return;
    }

    await recordGuildMessage({
      guildId: message.guild.id,
      userId: message.author.id,
      timestamp: message.createdTimestamp || Date.now()
    }).catch(() => null);

    const settings = getGuildSettingsSync(message.guild.id);
    saveMessage(message);

    const rawContent = String(message.content || "");
    const content = rawContent.toLowerCase();
    const trimmedContent = rawContent.trim();
    const acceptedPrefixes = getAcceptedPrefixes(settings);
    const matchedPrefix = acceptedPrefixes.find((prefix) =>
      trimmedContent.startsWith(prefix)
    );
    const pendingPrefixBody = matchedPrefix
      ? trimmedContent.slice(matchedPrefix.length).trim()
      : "";
    const pendingPrefixCommand = pendingPrefixBody
      ? String(pendingPrefixBody.split(/\s+/)[0] || "").toLowerCase()
      : "";

    const authorAccount = await getAccount(message.guild.id, message.author.id).catch(() => null);
    if (authorAccount?.afk && pendingPrefixCommand !== "afk") {
      await clearAuthorAfk(message, authorAccount);
    }

    const afkMentionLines = await buildAfkMentionLines(message);
    if (afkMentionLines.length > 0) {
      await sendDedupedPrefixReply(message, {
        embeds: [
          buildResultEmbed({
            title: "AFK Notice",
            color: 0xfaa61a,
            fields: afkMentionLines.map((line, index) => ({
              name: `Mention ${index + 1}`,
              value: line.slice(0, 1024)
            }))
          })
        ],
        allowedMentions: { parse: [] }
      });
    }

    if (settings.automodEnabled) {
      const member = message.member;
      if (!member?.permissions.has(PermissionFlagsBits.ManageMessages) && content) {
        let reason = null;

        const matchedBlockedWord = findBlockedWord(content, settings.blockedWords);
        const triggeredByBlockedWord = Boolean(matchedBlockedWord);
        if (triggeredByBlockedWord) {
          reason = `Blocked word detected (${matchedBlockedWord})`;
        }

        if (!reason && settings.blockInvites && inviteRegex.test(content)) {
          reason = "Discord invite links are not allowed";
        }

        if (!reason && settings.blockLinks && linkRegex.test(content)) {
          reason = "External links are not allowed";
        }

        if (reason) {
          try {
            if (!message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageMessages)) {
              return;
            }

            await message.delete().catch(() => null);
            const warningReason = triggeredByBlockedWord
              ? "Blocked language"
              : reason;
            const warning = await message.channel.send({
              embeds: [
                buildResultEmbed({
                  title: "AutoMod Notice",
                  color: 0xed4245,
                  fields: [
                    {
                      name: "User",
                      value: `${message.author}`
                    },
                    {
                      name: "Action",
                      value: "Message removed"
                    },
                    {
                      name: "Reason",
                      value: String(warningReason || "Rule violation")
                    }
                  ],
                  footer: "Moderation"
                })
              ],
              allowedMentions: { parse: [] }
            });
            // Keep the moderation notice visible (no auto-delete).

            let consequenceResult = { applied: false };
            let warningEntry = null;
            let allWarnings = [];
            if (triggeredByBlockedWord) {
              warningEntry = await addWarning({
                guildId: message.guild.id,
                userId: message.author.id,
                moderatorId: message.client.user.id,
                reason: `Automod blocked word: ${matchedBlockedWord}`
              });
              allWarnings = await getWarnings({
                guildId: message.guild.id,
                userId: message.author.id
              });
              const consequence = getAutoWarnConsequence(allWarnings.length);

              if (consequence) {
                const targetMember =
                  message.member ||
                  (await message.guild.members.fetch(message.author.id).catch(() => null));
                consequenceResult = await applyAutoWarnConsequence(
                  targetMember,
                  consequence,
                  message.client.user.tag
                );
              }
            }

            const embed = buildLogEmbed({
              title: "Automod Action",
              color: 0xff0000,
              fields: [
                {
                  name: "User",
                  value: `${message.author.tag} (${message.author.id})`
                },
                { name: "Channel", value: `${message.channel}` },
                { name: "Reason", value: reason },
                ...(warningEntry
                  ? [
                      { name: "Warning ID", value: warningEntry.id },
                      { name: "Total Warnings", value: `${allWarnings.length}` }
                    ]
                  : []),
                ...(consequenceResult.applied
                  ? [{ name: "Consequence Applied", value: consequenceResult.actionText }]
                  : []),
                ...(!consequenceResult.applied && consequenceResult.failure
                  ? [{ name: "Consequence Failed", value: consequenceResult.failure }]
                  : [])
              ]
            });

            await sendModLog(message.guild, embed);

            await sendDM(message.client, message.author, {
              title: "Message Removed by AutoMod",
              color: 0xed4245,
              description: `A message in **${message.guild.name}** was removed by AutoMod.`,
              fields: [
                { name: "Channel", value: `${message.channel}` },
                { name: "Reason", value: reason },
                ...(warningEntry
                  ? [{ name: "Warning ID", value: warningEntry.id }]
                  : []),
                ...(allWarnings.length > 0
                  ? [{ name: "Total Warnings", value: `${allWarnings.length}` }]
                  : []),
                ...(consequenceResult.applied
                  ? [{ name: "Consequence Applied", value: consequenceResult.actionText }]
                  : [])
              ]
            });
          } catch (error) {
            console.error("Automod error:", error);
          }
          return;
        }
      }
    }

    if (!trimmedContent) {
      return;
    }

    if (matchedPrefix) {
      const commandBody = trimmedContent.slice(matchedPrefix.length).trim();
      if (commandBody) {
        const [rawCommand, ...args] = commandBody.split(/\s+/);
        const command = String(rawCommand || "").toLowerCase();

        // Prefix commands use the same permission engine as slash commands
        // (enabled/disabled + allowed/denied roles).
        const resolvePrefixCommandName = (cmd) => {
          if (cmd === "w" || cmd === "whois" || cmd === "userinfo") return "prefix_whois";
          if (cmd === "pfp" || cmd === "avatar") return "prefix_pfp";
          if (cmd === "member" || cmd === "members") return "prefix_member";
          if (cmd === "rank") return "prefix_rank";
          if (cmd === "warn") return "warn";
          if (cmd === "mute") return "timeout";
          if (cmd === "timeout") return "timeout";
          if (cmd === "unmute") return "unmute";
          if (cmd === "warnings" || cmd === "wwarnings") return "warnings";
          if (cmd === "clearwarnings" || cmd === "clearwarns" || cmd === "clearwans" || cmd === "clearwarn") return "clearwarnings";
          return null;
        };
        const prefixCommandName = resolvePrefixCommandName(command);
        if (
          prefixCommandName &&
          message.member &&
          !isBotOwnerId(message.author.id) &&
          !canUseCommand(message.member, prefixCommandName)
        ) {
          // Silent ignore to avoid chat spam.
          return;
        }

        const cooldown = checkCooldown({
          guildId: message.guild.id,
          userId: message.author.id,
          bucket: "prefix_command",
          cooldownMs: PREFIX_COMMAND_COOLDOWN_MS
        });
        if (!cooldown.allowed) {
          const warning = await message
            .reply(`Cooldown. Try again in ${formatRetryAfter(cooldown.retryAfterMs)}.`)
            .catch(() => null);
          if (warning?.deletable) {
            setTimeout(() => warning.delete().catch(() => null), 5000);
          }
          return;
        }

        const jitter =
          PREFIX_RESPONSE_JITTER_MIN_MS +
          Math.floor(
            Math.random() *
              (PREFIX_RESPONSE_JITTER_MAX_MS - PREFIX_RESPONSE_JITTER_MIN_MS + 1)
          );
        await sleep(jitter);

        if (command === "afk") {
          await handlePrefixAfk(message, args);
          return;
        }

        if (command === "w" || command === "whois" || command === "userinfo") {
          await handlePrefixWhois(message, args, matchedPrefix);
          return;
        }

        if (command === "pfp" || command === "avatar") {
          await handlePrefixAvatar(message, args, matchedPrefix);
          return;
        }

        if (command === "member" || command === "members") {
          await handlePrefixMemberStats(message, matchedPrefix);
          return;
        }

        if (command === "rank") {
          await handlePrefixRank(message, args, matchedPrefix);
          return;
        }

        if (command === "warn") {
          await handlePrefixWarn(message, args, matchedPrefix);
          return;
        }

        if (command === "timeout" || command === "mute") {
          await handlePrefixTimeout(message, args, matchedPrefix, command === "mute" ? "mute" : "timeout");
          return;
        }

        if (command === "unmute") {
          await handlePrefixUnmute(message, args, matchedPrefix);
          return;
        }

        if (command === "warnings" || command === "wwarnings") {
          await handlePrefixWarnings(message, args, matchedPrefix);
          return;
        }

        if (command === "clearwarnings" || command === "clearwarns" || command === "clearwans" || command === "clearwarn") {
          await handlePrefixClearWarnings(message, args, matchedPrefix);
          return;
        }
      }
    }

    if (settings.autoresponderEnabled && Array.isArray(settings.autoresponderRules) && settings.autoresponderRules.length > 0) {
      const now = Date.now();
      const normalizedContent = content.toLowerCase();

      for (const rule of settings.autoresponderRules) {
        const trigger = String(rule?.trigger || "").trim().toLowerCase();
        const response = String(rule?.response || "").trim();
        if (!trigger || !response) {
          continue;
        }

        const matchType = String(rule?.match || "contains").toLowerCase();
        const matched =
          matchType === "exact"
            ? normalizedContent === trigger
            : normalizedContent.includes(trigger);

        if (!matched) {
          continue;
        }

        const cooldownKey = `${message.guild.id}:${message.channel.id}:${message.author.id}:${trigger}`;
        const lastAt = autoresponderCooldown.get(cooldownKey) || 0;
        if (now - lastAt < 15000) {
          break;
        }

        autoresponderCooldown.set(cooldownKey, now);
        await message.channel.send(response).catch(() => null);
        break;
      }
    }

    if (!shouldAwardXp(message.guild.id, message.author.id, settings)) {
      return;
    }

    try {
      const minRaw = settings.messageXpMin == null ? 15 : Number(settings.messageXpMin);
      const maxRaw = settings.messageXpMax == null ? 40 : Number(settings.messageXpMax);
      const min = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : 15;
      const max = Number.isFinite(maxRaw) ? Math.max(0, Math.floor(maxRaw)) : 40;
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      const baseXp = Math.floor(Math.random() * (high - low + 1)) + low;
      const isActiveBooster = Boolean(
        message.member?.premiumSinceTimestamp || message.member?.premiumSince
      );
      const gainedXp = isActiveBooster
        ? baseXp * SERVER_BOOST_XP_MULTIPLIER
        : baseXp;
      const maxLevel = resolveLevelCap(settings.levelRewards, settings.levelMax);
      const levelData = await addXp({
        guildId: message.guild.id,
        userId: message.author.id,
        amount: gainedXp,
        maxLevel
      });

      if (levelData.leveledUp) {
        const member =
          message.member ||
          (await message.guild.members.fetch(message.author.id).catch(() => null));
        const grantedRewards = await grantLevelRewards(member, levelData.level, settings);

        const announceDecision = await shouldAnnounceLevelUp({
          guildId: message.guild.id,
          userId: message.author.id,
          level: levelData.level
        }).catch(() => ({ shouldAnnounce: true }));
        if (!announceDecision.shouldAnnounce) {
          return;
        }

        const rewardText =
          grantedRewards.length > 0
            ? grantedRewards.map((reward) => `<@&${reward.roleId}>`).join(", ")
            : "No new reward role.";

        const levelEmbed = buildResultEmbed({
          title: "Level Up",
          color: 0x57f287,
          fields: [
            {
              name: "User",
              value: `${message.author.tag} (${message.author.id})`
            },
            { name: "New Level", value: `${levelData.level}` },
            { name: "Reward Roles", value: rewardText }
          ],
          footer: "Level System"
        });

        const levelChannelId = settings.levelUpChannelId || settings.levelLogChannelId;
        if (!levelChannelId) {
          return;
        }

        const announceChannel =
          message.guild.channels.cache.get(levelChannelId) ||
          (await message.guild.channels.fetch(levelChannelId).catch(() => null));
        if (
          !announceChannel ||
          !announceChannel.isTextBased?.() ||
          !announceChannel.isSendable?.()
        ) {
          return;
        }

        const recentHighestLevel = await getRecentHighestAnnouncedLevel(
          announceChannel,
          message.client?.user?.id,
          message.author.id
        ).catch(() => null);
        if (
          Number.isFinite(Number(recentHighestLevel)) &&
          Number(recentHighestLevel) >= Number(levelData.level)
        ) {
          return;
        }

        await announceChannel.send({
          content: `Congrats ${message.author}, you reached Level ${levelData.level}!`,
          embeds: [levelEmbed]
        });

        if (
          settings.levelLogChannelId &&
          (!announceChannel?.id || announceChannel.id !== settings.levelLogChannelId)
        ) {
          await sendLogToChannel(
            message.guild,
            settings.levelLogChannelId,
            levelEmbed
          );
        }
      }
    } catch (error) {
      console.error("Leveling error:", error);
    }
  }
};
