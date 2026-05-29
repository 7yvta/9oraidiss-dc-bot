function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("invite_fetch_timeout")), ms);
    })
  ]);
}

async function refreshGuildInviteCache(guild) {
  try {
    const invites = await withTimeout(guild.invites.fetch(), 15000);
    const cache = new Map();

    for (const invite of invites.values()) {
      cache.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null
      });
    }

    guild.client.inviteCache.set(guild.id, cache);
    return cache;
  } catch {
    return guild.client.inviteCache.get(guild.id) || new Map();
  }
}

async function initializeInviteCache(client) {
  if (!client.inviteCache) {
    client.inviteCache = new Map();
  }

  for (const guild of client.guilds.cache.values()) {
    await refreshGuildInviteCache(guild);
  }
}

async function resolveUsedInvite(member) {
  const previous = member.client.inviteCache?.get(member.guild.id) || new Map();
  const current = await refreshGuildInviteCache(member.guild);

  let bestMatch = null;
  for (const [code, currentData] of current.entries()) {
    const previousData = previous.get(code) || { uses: 0, inviterId: null };
    const delta = (currentData.uses || 0) - (previousData.uses || 0);
    if (delta <= 0) {
      continue;
    }

    if (!bestMatch || delta > bestMatch.delta) {
      bestMatch = {
        code,
        inviterId: currentData.inviterId,
        delta
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    code: bestMatch.code,
    inviterId: bestMatch.inviterId || null
  };
}

module.exports = {
  initializeInviteCache,
  refreshGuildInviteCache,
  resolveUsedInvite
};
