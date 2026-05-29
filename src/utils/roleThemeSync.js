const config = require("../config");

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseColorHex(hex) {
  const cleaned = String(hex || "")
    .trim()
    .replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null;
  }
  return Number.parseInt(cleaned, 16);
}

// First 3 role names are intentionally untouched:
// 1) ✦ Founder
// 2) psps
// 3) server bot
const ROLE_THEME_RULES = Object.freeze([
  { match: "a administrator", name: "[ A ] Administrator", color: "#72D6FF" },
  { match: "a admin", name: "[ A ] Admin ✅", color: "#D5D7DC" },
  { match: "i index seller", name: "[ I ] Index Seller 💰", color: "#F59E0B" },
  { match: "s head moderator", name: "[ S ] Head Moderator 🛡️", color: "#ECEEF2" },
  { match: "s senior moderator", name: "[ S ] Senior Moderator 🔰", color: "#EF2F2F" },
  { match: "mm middleman", name: "[ MM ] Middleman 🐐", color: "#42D87C" },
  { match: "shadow regent", name: "[ A ] Administrator", color: "#7DD3FC" },
  { match: "shadow marshal", name: "[ A ] Admin ✅", color: "#E5E7EB" },
  { match: "shadow sentinel", name: "[ S ] Senior Moderator 🔰", color: "#EF4444" },
  { match: "mod admin", name: "[ S ] Head Moderator 🛡️", color: "#F8FAFC" },
  { match: "mod commander", name: "[ S ] Senior Moderator 🔰", color: "#EF4444" },
  { match: "mod sentinel", name: "[ S ] Senior Moderator 🔰", color: "#EF4444" },
  { match: "index analyst", name: "[ I ] Index Seller 💰", color: "#F59E0B" },
  { match: "index division", name: "[ I ] Index Seller 💰", color: "#F59E0B" },
  { match: "trade sentinel", name: "[ MM ] Middleman 🐐", color: "#22C55E" },
  { match: "middleman team", name: "[ MM ] Middleman 🐐", color: "#22C55E" },
  { match: "report staff iii", name: "\u2726 Shadow Sentinel", color: "#F97316" },
  { match: "report staff ii", name: "\u2726 Shadow Marshal", color: "#EA580C" },
  { match: "report staff i", name: "\u2726 Shadow Regent", color: "#DC2626" },
  { match: "role request staff", name: "\u2726 Access Warden", color: "#A855F7" },
  { match: "co founder", name: "\u2726 Co-Founder", color: "#A78BFA" },
  {
    match: "staff division",
    name: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 STAFF DIVISION \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
    color: "#94A3B8"
  },
  { match: "operations manager", name: "\u2726 Operations Manager", color: "#EF4444" },
  { match: "senior operations", name: "\u2726 Senior Operations", color: "#2563EB" },
  { match: "staff core", name: "\u2726 Staff Core", color: "#BE185D" },
  { match: "support overseer", name: "\u2726 Support Overseer", color: "#0891B2" },
  {
    match: "support hub",
    name: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 SUPPORT HUB \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
    color: "#9CA3AF"
  },
  { match: "helper unit", name: "\u2726 Helper Unit", color: "#14B8A6" },
  { match: "support team", name: "\u2726 Support Team", color: "#0EA5E9" },
  { match: "index division", name: "\u2726 Index Division", color: "#7C3AED" },
  { match: "content creator", name: "\u2726 Content Creator", color: "#DC2626" },
  { match: "rising", name: "\u2726 Rising", color: "#8B5CF6" },
  { match: "starter", name: "\u2726 Starter", color: "#22C55E" },
  { match: "member", name: "\u2726 Member", color: "#16A34A" },
  {
    match: "alert system",
    name: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 ALERT SYSTEM \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
    color: "#94A3B8"
  },
  { match: "stock alerts", name: "\u2726 Stock Alerts", color: "#F8FAFC" },
  { match: "leaks alerts", name: "\u2726 Leaks Alerts", color: "#E5E7EB" },
  { match: "premium trades", name: "\u2726 Elite Trades", color: "#EAB308" },
  { match: "announcements", name: "\u2726 Announcements", color: "#A78BFA" },
  { match: "content ping", name: "\u2726 Content Ping", color: "#B91C1C" }
]);

