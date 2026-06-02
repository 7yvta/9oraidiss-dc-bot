const { ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const { getGuildSettingsSync } = require("./guildSettings");

const CHANNEL_THEME_LAYOUT = Object.freeze([
  {
    name: "📊・server-stats",
    channels: [
      {
        name: "👥・all-members",
        aliases: ["all-members", "all members"],
        permissionProfile: "stats_readonly"
      },
      {
        name: "👤・members",
        aliases: ["members"],
        permissionProfile: "stats_readonly"
      },
      {
        name: "🤖・bots",
        aliases: ["bots"],
        permissionProfile: "stats_readonly"
      }
    ]
  },
  {
    name: "ℹ��・info",
    channels: [
      {
        name: "👋・welcome",
        aliases: ["welcome"],
        permissionProfile: "public_readonly"
      },
      {
        name: "📣・announcements",
        aliases: ["announcements"],
        permissionProfile: "public_readonly"
      },
      {
        name: "🕵��・leaks",
        aliases: ["leaks"],
        permissionProfile: "public_readonly"
      },
      {
        name: "📜・rules",
        aliases: ["rules"],
        permissionProfile: "public_readonly"
      },
      {
        name: "🎭・roles",
        aliases: ["roles"],
        permissionProfile: "public_readonly"
      },
      {
        name: "���・server-link",
        aliases: ["server-link"],
        permissionProfile: "public_readonly"
      },
      {
        name: "��・partner-servers",
        aliases: ["partner-server", "partner-servers"],
        permissionProfile: "public_readonly"
      },
      {
        name: "💼・owner-trades",
        aliases: ["owner-trads", "owner-trades"],
        permissionProfile: "public_readonly"
      }
    ]
  },
  {
    name: "💬・main",
    channels: [
      {
        name: "💭・general",
        aliases: ["general", "blox-chat"],
        permissionProfile: "public_chat"
      },
      {
        name: "���・question-help",
        aliases: ["question-and-help", "question-help", "help"],
        permissionProfile: "public_chat"
      },
      {
        name: "📷・media",
        aliases: ["media"],
        permissionProfile: "public_media"
      },
      {
        name: "🤖・cmds",
        aliases: ["cmds", "commands", "bot-commands"],
        permissionProfile: "public_commands"
      }
    ]
  },
  {
    name: "🛟・support",
    channels: [
      {
        name: "📨・reports",
        aliases: ["reports"],
        permissionProfile: "support_reports"
      },
      {
        name: "host-giveaway",
        aliases: ["host-giveaway", "giveaway-host"],
        permissionProfile: "support_host_giveaway"
      }
    ]
  },
  {
    name: "💱・trading",
    channels: [
      {
        name: "���・fruit-stock",
        aliases: ["fruit-stock", "blox-fruits-stock"],
        permissionProfile: "public_chat"
      },
      {
        name: "👀・last-seen",
        aliases: ["last-seen"],
        permissionProfile: "public_chat"
      },
      {
        name: "💎・fast-trading",
        aliases: ["fast-trading", "trading-sab"],
        permissionProfile: "public_chat"
      },
      {
        name: "💵・slow-trading",
        aliases: ["slow-trading", "blox-fruit-trading"],
        permissionProfile: "public_chat"
      },
      {
        name: "💰・fruit-values",
        aliases: ["fruit-values", "values"],
        permissionProfile: "public_chat"
      },
      {
        name: "🌀・win-or-loss",
        aliases: ["win-or-loss", "winorlose", "auto-winorlose"],
        permissionProfile: "public_chat"
      }
    ]
  },
  {
    name: "gameplay",
    channels: [
      {
        name: "���・crews",
        aliases: ["crews"],
        permissionProfile: "public_chat"
      },
      {
        name: "💣・raids",
        aliases: ["raids"],
        permissionProfile: "public_chat"
      },
      {
        name: "🦴・prehistoric-island",
        aliases: ["prehistoric-island"],
        permissionProfile: "public_chat"
      },
      {
        name: "🌊・sea-events",
        aliases: ["sea-events"],
        permissionProfile: "public_chat"
      },
      {
        name: "🦄・race-callouts",
        aliases: ["race-callouts"],
        permissionProfile: "public_chat"
      },
      {
        name: "���・dungeons",
        aliases: ["dungeons"],
        permissionProfile: "public_chat"
      }
    ]
  },
  {
    name: "��・community",
    channels: [
      {
        name: "🗣��・blox-chat",
        aliases: ["blox-chat", "general"],
        permissionProfile: "public_chat"
      },
      {
        name: "📈・leveling",
        aliases: ["leveling"],
        permissionProfile: "public_chat"
      },
      {
        name: "���・counting",
        aliases: ["counting"],
        permissionProfile: "public_chat"
      }
    ]
  },
  {
    name: "🎫・tickets",
    channels: [
      {
        name: "📋・ticket-rules",
        aliases: ["ticket-rules"],
        permissionProfile: "public_readonly"
      },
      {
        name: "🎫・open-support-ticket",
        aliases: ["open-support-ticket", "open-a-ticket", "support-ticket"],
        permissionProfile: "public_readonly"
      },
      {
        name: "middleman-ticket",
        aliases: ["open-middleman-ticket", "middleman-ticket"],
        permissionProfile: "public_readonly"
      },
      {
        name: "📊・open-index-ticket",
        aliases: ["open-index-ticket", "index-ticket"],
        permissionProfile: "public_readonly"
      },
      {
        name: "🧾・open-role-request",
        aliases: ["open-role-request", "role-request"],
        permissionProfile: "public_readonly"
      },
      {
        name: "��・applications",
        aliases: ["applications"],
        permissionProfile: "public_readonly"
      }
    ]
  },
  {
    name: "��・vouches",
    channels: [
      {
        name: "����・vouch-submit",
        aliases: ["vouch-submit"],
        permissionProfile: "public_chat"
      },
      {
        name: "📌・vouches",
        aliases: ["vouches"],
        permissionProfile: "public_chat"
      }
    ]
  },
  {
    name: "🛡��・staff",
    channels: [
      {
        name: "🧪・test-lab",
        aliases: ["test-lab"],
        permissionProfile: "staff_private"
      },
      {
        name: "💬・staff-chat",
        aliases: ["staff-chat"],
        permissionProfile: "staff_private"
      },
      {
        name: "📚・server-logs",
        aliases: ["server-logs"],
        permissionProfile: "staff_private"
      },
      {
        name: "���・mod-logs",
        aliases: ["mod-logs"],
        permissionProfile: "staff_private"
      },
      {
        name: "📨・applications-appeals",
        aliases: ["applications-appeals"],
        permissionProfile: "staff_private"
      },
      {
        name: "🎫・tickets-log",
        aliases: ["tickets", "ticket-logs", "tickets-log"],
        permissionProfile: "staff_private"
      },
      {
        name: "🚨・security-audit",
        aliases: ["security-audit"],
        permissionProfile: "staff_private"
      }
    ]
  }
]);

const CHANNEL_PERMISSION_PROFILES = Object.freeze({
  public_chat: { mode: "public_chat" },
  public_media: { mode: "public_media" },
  public_commands: { mode: "public_commands" },
  public_readonly: { mode: "public_readonly" },
  stats_readonly: { mode: "public_readonly" },
  staff_private: { mode: "staff_private" },
  support_reports: {
    mode: "support_queue",
    includeReportHandlers: true,
    includeSupportTeam: false,
    includeFullCommandRoles: false,
    includeForceClaimRoles: true,
    includeCreatorRoles: false
  },
  support_host_giveaway: {
    mode: "support_queue",
    includeReportHandlers: false,
    includeSupportTeam: false,
    includeFullCommandRoles: false,
    includeForceClaimRoles: true,
    includeGiveawayHostRole: true,
    includeHostGiveawayRoles: true
  }
});

const THEME_CHANNEL_LOOKUP = new Set(
  CHANNEL_THEME_LAYOUT.flatMap((category) =>
    category.channels.flatMap((channel) => [channel.name, ...(channel.aliases || [])])
  ).map((name) => normalizeName(name))
);

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
}

