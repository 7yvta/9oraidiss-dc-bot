const config = require("../config");
const { getGuildSettingsSync } = require("./guildSettings");

function isOwner(interaction) {
  const userId = String(interaction?.user?.id || "");
  const guildOwnerId = String(interaction?.guild?.ownerId || "");
  const configuredOwnerId = String(config.botOwnerId || "").trim();
  return Boolean(
    userId &&
      (userId === guildOwnerId || (configuredOwnerId && userId === configuredOwnerId))
  );
}

function hasAnyRole(member, roleIds) {
  if (!member || !Array.isArray(roleIds) || roleIds.length === 0) {
    return false;
  }
  return roleIds.some((roleId) =>
    member.roles?.cache?.has?.(String(roleId || "").trim())
  );
}

function isBotAdmin(interaction) {
  if (isOwner(interaction)) {
    return true;
  }

  const settings = getGuildSettingsSync(interaction?.guild?.id);
  return hasAnyRole(interaction?.member, settings.botAdminRoleIds);
}

module.exports = { isOwner, isBotAdmin };