const ROLE_ID_THEME_RULES = Object.freeze({
  "1479263062065152111": { name: "[ A ] Administrator", color: "#72D6FF", preserveName: true },
  "1479263536797454489": { name: "[ A ] Admin ✅", color: "#D5D7DC", preserveName: true },
  "1499837044237537460": { name: "[ MM ] Middleman 🐐", color: "#42D87C", preserveName: true },
  "1505637024588234993": { name: "\u2726 Service Vanguard", color: "#6366F1" },
  "1505632362417885194": { name: "\u2726 Service Command", color: "#4F46E5" },
  "1505612011579506711": { name: "\u2726 Service Director", color: "#F59E0B" },
  "1505612010690314340": { name: "\u2726 Service Head", color: "#EF4444" },
  "1505612011269132359": { name: "\u2726 Service Senior", color: "#3B82F6" },
  "1505612010077818991": { name: "\u2726 Service Helper", color: "#10B981" },
  "1479264429383225520": { name: "[ S ] Head Moderator 🛡️", color: "#ECEEF2", preserveName: true },
  "1483634346333311160": { name: "[ I ] Index Seller 💰", color: "#F59E0B", preserveName: true },
  "1493298416363765941": { name: "\u2726 Access Warden", color: "#A855F7" },
  "1479264180866388089": { name: "[ S ] Head Moderator 🛡️", color: "#ECEEF2", preserveName: true },
  "1479263836778532934": { name: "[ S ] Senior Moderator 🔰", color: "#EF2F2F", preserveName: true },
  "1483555926492451118": { name: "[ S ] Senior Moderator 🔰", color: "#EF2F2F", preserveName: true },
  "1481709821844520970": { name: "\u2726 Giveaway Marshal", color: "#EC4899" }
});

const BLOX_FRUIT_SERVICE_ROLE_CHAIN = Object.freeze([
  {
    name: "\u2726 Service Director",
    color: "#F59E0B",
    aliases: [
      "\u2726 Blox Fruit Service Director",
      "blox fruit service director",
      "blox fruit director"
    ]
  },
  {
    name: "\u2726 Service Head",
    color: "#EF4444",
    aliases: [
      "\u2726 Blox Fruit Service Head",
      "blox fruit service head",
      "blox fruit head"
    ]
  },
  {
    name: "\u2726 Service Senior",
    color: "#3B82F6",
    aliases: [
      "\u2726 Blox Fruit Service Senior",
      "blox fruit service senior",
      "blox fruit senior"
    ]
  },
  {
    name: "\u2726 Service Helper",
    color: "#10B981",
    aliases: [
      "\u2726 Blox Fruit Service Helper",
      "blox fruit service helper",
      "blox fruit helper"
    ]
  }
]);

function getTargetGuildIds() {
  if (Array.isArray(config.autoRoleThemeGuildIds) && config.autoRoleThemeGuildIds.length > 0) {
    return config.autoRoleThemeGuildIds.map((entry) => String(entry));
  }
  if (config.guildId) {
    return [String(config.guildId)];
  }
  return [];
}

function findRuleForRole(roleName) {
  const normalized = normalizeName(roleName);
  return ROLE_THEME_RULES.find((rule) => normalized.includes(rule.match));
}

function findRuleForRoleId(roleId) {
  return ROLE_ID_THEME_RULES[String(roleId || "").trim()] || null;
}

function findRoleByLooseName(guild, roleName) {
  const target = normalizeName(roleName);
  return guild.roles.cache.find((role) => normalizeName(role.name) === target) || null;
}

function findServiceRoleBySpec(guild, spec) {
  const namesToMatch = [spec.name, ...(Array.isArray(spec.aliases) ? spec.aliases : [])]
    .map((entry) => normalizeName(entry))
    .filter(Boolean);
  if (namesToMatch.length > 0) {
    const exact = guild.roles.cache.find((role) =>
      namesToMatch.includes(normalizeName(role.name))
    );
    if (exact) {
      return exact;
    }
  }

  const keyTokens = normalizeName(spec.name)
    .split(" ")
    .filter((token) => token.length > 2);
  if (keyTokens.length > 0) {
    const fuzzy = guild.roles.cache.find((role) => {
      const roleNorm = normalizeName(role.name);
      return keyTokens.every((token) => roleNorm.includes(token));
    });
    if (fuzzy) {
      return fuzzy;
    }
  }

  return null;
}