function getTargetGuildIds() {
  if (
    Array.isArray(config.autoChannelThemeGuildIds) &&
    config.autoChannelThemeGuildIds.length > 0
  ) {
    return config.autoChannelThemeGuildIds.map((entry) => String(entry));
  }
  if (config.guildId) {
    return [String(config.guildId)];
  }
  return [];
}

function findCategoryByName(guild, desiredName) {
  const desiredNorm = normalizeName(desiredName);
  return (
    guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        normalizeName(channel.name) === desiredNorm
    ) || null
  );
}

function buildAliasSet(targetName, aliases = []) {
  return new Set([targetName, ...(Array.isArray(aliases) ? aliases : [])].map(normalizeName));
}

function findMatchingChannel(guild, targetName, aliases = [], type = ChannelType.GuildText, usedIds = new Set()) {
  const aliasSet = buildAliasSet(targetName, aliases);
  return (
    guild.channels.cache.find((channel) => {
      if (usedIds.has(String(channel.id))) {
        return false;
      }
      if (type === ChannelType.GuildVoice) {
        if (channel.type !== ChannelType.GuildVoice) {
          return false;
        }
      } else if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      ) {
        return false;
      }

      return aliasSet.has(normalizeName(channel.name));
    }) || null
  );
}

function baseBotAllow() {
  return [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak
  ];
}

