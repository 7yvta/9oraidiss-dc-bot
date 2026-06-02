const path = require("node:path");
const { EmbedBuilder } = require("discord.js");
const { runOnce } = require("./idempotency");
const { getGuildSettingsSync } = require("./guildSettings");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "auto-vouch-state.json");
const STATE_NAMESPACE = "auto_vouch_store";
const STATE_DOC_KEY = "state";
const DEFAULT_MM_VOUCH_ROLE_ID = "1499837044237537460";
const MANUAL_VOUCH_REASON_MAX = 400;
const MIN_AUTO_VOUCH_DAYS = 7;
const DEFAULT_AUTO_VOUCH_PER_CYCLE = 3;
const MAX_AUTO_VOUCH_PER_CYCLE = 10;
const MAX_REASON_TEXT_LENGTH = 220;
const MAX_REASON_POOL_SIZE = 320;
const DEFAULT_REASON_FALLBACK = "trusted roblox middleman";
const SCAM_VOUCH_KEYWORDS = [
  "scam",
  "scammed",
  "scammer",
  "fake",
  "stole",
  "steal",
  "robbed",
  "not trusted",
  "dont trust",
  "don't trust",
  "didnt send",
  "didn't send",
  "never sent",
  "took my",
  "ran away",
  "fraud",
  "rip off",
  "be careful",
  "avoid him",
  "avoid her",
  "do not trade",
  "not legit"
];

let ticker = null;
let stateCache = null;
let stateLoaded = false;

const MM_REASONS = [
  "big vouch, mm was fast and clean",
  "legit mm no scam no stress",
  "robux for items trade went smooth",
  "he mm my robux to in game items clean",
  "cross trade done safe with proof",
  "mm2 trade handled perfect",
  "pet sim 99 huge trade done clean",
  "blox fruits trade done safe",
  "mm stayed active whole trade",
  "both sides got what they agreed",
  "trusted mm for robux -> items",
  "trusted mm for items -> robux",
  "quick middleman no delay",
  "good comms and safe handoff",
  "fair and legit middleman",
  "high value trade done right",
  "big inventory swap done safe",
  "mm2 godly trade done smooth",
  "mm2 chroma trade done clean",
  "pet sim gems for robux done safe",
  "pet sim huge for items done safe",
  "blox fruits perm trade mm was solid",
  "fruit + adds trade done clean",
  "robux to sab deal handled safe",
  "sab to robux deal handled safe",
  "cross game trade no issue",
  "middleman kept both sides safe",
  "clear steps and full proof",
  "trustable mm fr",
  "real one mm no funny business",
  "trade closed fast and fair",
  "secure process start to finish",
  "mm helped both sides stay safe",
  "legit mm for risky deals",
  "big vouch for this mm",
  "clean deal, no scam, no problem",
  "trade done exactly as agreed",
  "solid mm for robux/item swaps",
  "used mm for ps99 trade, went perfect",
  "used mm for mm2 trade, went perfect",
  "used mm for blox fruits trade, went perfect",
  "robux for game items done safe",
  "items for robux done safe",
  "cross trade expert fr",
  "very smooth middleman session",
  "mm was patient and transparent",
  "safe close with screenshots",
  "10/10 mm",
  "trusted mm for all roblox games",
  "deal finished fast and clean",
  "mm handled a big trade with no issues",
  "trusted for high value cross trades",
  "robux + items mixed deal done clean",
  "clean handoff both sides satisfied",
  "proof based middleman, very legit",
  "real trusted mm fr",
  "great mm for pet sim 99 + mm2",
  "great mm for blox fruits + robux",
  "clean close, no confusion",
  "safe trade from start to end"
];

const MM_REASON_PREFIXES = [
  "fast",
  "clean",
  "trusted",
  "safe",
  "solid",
  "legit",
  "real",
  "quick",
  "smooth",
  "high value",
  "cross game",
  "proof based"
];

const MM_REASON_ACTIONS = [
  "mm handled the trade",
  "middleman run",
  "trade handoff",
  "swap close",
  "blox fruits deal",
  "mm2 deal",
  "pet sim 99 deal",
  "robux for items trade",
  "items for robux trade",
  "robux to sab swap",
  "cross game trade",
  "big inventory trade"
];