async function ensureBloxFruitServiceRoles(guild, details) {
  const ensuredRoles = [];

  for (const spec of BLOX_FRUIT_SERVICE_ROLE_CHAIN) {
    let role = findServiceRoleBySpec(guild, spec) || findRoleByLooseName(guild, spec.name);
    if (!role) {
      role = await guild.roles
        .create({
          name: spec.name,
          color: parseColorHex(spec.color)
        })
        .catch(() => null);
      if (!role) {
        details.push(`[FAIL] Could not create role: ${spec.name}`);
        continue;
      }
      details.push(`[OK] Created role: ${spec.name}`);
    }

    const targetColor = parseColorHex(spec.color);
    const needsName = String(role.name || "") !== String(spec.name);
    const needsColor = Number(role.color || 0) !== Number(targetColor || 0);
    if ((needsName || needsColor) && role.editable) {
      const updated = await role
        .edit(
          { name: spec.name, color: targetColor ?? role.color },
          "Auto service role sync"
        )
        .then(() => true)
        .catch(() => false);
      if (!updated) {
        details.push(`[FAIL] Could not update role: ${spec.name}`);
      }
    }

    ensuredRoles.push(role);
  }

  // Keep chain above level roles if possible (helper -> senior -> head -> director).
  const levelAnchor = guild.roles.cache
    .filter((role) => {
      const normalized = normalizeName(role.name);
      return (
        normalized.includes("level") ||
        normalized.includes("starter") ||
        normalized.includes("member") ||
        normalized.includes("rising")
      );
    })
    .sort((a, b) => b.position - a.position)
    .first();

  if (levelAnchor && ensuredRoles.length > 0) {
    let nextPosition = Number(levelAnchor.position) + 1;
    for (let index = ensuredRoles.length - 1; index >= 0; index -= 1) {
      const role = ensuredRoles[index];
      if (!role?.editable) {
        continue;
      }
      await role.setPosition(nextPosition, { relative: false }).catch(() => null);
      nextPosition += 1;
    }
  }

  return ensuredRoles
    .map((role) => String(role?.id || "").trim())
    .filter(Boolean);
}

async function applyRoleThemeToGuild(guild) {
  if (!guild) {
    return { changed: 0, failed: 0, skipped: 0, details: [] };
  }

  await guild.roles.fetch().catch(() => null);

  const details = [];
  let changed = 0;
  let failed = 0;
  let skipped = 0;

  for (const role of guild.roles.cache.values()) {
    if (!role || role.managed || role.id === guild.id) {
      continue;
    }

    const idRule = findRuleForRoleId(role.id);
    const nameRule = idRule ? null : findRuleForRole(role.name);
    const rule = idRule || nameRule;
    if (!rule) {
      continue;
    }

    if (!role.editable) {
      skipped += 1;
      details.push(`[SKIP] ${role.name} (${role.id}) not editable`);
      continue;
    }

    const targetColor = parseColorHex(rule.color);
    // Force color-only sync: never rename roles from this sync routine.
    const shouldPreserveName = true;
    const needsName = shouldPreserveName ? false : role.name !== rule.name;
    const needsColor = Number(role.color || 0) !== Number(targetColor || 0);
    if (!needsName && !needsColor) {
      continue;
    }

    try {
      const editPayload = {
        color: targetColor ?? role.color
      };
      if (!shouldPreserveName) {
        editPayload.name = rule.name;
      }
      await role.edit(
        editPayload,
        "Auto role theme sync"
      );
      changed += 1;
      details.push(
        shouldPreserveName
          ? `[OK] Updated color for ${role.name}`
          : `[OK] ${role.name} -> ${rule.name}`
      );
    } catch (error) {
      failed += 1;
      details.push(`[FAIL] ${role.name} (${role.id}) ${String(error?.message || error)}`);
    }
  }

  const touchServiceChain =
    String(process.env.ROLE_THEME_TOUCH_SERVICE_CHAIN || "false").toLowerCase() ===
    "true";
  if (touchServiceChain) {
    const serviceRoleIds = await ensureBloxFruitServiceRoles(guild, details);
    if (serviceRoleIds.length > 0) {
      details.push(`[OK] Service role chain verified (${serviceRoleIds.length} roles).`);
    }
  }

  return { changed, failed, skipped, details };
}

async function syncRoleThemeForConfiguredGuilds(client) {
  if (!config.autoRoleThemeEnabled) {
    return { skipped: true, reason: "disabled", results: [] };
  }

  const guildIds = getTargetGuildIds();
  if (guildIds.length === 0) {
    return { skipped: true, reason: "no_target_guilds", results: [] };
  }

  const results = [];
  for (const guildId of guildIds) {
    const guild =
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      results.push({
        guildId,
        changed: 0,
        failed: 1,
        skipped: 0,
        details: ["[FAIL] Guild not found"]
      });
      continue;
    }

    const result = await applyRoleThemeToGuild(guild);
    results.push({
      guildId: guild.id,
      ...result
    });
  }

  return { skipped: false, results };
}

module.exports = {
  ROLE_THEME_RULES,
  syncRoleThemeForConfiguredGuilds
};