function collectSupportWriterRoleIds(settings, permissionProfile) {
  const profile = CHANNEL_PERMISSION_PROFILES[permissionProfile];
  if (!profile || profile.mode !== "support_queue") {
    return [];
  }

  const ids = [];

  if (profile.includeSupportTeam) {
    ids.push(...(Array.isArray(settings.supportTeamRoleIds) ? settings.supportTeamRoleIds : []));
  }
  if (profile.includeFullCommandRoles) {
    ids.push(...(Array.isArray(settings.fullCommandRoleIds) ? settings.fullCommandRoleIds : []));
  }
  if (profile.includeForceClaimRoles) {
    ids.push(
      ...(Array.isArray(settings.ticketForceClaimRoleIds) ? settings.ticketForceClaimRoleIds : [])
    );
  }
  if (profile.includeReportHandlers) {
    ids.push(...(Array.isArray(settings.reportHandlerRoleIds) ? settings.reportHandlerRoleIds : []));
    ids.push(...(Array.isArray(settings.reportTeamRoleIds) ? settings.reportTeamRoleIds : []));
  }
  if (profile.includeGiveawayHostRole && settings.giveawayHostRoleId) {
    ids.push(settings.giveawayHostRoleId);
  }
  if (profile.includeHostGiveawayRoles) {
    ids.push(...(Array.isArray(settings.hostGiveawayRoleIds) ? settings.hostGiveawayRoleIds : []));
    ids.push(...(Array.isArray(settings.hostGiveawayTeamRoleIds) ? settings.hostGiveawayTeamRoleIds : []));
  }

  return uniqueIds(ids);
}

