const { PermissionFlagsBits, PermissionsBitField } = require("discord.js");
const config = require("../config");
const { getGuildSettingsSync } = require("./guildSettings");
const { getTicketTeamRoleIds } = require("./tickets");
const { ownerHiddenCommandNames } = require("./ownerCommandPolicy");

const restrictedForTimeoutOnly = new Set([
  "manageban",
  "unban",
  "kick",
  "warn",
  "warnings",
  "clearwarnings",
  "purge",
  "managerole",
  "roleall",
  "rolefilter"
]);

const publicCommands = new Set([
  "ping",
  "help",
  "poll",
  "rank",
  "leaderboard",
  "invites",
  "appeal",
  "terms",
  "apply",
  "roleapply",
  "support",
  "botconfig",
  "ticketconfig",
  "teamroles",
  "afk",
  "balance",
  "coinflip",
  "daily",
  "deposit",
  "economylb",
  "pay",
  "rob",
  "withdraw",
  "work",
  "add",
  "remove",
  "transfer",
  "forceclaim",
  "unclaim",
  // Prefix commands (message-based) default to public; admins can restrict/disable via command permissions.
  "prefix_whois",
  "prefix_pfp",
  "prefix_member",
  "prefix_rank"
]);

const fullRoleOnlyCommands = new Set([
  "ticketpanel",
  "panel1",
  "middleman",
  "rules",
  "ticketruls",
  "managerole",
  "setlevel",
  "backup",
  "ticketstats",
  "autovouchnow",
  "vouchpanel"
]);

const ownerOnlyCommands = new Set(ownerHiddenCommandNames);
const manageGuildCommands = new Set(["applypanel"]);

function hasRole(member, roleId) {
  if (!member) {
    return false;
  }
  if (member.roles?.cache?.has) {
    return member.roles.cache.has(roleId);
  }
  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId);
  }
  return false;
}

function hasAnyRole(member, roleIds) {
  if (!member || !Array.isArray(roleIds) || roleIds.length === 0) {
    return false;
  }
  return roleIds.some((roleId) => hasRole(member, roleId));
}

function getMemberId(member) {
  return member?.id || member?.user?.id || null;
}

function isBotOwnerId(userId) {
  const normalizedId = String(userId || "").trim();
  if (!normalizedId) {
    return false;
  }

  const ownerIds = Array.isArray(config.botOwnerIds)
    ? config.botOwnerIds
    : [config.botOwnerId];
  return ownerIds
    .map((ownerId) => String(ownerId || "").trim())
    .filter(Boolean)
    .includes(normalizedId);
}

function isGuildOwner(member) {
  const memberId = getMemberId(member);
  const guildOwnerId = String(member?.guild?.ownerId || "").trim();
  return Boolean(memberId && guildOwnerId && memberId === guildOwnerId);
}

function hasPermission(member, permission) {
  if (!member) {
    return false;
  }
  if (member.permissions?.has) {
    return member.permissions.has(permission);
  }
  if (member.permissions != null) {
    try {
      return new PermissionsBitField(member.permissions).has(permission);
    } catch {
      return false;
    }
  }
  return false;
}

function isAdmin(member) {
  return hasPermission(member, PermissionFlagsBits.Administrator);
}

function getCommandPermissionOverride(commandName, settings) {
  const allOverrides = settings.commandPermissions;
  if (!allOverrides || typeof allOverrides !== "object") {
    return { enabled: true, allowedRoleIds: [], deniedRoleIds: [], adminBypass: true };
  }
  const entry = allOverrides[commandName];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { enabled: true, allowedRoleIds: [], deniedRoleIds: [], adminBypass: true };
  }
  return {
    enabled: entry.enabled !== false,
    allowedRoleIds: Array.isArray(entry.allowedRoleIds)
      ? entry.allowedRoleIds.map((roleId) => String(roleId || "").trim()).filter(Boolean)
      : [],
    deniedRoleIds: Array.isArray(entry.deniedRoleIds)
      ? entry.deniedRoleIds.map((roleId) => String(roleId || "").trim()).filter(Boolean)
      : [],
    adminBypass: entry.adminBypass !== false
  };
}

function canUseBaseCommandRules(member, commandName, settings) {
  const hasFull = hasAnyRole(member, settings.fullCommandRoleIds);
  const hasTimeoutOnly = hasAnyRole(member, settings.timeoutOnlyRoleIds);
  const hasConfirmationAccess = hasAnyRole(member, settings.confirmationRoleIds);

  if (ownerOnlyCommands.has(commandName)) {
    const ownerId = config.botOwnerId;
    const memberId = getMemberId(member);
    const guildOwnerId = String(member?.guild?.ownerId || "").trim();
    return Boolean(
      memberId &&
        ((ownerId && memberId === ownerId) || (guildOwnerId && memberId === guildOwnerId))
    );
  }
  if (publicCommands.has(commandName)) {
    return true;
  }
  if (commandName === "confirmation") {
    return hasConfirmationAccess || hasFull;
  }
  if (manageGuildCommands.has(commandName)) {
    return hasPermission(member, PermissionFlagsBits.ManageGuild) || hasFull;
  }
  if (fullRoleOnlyCommands.has(commandName)) {
    return hasFull;
  }
  if (restrictedForTimeoutOnly.has(commandName)) {
    return hasFull;
  }
  if (commandName === "timeout") {
    return hasFull || hasTimeoutOnly;
  }
  return hasFull || hasTimeoutOnly;
}

function canUseCommand(member, commandName) {
  if (!member) {
    return false;
  }
  const settings = getGuildSettingsSync(member.guild?.id);
  const commandOverride = getCommandPermissionOverride(commandName, settings);
  const memberId = getMemberId(member);

  // The configured bot creator and the Discord server owner can manage commands
  // before per-guild role gates, disabled lists, or deny roles are checked.
  if (isBotOwnerId(memberId) || isGuildOwner(member)) {
    return true;
  }

  if (!commandOverride.enabled) {
    return false;
  }
  if (Array.isArray(settings.disabledCommands) && settings.disabledCommands.includes(commandName)) {
    return false;
  }

  // Owner-only mode is disabled to avoid accidental command lockout for staff/alts.

  if (hasAnyRole(member, commandOverride.deniedRoleIds)) {
    return false;
  }

  if (isAdmin(member) && commandOverride.adminBypass) {
    return true;
  }
  if (commandOverride.allowedRoleIds.length > 0) {
    return hasAnyRole(member, commandOverride.allowedRoleIds);
  }

  return canUseBaseCommandRules(member, commandName, settings);
}

function canHandleTicket(member, ticketType) {
  if (!member) {
    return false;
  }
  if (isAdmin(member)) {
    return true;
  }
  return hasAnyRole(member, getTicketTeamRoleIds(ticketType, member.guild?.id));
}

module.exports = {
  canUseCommand,
  canHandleTicket,
  hasRole,
  hasAnyRole,
  hasPermission,
  isAdmin,
  isBotOwnerId,
  isGuildOwner
};