const MM_REASON_SUFFIXES = [
  "clean",
  "with no issues",
  "super smooth",
  "from start to end",
  "both sides stayed safe",
  "with clear proof",
  "and fast replies",
  "no delay",
  "fair and safe",
  "exactly as agreed",
  "fr"
];

function appendUniqueReason(pool, text) {
  const reason = String(text || "").trim();
  if (!reason || reason.length > MAX_REASON_TEXT_LENGTH) {
    return;
  }
  if (!pool.includes(reason)) {
    pool.push(reason);
  }
}

function buildCrossReasons(prefixes, actions, suffixes, limit = MAX_REASON_POOL_SIZE) {
  const generated = [];
  for (const prefix of prefixes) {
    for (const action of actions) {
      for (const suffix of suffixes) {
        appendUniqueReason(generated, `${prefix} ${action} ${suffix}`);
        if (generated.length >= limit) {
          return generated;
        }
      }
    }
  }
  return generated;
}

function normalizeReasonList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\r\n,|]/)
        .map((part) => part.trim());

  const list = [];
  for (const entry of source) {
    const reason = String(entry || "").trim();
    if (!reason || reason.length > MAX_REASON_TEXT_LENGTH) {
      continue;
    }
    if (!list.includes(reason)) {
      list.push(reason);
    }
    if (list.length >= MAX_REASON_POOL_SIZE) {
      break;
    }
  }
  return list;
}

const DEFAULT_MM_REASON_POOL = (() => {
  const pool = [];
  MM_REASONS.forEach((reason) => appendUniqueReason(pool, reason));
  buildCrossReasons(MM_REASON_PREFIXES, MM_REASON_ACTIONS, MM_REASON_SUFFIXES).forEach(
    (reason) => appendUniqueReason(pool, reason)
  );
  return pool.slice(0, MAX_REASON_POOL_SIZE);
})();

function getReasonPoolsFromSettings(settings) {
  const customMm = normalizeReasonList(settings?.autoVouchMmReasons);
  return {
    mm: customMm.length > 0 ? customMm : DEFAULT_MM_REASON_POOL
  };
}

function buildNonPingVouchContent(vouchedForId, vouchedById) {
  return `vouch <@${vouchedForId}> by <@${vouchedById}>`;
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index] || null;
}

function shuffle(items) {
  const copy = Array.isArray(items) ? [...items] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getAutoVouchPerCycle(settings) {
  const configured = Number(settings?.autoVouchPerCycle);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_AUTO_VOUCH_PER_CYCLE;
  }
  return Math.min(MAX_AUTO_VOUCH_PER_CYCLE, Math.floor(configured));
}

function getRoleIdFromSettings(settings) {
  const configured = String(settings?.middlemanTicketRoleId || "").trim();
  if (configured) {
    return configured;
  }
  return DEFAULT_MM_VOUCH_ROLE_ID;
}



function memberHasRole(member, roleId) {
  if (!member?.roles?.cache || !roleId) {
    return false;
  }
  return member.roles.cache.has(roleId);
}

async function ensureGuildMemberCache(guild) {
  await guild.members.fetch().catch(() => null);
}

async function loadState() {
  if (stateLoaded && stateCache) {
    return stateCache;
  }

  const initial = await readJsonDocument({
    namespace: STATE_NAMESPACE,
    docKey: STATE_DOC_KEY,
    filePath: STATE_FILE,
    defaultValue: { counts: {} }
  });

  stateCache = initial && typeof initial === "object" ? initial : { counts: {}, scamCounts: {} };
  if (!stateCache.counts || typeof stateCache.counts !== "object") {
    stateCache.counts = {};
  }
  if (!stateCache.scamCounts || typeof stateCache.scamCounts !== "object") {
    stateCache.scamCounts = {};
  }
  if (!stateCache.lastSentAt || typeof stateCache.lastSentAt !== "object") {
    stateCache.lastSentAt = {};
  }
  stateLoaded = true;
  return stateCache;
}

async function saveState() {
  if (!stateCache || typeof stateCache !== "object") {
    return;
  }
  await writeJsonDocument({
    namespace: STATE_NAMESPACE,
    docKey: STATE_DOC_KEY,
    filePath: STATE_FILE,
    value: stateCache
  }).catch(() => null);
}