function collectStaffRoleIds(settings) {
  return uniqueIds([
    ...(Array.isArray(settings.fullCommandRoleIds) ? settings.fullCommandRoleIds : []),
    ...(Array.isArray(settings.timeoutOnlyRoleIds) ? settings.timeoutOnlyRoleIds : []),
    ...(Array.isArray(settings.supportTeamRoleIds) ? settings.supportTeamRoleIds : []),
    ...(Array.isArray(settings.middlemanTeamRoleIds) ? settings.middlemanTeamRoleIds : []),
    ...(Array.isArray(settings.indexTeamRoleIds) ? settings.indexTeamRoleIds : []),
    ...(Array.isArray(settings.roleRequestTeamRoleIds) ? settings.roleRequestTeamRoleIds : []),
    ...(Array.isArray(settings.reportTeamRoleIds) ? settings.reportTeamRoleIds : []),
    ...(Array.isArray(settings.hostGiveawayTeamRoleIds) ? settings.hostGiveawayTeamRoleIds : []),
    ...(Array.isArray(settings.ticketForceClaimRoleIds) ? settings.ticketForceClaimRoleIds : [])
  ]);
}

function buildPublicOverwrites(channel, clientUserId, mode) {
  const everyoneAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory
  ];

  if (mode === "public_chat" || mode === "public_media" || mode === "public_commands") {
    everyoneAllow.push(
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.AddReactions
    );
  }

  if (mode === "public_media") {
    everyoneAllow.push(PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks);
  }

  if (mode === "public_commands") {
    everyoneAllow.push(PermissionFlagsBits.UseApplicationCommands);
  }

  return [
    { id: channel.guild.roles.everyone.id, allow: everyoneAllow },
    { id: clientUserId, allow: baseBotAllow() }
  ];
}

function buildSupportQueueOverwrites(channel, clientUserId, writerRoleIds) {
  const overwrites = [
    {
      id: channel.guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.AddReactions
      ]
    },
    {
      id: clientUserId,
      allow: baseBotAllow()
    }
  ];

  for (const roleId of writerRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.AddReactions
      ]
    });
  }

  return overwrites;
}

function buildStaffPrivateOverwrites(channel, clientUserId, staffRoleIds) {
  const overwrites = [
    {
      id: channel.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: clientUserId,
      allow: baseBotAllow()
    }
  ];

  for (const roleId of staffRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  return overwrites;
}

async function applyPermissionProfile(channel, settings, permissionProfile, details) {
  if (!permissionProfile || !CHANNEL_PERMISSION_PROFILES[permissionProfile]) {
    return { changed: false, skipped: true, failed: false };
  }

  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    return { changed: false, skipped: true, failed: false };
  }

  const profile = CHANNEL_PERMISSION_PROFILES[permissionProfile];
  const clientUserId = channel.client?.user?.id;
  if (!clientUserId) {
    details.push(`[FAIL] Missing bot user ID while syncing permissions: ${channel.name}`);
    return { changed: false, skipped: false, failed: true };
  }

  let overwrites = [];
  if (
    profile.mode === "public_chat" ||
    profile.mode === "public_media" ||
    profile.mode === "public_commands" ||
    profile.mode === "public_readonly"
  ) {
    overwrites = buildPublicOverwrites(channel, clientUserId, profile.mode);
  } else if (profile.mode === "support_queue") {
    const writerRoleIds = collectSupportWriterRoleIds(settings, permissionProfile);
    overwrites = buildSupportQueueOverwrites(channel, clientUserId, writerRoleIds);
  } else if (profile.mode === "staff_private") {
    const staffRoleIds = collectStaffRoleIds(settings);
    overwrites = buildStaffPrivateOverwrites(channel, clientUserId, staffRoleIds);
  }

  const applied = await channel.permissionOverwrites
    .set(overwrites, "Auto channel permission sync")
    .then(() => true)
    .catch(() => false);

  if (!applied) {
    details.push(`[FAIL] Could not set permissions on: ${channel.name}`);
    return { changed: false, skipped: false, failed: true };
  }

  details.push(`[OK] Permissions synced: ${channel.name}`);
  return { changed: true, skipped: false, failed: false };
}

