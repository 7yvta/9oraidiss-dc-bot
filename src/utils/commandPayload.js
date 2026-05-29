const { PermissionFlagsBits } = require("discord.js");
const { isOwnerHiddenCommand } = require("./ownerCommandPolicy");

function normalizeCommandPayload(command) {
  const source = command && typeof command === "object" ? command : {};
  const normalized = { ...source };

  if (isOwnerHiddenCommand(normalized.name)) {
    // Discord cannot hide slash commands from one specific user only. Restrict
    // visibility to admins, then runtime checks below enforce the real owner-only rule.
    normalized.default_member_permissions = String(PermissionFlagsBits.Administrator);
  } else {
    // Force-clear stale Discord-side default permission locks so role visibility
    // is controlled by guild integrations + runtime checks, not old command flags.
    normalized.default_member_permissions = null;
  }

  return normalized;
}

function normalizeCommandPayloads(commands) {
  if (!Array.isArray(commands)) {
    return [];
  }
  return commands.map((command) => normalizeCommandPayload(command));
}

module.exports = {
  normalizeCommandPayload,
  normalizeCommandPayloads
};
