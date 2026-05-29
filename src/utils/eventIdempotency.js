const { runOnce, makePayloadHash } = require("./idempotency");

function safeId(value) {
  return String(value || "").trim();
}

function extractRoleSet(memberLike) {
  const roles = memberLike?.roles?.cache;
  if (!roles || typeof roles.keys !== "function") {
    return [];
  }
  return Array.from(roles.keys()).map(String).sort();
}

function buildUpdateFingerprint(eventName, args) {
  const normalizedEventName = String(eventName || "").trim().toLowerCase();
  const first = args?.[0];
  const second = args?.[1];

  if (normalizedEventName === "guildmemberupdate") {
    return makePayloadHash({
      eventName,
      guildId: safeId(second?.guild?.id || first?.guild?.id),
      userId: safeId(second?.id || first?.id),
      oldNick: String(first?.nickname || ""),
      newNick: String(second?.nickname || ""),
      oldRoles: extractRoleSet(first),
      newRoles: extractRoleSet(second)
    });
  }

  if (normalizedEventName === "roleupdate") {
    return makePayloadHash({
      eventName,
      guildId: safeId(second?.guild?.id || first?.guild?.id),
      roleId: safeId(second?.id || first?.id),
      oldName: String(first?.name || ""),
      newName: String(second?.name || ""),
      oldPos: Number(first?.position || 0),
      newPos: Number(second?.position || 0),
      oldPerms: String(first?.permissions?.bitfield || ""),
      newPerms: String(second?.permissions?.bitfield || "")
    });
  }

  if (normalizedEventName === "channelupdate") {
    return makePayloadHash({
      eventName,
      guildId: safeId(second?.guild?.id || first?.guild?.id),
      channelId: safeId(second?.id || first?.id),
      oldName: String(first?.name || ""),
      newName: String(second?.name || ""),
      oldParent: safeId(first?.parentId),
      newParent: safeId(second?.parentId),
      oldTopic: String(first?.topic || ""),
      newTopic: String(second?.topic || "")
    });
  }

  if (normalizedEventName === "messageupdate") {
    return makePayloadHash({
      eventName,
      guildId: safeId(second?.guild?.id || first?.guild?.id),
      channelId: safeId(second?.channelId || first?.channelId),
      messageId: safeId(second?.id || first?.id),
      oldContent: String(first?.content || ""),
      newContent: String(second?.content || "")
    });
  }

  if (normalizedEventName === "voicestateupdate") {
    return makePayloadHash({
      eventName,
      guildId: safeId(second?.guild?.id || first?.guild?.id),
      userId: safeId(second?.id || first?.id || second?.member?.id),
      oldChannelId: safeId(first?.channelId),
      newChannelId: safeId(second?.channelId),
      oldMute: Boolean(first?.mute),
      newMute: Boolean(second?.mute),
      oldDeaf: Boolean(first?.deaf),
      newDeaf: Boolean(second?.deaf)
    });
  }

  return null;
}

function buildEventDispatchKey(eventName, args = []) {
  const normalizedEventName = String(eventName || "").trim().toLowerCase();
  const first = args[0];
  const second = args[1];

  const primaryId =
    safeId(first?.id) ||
    safeId(first?.messageId) ||
    safeId(first?.code) ||
    safeId(second?.id);
  const guildId =
    safeId(first?.guild?.id) ||
    safeId(first?.guildId) ||
    safeId(second?.guild?.id) ||
    safeId(second?.guildId) ||
    "noguild";

  const simpleEvents = new Set([
    "interactioncreate",
    "messagecreate",
    "messagedelete",
    "guildmemberadd",
    "guildmemberremove",
    "guildbanadd",
    "guildbanremove",
    "invitecreate",
    "invitedelete",
    "rolecreate",
    "roledelete",
    "channelcreate",
    "channeldelete",
    "guildcreate"
  ]);

  if (simpleEvents.has(normalizedEventName) && primaryId) {
    return `${guildId}:${normalizedEventName}:${primaryId}`;
  }

  const fingerprint = buildUpdateFingerprint(normalizedEventName, args);
  if (fingerprint) {
    return `${guildId}:${normalizedEventName}:${fingerprint}`;
  }

  // Unknown event shape -> skip global event dedupe.
  return null;
}

async function runEventOnce({ eventName, args, execute, ttlMs = 20_000 }) {
  const key = buildEventDispatchKey(eventName, args);
  if (!key) {
    return execute();
  }

  const outcome = await runOnce({
    scope: "event_dispatch",
    key,
    ttlMs,
    action: execute
  });

  if (outcome.skipped) {
    return null;
  }
  return outcome.result;
}

module.exports = {
  buildEventDispatchKey,
  runEventOnce
};