async function ensureCategory(guild, categoryName, details) {
  let category = findCategoryByName(guild, categoryName);
  if (!category) {
    category = await guild.channels
      .create({
        name: categoryName,
        type: ChannelType.GuildCategory
      })
      .catch(() => null);

    if (!category) {
      details.push(`[FAIL] Could not create category: ${categoryName}`);
      return null;
    }

    details.push(`[OK] Created category: ${categoryName}`);
  } else if (category.name !== categoryName) {
    await category.setName(categoryName, "Auto channel theme sync").catch(() => null);
    details.push(`[OK] Renamed category: ${categoryName}`);
  } else {
    details.push(`[SKIP] Category exists: ${categoryName}`);
  }

  return category;
}

async function applyChannelThemeToGuild(guild) {
  if (!guild) {
    return { changed: 0, failed: 0, skipped: 0, details: [] };
  }

  await guild.channels.fetch().catch(() => null);
  const settings = getGuildSettingsSync(guild.id);

  let changed = 0;
  let failed = 0;
  let skipped = 0;
  const details = [];
  const usedChannelIds = new Set();

  for (const categoryPlan of CHANNEL_THEME_LAYOUT) {
    const category = await ensureCategory(guild, categoryPlan.name, details);
    if (!category) {
      failed += 1;
      continue;
    }

    for (const target of categoryPlan.channels) {
      const type = target.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
      let channel = findMatchingChannel(guild, target.name, target.aliases, type, usedChannelIds);

      if (!channel) {
        channel = await guild.channels
          .create({
            name: target.name,
            type,
            parent: category.id
          })
          .catch(() => null);

        if (!channel) {
          failed += 1;
          details.push(`[FAIL] Could not create channel: ${target.name}`);
          continue;
        }

        changed += 1;
        details.push(`[OK] Created channel: ${target.name}`);
      } else {
        let channelChanged = false;

        if (channel.name !== target.name) {
          const renamed = await channel
            .setName(target.name, "Auto channel theme sync")
            .then(() => true)
            .catch(() => false);

          if (renamed) {
            channelChanged = true;
          } else {
            failed += 1;
            details.push(`[FAIL] Could not rename channel: ${channel.name} -> ${target.name}`);
          }
        }

        if (String(channel.parentId || "") !== String(category.id)) {
          const moved = await channel
            .setParent(category.id, { lockPermissions: false })
            .then(() => true)
            .catch(() => false);

          if (moved) {
            channelChanged = true;
          } else {
            failed += 1;
            details.push(`[FAIL] Could not move channel: ${target.name}`);
          }
        }

        if (channelChanged) {
          changed += 1;
          details.push(`[OK] Updated channel: ${target.name}`);
        } else {
          skipped += 1;
          details.push(`[SKIP] Channel already aligned: ${target.name}`);
        }
      }

      usedChannelIds.add(String(channel.id));

      const permissionResult = await applyPermissionProfile(
        channel,
        settings,
        target.permissionProfile,
        details
      );

      if (permissionResult.failed) {
        failed += 1;
      } else if (permissionResult.changed) {
        changed += 1;
      } else if (permissionResult.skipped) {
        skipped += 1;
      }
    }
  }

  return { changed, failed, skipped, details };
}

function isThemeManagedChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) {
    return false;
  }
  return THEME_CHANNEL_LOOKUP.has(normalizeName(channel.name));
}

async function syncChannelThemeForConfiguredGuilds(client) {
  if (!config.autoChannelThemeEnabled) {
    return { skipped: true, reason: "disabled", results: [] };
  }

  const guildIds = getTargetGuildIds();
  if (guildIds.length === 0) {
    return { skipped: true, reason: "no_target_guilds", results: [] };
  }

  const results = [];
  for (const guildId of guildIds) {
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));

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

    const result = await applyChannelThemeToGuild(guild);
    results.push({ guildId: guild.id, ...result });
  }

  return { skipped: false, results };
}

module.exports = {
  CHANNEL_THEME_LAYOUT,
  applyChannelThemeToGuild,
  isThemeManagedChannel,
  syncChannelThemeForConfiguredGuilds
};

