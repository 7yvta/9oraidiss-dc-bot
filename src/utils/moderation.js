const config = require("../config");

const DESIGN_ROLE_IDS = [
  "1499840193447071805",
  "1499841126129995897",
  "1499840987495665774",
  "1499840862417588225",
  "1499840816322187457"
];

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

function canModerate(invoker, target) {
  if (invoker.id === target.id) {
    return false;
  }
  if (target.id === invoker.guild.ownerId) {
    return false;
  }
  // Bot owner has full access to all commands
  if (isBotOwnerId(invoker.id)) {
    return true;
  }
  if (invoker.id === invoker.guild.ownerId) {
    return true;
  }

  // Filter out design roles when comparing hierarchy
  const invokerRoles = invoker.roles.cache.filter(role => !DESIGN_ROLE_IDS.includes(role.id));
  const targetRoles = target.roles.cache.filter(role => !DESIGN_ROLE_IDS.includes(role.id));

  const invokerHighest = invokerRoles.size > 0 ? invokerRoles.sort((a, b) => b.position - a.position).first().position : 0;
  const targetHighest = targetRoles.size > 0 ? targetRoles.sort((a, b) => b.position - a.position).first().position : 0;

  return invokerHighest > targetHighest;
}

module.exports = {
  canModerate
};