async function incrementCount(guildId, userId, kind = "vouch") {
  const state = await loadState();
  const guildKey = String(guildId || "");
  const userKey = String(userId || "");
  if (!guildKey || !userKey) {
    return 1;
  }

  const bucketKey = kind === "scam" ? "scamCounts" : "counts";
  if (!state[bucketKey] || typeof state[bucketKey] !== "object") {
    state[bucketKey] = {};
  }
  if (!state[bucketKey][guildKey] || typeof state[bucketKey][guildKey] !== "object") {
    state[bucketKey][guildKey] = {};
  }
  const current = Number(state[bucketKey][guildKey][userKey] || 0);
  const next = current + 1;
  state[bucketKey][guildKey][userKey] = next;
  await saveState();
  return next;
}

async function getLastAutoVouchSentAt(guildId) {
  const state = await loadState();
  const key = String(guildId || "");
  if (!key) {
    return 0;
  }
  const value = Number(state.lastSentAt?.[key] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function markAutoVouchSentAt(guildId, timestamp = Date.now()) {
  const state = await loadState();
  const key = String(guildId || "");
  if (!key) {
    return;
  }
  if (!state.lastSentAt || typeof state.lastSentAt !== "object") {
    state.lastSentAt = {};
  }
  state.lastSentAt[key] = Number(timestamp) || Date.now();
  await saveState();
}

async function resolveEligibleVouchTargets(guild, settings) {
  const vouchTargetRoleId = getRoleIdFromSettings(settings);
  if (!vouchTargetRoleId) {
    return [];
  }

  const targetRole =
    guild.roles?.cache?.get(vouchTargetRoleId) ||
    (await guild.roles.fetch(vouchTargetRoleId).catch(() => null));
  if (!targetRole) {
    return [];
  }

  return [...targetRole.members.values()].filter((member) => !member?.user?.bot);
}

async function resolveVouchedByMember(guild, targetMember, fallbackIds) {
  const allGuildMembers = [...guild.members.cache.values()].filter((member) => !member.user?.bot);
  let candidates = allGuildMembers.filter((member) => member.id !== targetMember.id);

  if (candidates.length === 0 && Array.isArray(fallbackIds) && fallbackIds.length > 0) {
    const fallbackMembers = [];
    for (const userId of fallbackIds) {
      const fetchedMember = await guild.members.fetch(userId).catch(() => null);
      if (!fetchedMember || fetchedMember.user?.bot || fetchedMember.id === targetMember.id) {
        continue;
      }
      fallbackMembers.push(fetchedMember);
    }
    if (fallbackMembers.length > 0) {
      candidates = fallbackMembers;
    }
  }

  return pickRandom(candidates) || targetMember;
}

async function getAutoVouchChannel(guild, settings) {
  const channelId = String(settings?.autoVouchChannelId || "").trim();
  if (!channelId) {
    return null;
  }
  const channel =
    guild.channels?.cache?.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.() || !channel?.isSendable?.()) {
    return null;
  }
  return channel;
}

async function trySendAutoVouch(guild) {
  const settings = getGuildSettingsSync(guild?.id);
  if (!settings.autoVouchEnabled) {
    return;
  }

  const fallbackMemberIds = Array.isArray(settings.autoVouchMemberIds)
    ? settings.autoVouchMemberIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const perCycle = getAutoVouchPerCycle(settings);
  const configuredDays = Number(settings.autoVouchIntervalDays);
  const intervalDays = Math.max(
    MIN_AUTO_VOUCH_DAYS,
    Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : 7
  );
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  const lastSentAt = await getLastAutoVouchSentAt(guild.id);
  if (lastSentAt > 0 && Date.now() - lastSentAt < intervalMs) {
    return;
  }

  const channel = await getAutoVouchChannel(guild, settings);
  if (!channel) {
    return;
  }

  const bucket = Math.floor(Date.now() / intervalMs);
  const dedupeKey = `${guild.id}:${channel.id}:${bucket}`;

  await runOnce({
    scope: "auto_vouch",
    key: dedupeKey,
    ttlMs: intervalMs,
    action: async () => {
      const eligibleTargets = await resolveEligibleVouchTargets(guild, settings);
      if (eligibleTargets.length === 0) {
        return { ok: false, reason: "no_member_with_target_role" };
      }

      const selectedTargets = shuffle(eligibleTargets).slice(
        0,
        Math.min(perCycle, eligibleTargets.length)
      );

      let sentCount = 0;
      let lastResult = null;
      for (const targetMember of selectedTargets) {
        const result = await sendAutoVouchMessage({
          guild,
          channel,
          fallbackMemberIds,
          targetMember
        });
        lastResult = result;
        if (result?.ok) {
          sentCount += 1;
        }
      }

      if (sentCount > 0) {
        await markAutoVouchSentAt(guild.id, Date.now());
      }
      return {
        ok: sentCount > 0,
        reason: sentCount > 0 ? "sent" : lastResult?.reason || "send_failed",
        sentCount
      };
    }
  });
}

async function sendAutoVouchMessage({
  guild,
  channel,
  fallbackMemberIds,
  targetMember: providedTargetMember
}) {
  await ensureGuildMemberCache(guild);

  const settings = getGuildSettingsSync(guild?.id);
  const eligibleTargets = await resolveEligibleVouchTargets(guild, settings);
  const vouchedForMember = providedTargetMember || pickRandom(eligibleTargets);
  if (!vouchedForMember?.id) {
    return { ok: false, reason: "no_member_with_target_role" };
  }

  const vouchedByMember = await resolveVouchedByMember(
    guild,
    vouchedForMember,
    fallbackMemberIds
  );
  const reasonPools = getReasonPoolsFromSettings(settings);
  const reason = pickRandom(reasonPools.mm) || DEFAULT_REASON_FALLBACK;
  const totalVouches = await incrementCount(guild.id, vouchedForMember.id);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ New Vouch")
    .addFields(
      { name: "👤 Vouched For", value: `<@${vouchedForMember.id}>`, inline: true },
      { name: "📝 Vouched By", value: `<@${vouchedByMember.id}>`, inline: true },
      { name: "💬 Reason", value: reason },
      { name: "🔢 Total Vouches", value: String(totalVouches) }
    )
    .setFooter({ text: "Powered by Vault Vouch System" })
    .setTimestamp();

  const sentMessage = await channel
    .send({
      content: buildNonPingVouchContent(vouchedForMember.id, vouchedByMember.id),
      allowedMentions: { parse: [] },
      embeds: [embed]
    })
    .catch(() => null);

  if (!sentMessage) {
    return { ok: false, reason: "send_failed" };
  }

  return {
    ok: true,
    reason,
    messageId: sentMessage.id,
    vouchedForId: vouchedForMember.id,
    vouchedById: vouchedByMember.id,
    totalVouches
  };
}

async function triggerAutoVouchNow(guild, { requestedById } = {}) {
  if (!guild) {
    return { ok: false, reason: "missing_guild" };
  }

  const settings = getGuildSettingsSync(guild.id);
  if (!settings.autoVouchEnabled) {
    return { ok: false, reason: "disabled" };
  }
  const fallbackMemberIds = Array.isArray(settings.autoVouchMemberIds)
    ? settings.autoVouchMemberIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const channel = await getAutoVouchChannel(guild, settings);
  if (!channel) {
    return { ok: false, reason: "channel_unavailable" };
  }

  const burstBucket = Math.floor(Date.now() / 30000);
  const dedupeKey = `${guild.id}:${channel.id}:${requestedById || "unknown"}:${burstBucket}`;

  const execution = await runOnce({
    scope: "auto_vouch_manual",
    key: dedupeKey,
    ttlMs: 30000,
    action: async () =>
      sendAutoVouchMessage({
        guild,
        channel,
        fallbackMemberIds
      })
  });

  if (execution.skipped) {
    return { ok: false, reason: "manual_cooldown" };
  }
  return execution.result || { ok: false, reason: "unknown" };
}

function normalizeManualReason(reason) {
  const text = String(reason || "").trim();
  if (!text) {
    return "";
  }
  return text.slice(0, MANUAL_VOUCH_REASON_MAX);
}

function isScamVouchReason(reason) {
  const text = String(reason || "").toLowerCase().trim();
  if (!text) {
    return false;
  }
  return SCAM_VOUCH_KEYWORDS.some((keyword) => text.includes(keyword));
}

async function triggerSubmittedVouch(
  guild,
  { vouchedForId, vouchedById, reason, requestId } = {}
) {
  if (!guild) {
    return { ok: false, reason: "missing_guild" };
  }

  const settings = getGuildSettingsSync(guild.id);
  if (!settings.autoVouchEnabled) {
    return { ok: false, reason: "disabled" };
  }
  const channel = await getAutoVouchChannel(guild, settings);
  if (!channel) {
    return { ok: false, reason: "channel_unavailable" };
  }

  const targetId = String(vouchedForId || "").trim();
  const byId = String(vouchedById || "").trim();
  if (!targetId || !byId) {
    return { ok: false, reason: "missing_users" };
  }
  if (targetId === byId) {
    return { ok: false, reason: "self_vouch_not_allowed" };
  }

  await ensureGuildMemberCache(guild);

  const vouchedForMember = await guild.members.fetch(targetId).catch(() => null);
  if (!vouchedForMember || vouchedForMember.user?.bot) {
    return { ok: false, reason: "target_not_found" };
  }

  const vouchedByMember = await guild.members.fetch(byId).catch(() => null);
  if (!vouchedByMember || vouchedByMember.user?.bot) {
    return { ok: false, reason: "author_not_found" };
  }

  const resolvedReason =
    normalizeManualReason(reason) ||
    (() => {
      const reasonPools = getReasonPoolsFromSettings(settings);
      return pickRandom(reasonPools.mm) || DEFAULT_REASON_FALLBACK;
    })();
  const scamDetected = isScamVouchReason(resolvedReason);

  const dedupeKey = `${guild.id}:${requestId || `${byId}:${targetId}:${resolvedReason}`}`;
  const execution = await runOnce({
    scope: "manual_vouch_submit",
    key: dedupeKey,
    ttlMs: 30000,
    action: async () => {
      const totalVouches = scamDetected
        ? null
        : await incrementCount(guild.id, vouchedForMember.id, "vouch");
      const totalScamVouches = scamDetected
        ? await incrementCount(guild.id, vouchedForMember.id, "scam")
        : null;

      const embed = new EmbedBuilder()
        .setColor(scamDetected ? 0xed4245 : 0x57f287)
        .setTitle(scamDetected ? "🚨 Scam Vouch Reported" : "✅ New Vouch")
        .addFields(
          { name: "👤 Vouched For", value: `<@${vouchedForMember.id}>`, inline: true },
          { name: "📝 Vouched By", value: `<@${vouchedByMember.id}>`, inline: true },
          { name: "💬 Reason", value: resolvedReason },
          scamDetected
            ? { name: "🚫 Scam Vouch Counter", value: String(totalScamVouches || 1) }
            : { name: "🔢 Total Vouches", value: String(totalVouches || 1) }
        )
        .setFooter({ text: "Powered by Vault Vouch System" })
        .setTimestamp();

      const sentMessage = await channel
        .send({
          content: buildNonPingVouchContent(vouchedForMember.id, vouchedByMember.id),
          allowedMentions: { parse: [] },
          embeds: [embed]
        })
        .catch(() => null);

      if (!sentMessage) {
        return { ok: false, reason: "send_failed" };
      }

      return {
        ok: true,
        reason: resolvedReason,
        messageId: sentMessage.id,
        vouchedForId: vouchedForMember.id,
        vouchedById: vouchedByMember.id,
        totalVouches,
        totalScamVouches,
        scam: scamDetected
      };
    }
  });

  if (execution.skipped) {
    return { ok: false, reason: "submit_cooldown" };
  }
  return execution.result || { ok: false, reason: "unknown" };
}

function startAutoVouchScheduler(client) {
  if (ticker) {
    clearInterval(ticker);
  }

  loadState().catch(() => null);

  ticker = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      trySendAutoVouch(guild).catch(() => null);
    }
  }, 60 * 1000);

  for (const guild of client.guilds.cache.values()) {
    trySendAutoVouch(guild).catch(() => null);
  }
}

module.exports = {
  startAutoVouchScheduler,
  triggerAutoVouchNow,
  triggerSubmittedVouch
};




