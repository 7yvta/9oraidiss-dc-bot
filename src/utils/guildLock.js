const config = require("../config");

function isGuildAllowed(guildId) {
  // Public mode: the bot is allowed to stay in any server it is invited to.
  // Keep this hard-disabled so a stale host env var cannot make the bot auto-leave.
  return true;
}

async function enforceGuildLock(client) {
  // No-op by design. The bot should not auto-leave any guild.
  return;
}

module.exports = {
  isGuildAllowed,
  enforceGuildLock
};

