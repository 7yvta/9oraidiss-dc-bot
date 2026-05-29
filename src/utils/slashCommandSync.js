const { setTimeout: delay } = require("node:timers/promises");

const DISCORD_API_BASE = "https://discord.com/api/v10";

function buildApiUrl(pathname) {
  return `${DISCORD_API_BASE}${pathname}`;
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function requestDiscord({
  method,
  url,
  token,
  body,
  maxAttempts = 8,
  timeoutMs = 20000
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let payload = null;

    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      payload = await parseJsonSafe(response);
      clearTimeout(timeout);
    } catch (error) {
      clearTimeout(timeout);
      const isAbort = error?.name === "AbortError";
      if (isAbort && attempt < maxAttempts) {
        const backoffMs = Math.min(2000 * attempt, 10000);
        await delay(backoffMs);
        continue;
      }
      throw error;
    }

    if (response.ok) {
      return payload;
    }

    if (response.status === 429) {
      const retrySeconds = Number(payload?.retry_after || 1);
      await delay(Math.max(250, Math.ceil(retrySeconds * 1000)));
      continue;
    }

    if (response.status >= 500 && response.status < 600) {
      const backoffMs = Math.min(2000 * attempt, 10000);
      await delay(backoffMs);
      continue;
    }

    const codeText = payload?.code ? ` (code ${payload.code})` : "";
    const messageText = payload?.message || "Unknown Discord API error";
    throw new Error(
      `${method} ${url} failed with ${response.status}${codeText}: ${messageText}`
    );
  }

  throw new Error(`${method} ${url} failed after ${maxAttempts} attempts.`);
}

async function syncSlashCommands({
  token,
  clientId,
  guildId,
  guildIds,
  commands,
  deployScope = "guild",
  clearGlobalFirst = false,
  clearGuildFirst = false
}) {
  if (!token || !clientId) {
    throw new Error("Missing token or clientId for slash command sync.");
  }

  const scope = String(deployScope || "guild").toLowerCase();
  const allowGlobal = scope === "global" || scope === "both";
  const allowGuild = scope === "guild" || scope === "both";
  const targetGuildIds = [
    ...(Array.isArray(guildIds) ? guildIds : []),
    ...(guildId ? [guildId] : [])
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const uniqueGuildIds = Array.from(new Set(targetGuildIds));

  if (allowGuild && uniqueGuildIds.length === 0) {
    throw new Error(
      'deployScope includes "guild", but no guild IDs were provided.'
    );
  }

  const globalUrl = buildApiUrl(`/applications/${clientId}/commands`);

  if (clearGlobalFirst) {
    await requestDiscord({
      method: "PUT",
      url: globalUrl,
      token,
      body: []
    });
  }

  if (clearGuildFirst) {
    for (const targetGuildId of uniqueGuildIds) {
      await requestDiscord({
        method: "PUT",
        url: buildApiUrl(`/applications/${clientId}/guilds/${targetGuildId}/commands`),
        token,
        body: []
      });
    }
  }

  let globalCount = 0;
  let guildCount = 0;
  const guildResults = [];

  if (allowGlobal) {
    const result = await requestDiscord({
      method: "PUT",
      url: globalUrl,
      token,
      body: commands
    });
    globalCount = Array.isArray(result) ? result.length : 0;
  }

  if (allowGuild) {
    for (const targetGuildId of uniqueGuildIds) {
      const result = await requestDiscord({
        method: "PUT",
        url: buildApiUrl(`/applications/${clientId}/guilds/${targetGuildId}/commands`),
        token,
        body: commands
      });
      const count = Array.isArray(result) ? result.length : 0;
      guildCount += count;
      guildResults.push({
        guildId: targetGuildId,
        count
      });
    }
  }

  return {
    scope,
    globalCount,
    guildCount,
    guildResults
  };
}

module.exports = {
  syncSlashCommands
};
