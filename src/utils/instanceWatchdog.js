const os = require("node:os");
const crypto = require("node:crypto");
const config = require("../config");
const {
  getPostgresStatus,
  claimInstanceLease,
  releaseInstanceLease,
  pruneStaleInstanceLeases
} = require("./postgres");
const { buildLogEmbed, sendLogToChannel } = require("./logger");
const { getGuildSettingsSync } = require("./guildSettings");
const { sendAlert } = require("./alerts");

const WATCHDOG_INTERVAL_MS = 15_000;
const WATCHDOG_STALE_AFTER_MS = 45_000;

let timer = null;
let state = {
  enabled: false,
  healthy: true,
  ownerId: null,
  instanceKey: null,
  tokenHash: null,
  lastHeartbeatAt: null,
  conflictLease: null,
  lastError: null
};

function now() {
  return Date.now();
}

function buildIdentity() {
  const tokenHash = crypto
    .createHash("sha256")
    .update(String(config.token || "missing-token"))
    .digest("hex")
    .slice(0, 24);
  const host =
    String(process.env.HOSTNAME || process.env.COMPUTERNAME || os.hostname() || "unknown")
      .trim()
      .slice(0, 100) || "unknown";
  const ownerId = `${host}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
  const instanceKey = `bot-token-${tokenHash}`;
  return { tokenHash, host, ownerId, instanceKey };
}

async function sendConflictAlert(client, identity, lease) {
  const controlGuildId = String(config.guildId || "").trim();
  if (!controlGuildId) {
    return;
  }

  const guild =
    client.guilds.cache.get(controlGuildId) ||
    (await client.guilds.fetch(controlGuildId).catch(() => null));
  if (!guild) {
    return;
  }

  const settings = getGuildSettingsSync(guild.id);
  const targetChannelId =
    settings.serverUpdateChannelId || settings.modLogChannelId || settings.reportChannelId;
  if (!targetChannelId) {
    return;
  }

  const metadata = lease?.metadata || {};
  const embed = buildLogEmbed({
    title: "Instance Watchdog Conflict",
    color: 0xed4245,
    fields: [
      { name: "Action", value: "This process blocked itself to prevent duplicate bot events." },
      { name: "Current Host", value: identity.host },
      { name: "Current PID", value: String(process.pid) },
      {
        name: "Active Owner",
        value: String(lease?.ownerId || "unknown").slice(0, 256)
      },
      { name: "Active Host", value: String(metadata.host || "unknown").slice(0, 256) },
      { name: "Active PID", value: String(metadata.pid || "unknown").slice(0, 256) }
    ],
    footer: "Instance Watchdog"
  });

  await sendLogToChannel(guild, targetChannelId, embed).catch(() => null);
  await sendAlert(client, {
    level: "error",
    title: "Instance Watchdog Conflict",
    message: "Duplicate active bot process detected. Current process is shutting down.",
    guildId: guild.id,
    fields: [
      { name: "Current Host", value: identity.host },
      { name: "Current PID", value: String(process.pid) },
      {
        name: "Active Owner",
        value: String(lease?.ownerId || "unknown").slice(0, 256)
      },
      { name: "Active Host", value: String(metadata.host || "unknown").slice(0, 256) },
      { name: "Active PID", value: String(metadata.pid || "unknown").slice(0, 256) }
    ],
    dedupeKey: `watchdog_conflict:${identity.instanceKey}`,
    ttlMs: 2 * 60_000
  }).catch(() => null);
}

async function claimOrDetectConflict(client, identity) {
  const heartbeatAt = now();
  const claim = await claimInstanceLease({
    instanceKey: identity.instanceKey,
    ownerId: identity.ownerId,
    tokenHash: identity.tokenHash,
    heartbeatAt,
    startedAt: process.uptime ? Math.floor(Date.now() - process.uptime() * 1000) : heartbeatAt,
    staleAfterMs: WATCHDOG_STALE_AFTER_MS,
    metadata: {
      host: identity.host,
      pid: process.pid,
      node: process.version,
      startedAt: new Date().toISOString()
    }
  }).catch((error) => ({
    ok: false,
    claimed: false,
    reason: String(error?.message || error)
  }));

  if (!claim?.ok) {
    state.lastError = claim?.reason || "watchdog_claim_failed";
    return { ok: false, conflict: false };
  }

  if (!claim.claimed) {
    state.healthy = false;
    state.conflictLease = claim.lease || null;
    await sendConflictAlert(client, identity, claim.lease).catch(() => null);
    return { ok: false, conflict: true, lease: claim.lease || null };
  }

  state.healthy = true;
  state.lastHeartbeatAt = heartbeatAt;
  state.conflictLease = null;
  state.lastError = null;
  return { ok: true };
}

async function startInstanceWatchdog(client) {
  if (timer) {
    return state;
  }

  const pg = getPostgresStatus();
  if (!pg.enabled || !pg.connected) {
    state = {
      ...state,
      enabled: false,
      healthy: true,
      ownerId: null,
      instanceKey: null,
      tokenHash: null,
      lastHeartbeatAt: null,
      conflictLease: null,
      lastError: "postgres_not_connected"
    };
    return state;
  }

  const identity = buildIdentity();
  state = {
    enabled: true,
    healthy: true,
    ownerId: identity.ownerId,
    instanceKey: identity.instanceKey,
    tokenHash: identity.tokenHash,
    lastHeartbeatAt: null,
    conflictLease: null,
    lastError: null
  };

  await pruneStaleInstanceLeases(WATCHDOG_STALE_AFTER_MS * 3).catch(() => null);
  const initial = await claimOrDetectConflict(client, identity);
  if (!initial.ok) {
    return { ...state, blockStartup: true };
  }

  timer = setInterval(() => {
    claimOrDetectConflict(client, identity)
      .then((result) => {
        if (!result.ok && result.conflict) {
          setTimeout(() => {
            try {
              client.destroy();
            } catch {
              // ignore
            }
            process.exit(1);
          }, 1000);
        }
      })
      .catch((error) => {
        state.lastError = String(error?.message || error);
        sendAlert(client, {
          level: "warn",
          title: "Instance Watchdog Heartbeat Error",
          message: "Watchdog heartbeat failed; retrying.",
          fields: [
            { name: "Instance Key", value: identity.instanceKey.slice(0, 200) },
            { name: "Owner", value: identity.ownerId.slice(0, 200) }
          ],
          error,
          dedupeKey: `watchdog_heartbeat_error:${identity.instanceKey}`,
          ttlMs: 60_000
        }).catch(() => null);
      });
  }, WATCHDOG_INTERVAL_MS);

  return state;
}

async function stopInstanceWatchdog() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  if (state.enabled && state.instanceKey && state.ownerId) {
    await releaseInstanceLease({
      instanceKey: state.instanceKey,
      ownerId: state.ownerId
    }).catch(() => null);
  }
}

function getInstanceWatchdogState() {
  return { ...state };
}

module.exports = {
  startInstanceWatchdog,
  stopInstanceWatchdog,
  getInstanceWatchdogState
};
