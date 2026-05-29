const { PermissionFlagsBits, PermissionsBitField } = require("discord.js");

const levelRoleSpecialPermissions = new PermissionsBitField([
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.UseExternalStickers
]);

function getLevelRewardRoleIds(settings) {
  const rewards = Array.isArray(settings?.levelRewards) ? settings.levelRewards : [];
  return Array.from(
    new Set(
      rewards
        .map((reward) => String(reward?.roleId || "").trim())
        .filter(Boolean)
    )
  );
}

async function ensureRoleHasLevelSpecialPermissions(guild, roleId) {
  if (!guild || !roleId) {
    return { ok: false, reason: "invalid_input" };
  }

  const role =
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    return { ok: false, reason: "role_not_found" };
  }
  if (role.managed) {
    return { ok: false, reason: "managed_role" };
  }

  if (role.permissions.has(levelRoleSpecialPermissions)) {
    return { ok: true, updated: false };
  }

  try {
    const updatedPermissions = role.permissions.add(levelRoleSpecialPermissions);
    await role.setPermissions(
      updatedPermissions,
      "Ensure level role has reactions, GIF, and image permissions"
    );
    return { ok: true, updated: true };
  } catch (error) {
    return {
      ok: false,
      reason: "set_permissions_failed",
      error: String(error?.message || error)
    };
  }
}

async function syncLevelRewardRolePermissionsForGuild(guild, settings) {
  const roleIds = getLevelRewardRoleIds(settings);
  const result = {
    checked: roleIds.length,
    updated: 0,
    failed: []
  };

  for (const roleId of roleIds) {
    const permResult = await ensureRoleHasLevelSpecialPermissions(guild, roleId);
    if (permResult.ok && permResult.updated) {
      result.updated += 1;
      continue;
    }
    if (!permResult.ok) {
      result.failed.push({
        roleId,
        reason: permResult.reason,
        error: permResult.error || null
      });
    }
  }

  return result;
}

module.exports = {
  levelRoleSpecialPermissions,
  ensureRoleHasLevelSpecialPermissions,
  syncLevelRewardRolePermissionsForGuild
};
