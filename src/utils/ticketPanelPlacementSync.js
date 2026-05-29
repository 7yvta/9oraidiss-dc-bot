const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const config = require("../config");
const { getGuildSettingsSync } = require("./guildSettings");
const { getTicketTypeConfig } = require("./tickets");

const PANEL_CATEGORY_NAME = "❖› TICKETS";
const PANEL_LAYOUT = Object.freeze([
  {
    type: "support",
    channelName: "open-support-ticket",
    aliases: ["open-a-ticket", "support-ticket", "ticket-support"],
    color: 0x57f287,
    style: ButtonStyle.Primary
  },
  {
    type: "middleman",
    channelName: "open-middleman-ticket",
    aliases: ["middleman-ticket", "ticket-middleman", "open-mm-ticket", "open-middleman-ticket"],
    color: 0x3b82f6,
    style: ButtonStyle.Secondary
  },
  {
    type: "service",
    channelName: "open-service-ticket",
    aliases: ["service-ticket", "ticket-service", "open-service-ticket"],
    color: 0x5865f2,
    style: ButtonStyle.Secondary
  },
  {
    type: "index",
    channelName: "open-index-ticket",
    aliases: ["index-ticket", "ticket-index"],
    color: 0x3498db,
    style: ButtonStyle.Success
  },
  {
    type: "role",
    channelName: "open-role-request",
    aliases: ["role-request", "ticket-role-request"],
    color: 0xf1c40f,
    style: ButtonStyle.Primary
  },
  {
    type: "report",
    channelName: "open-report-ticket",
    aliases: ["report-ticket", "ticket-report"],
    color: 0xe67e22,
    style: ButtonStyle.Danger
  },
  {
    type: "host",
    channelName: "open-host-giveaway-ticket",
    aliases: ["host-giveaway-ticket", "ticket-host-giveaway"],
    color: 0x9b59b6,
    style: ButtonStyle.Secondary
  }
]);

const ENFORCED_PANEL_CHANNEL_IDS_BY_GUILD = Object.freeze({
  "1479255758561480906": {
    support: "1480002919737589861",
    middleman: "1506055902048944360",
    service: "1505526246623150180",
    index: "1505526250763190486",
    role: "1505526254458372226",
    report: "1505604766468804814",
    host: "1505604770805579957"
  }
});
const NEVER_AUTO_CREATE_PANEL_TYPES = new Set(["support", "middleman", "service", "index", "role", "report", "host"]);
const PANEL_FALLBACK_ALIASES_BY_TYPE = Object.freeze({
  support: ["open support ticket", "open-support-ticket"],
  middleman: ["middleman", "open middleman ticket", "open-middleman-ticket"],
  service: ["service", "open service ticket", "open-service-ticket"],
  index: ["open index ticket", "open-index-ticket"],
  role: ["open role request", "open-role-request"],
  report: ["reports", "report", "open report ticket", "open-report-ticket"],
  host: ["host giveaway", "host-giveaway", "open host giveaway ticket", "open-host-giveaway-ticket"]
});

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTargetGuildIds() {
  if (
    Array.isArray(config.autoTicketPanelGuildIds) &&
    config.autoTicketPanelGuildIds.length > 0
  ) {
    return config.autoTicketPanelGuildIds.map((entry) => String(entry));
  }
  if (config.guildId) {
    return [String(config.guildId)];
  }
  return [];
}

function findCategory(guild, categoryName) {
  const categoryNorm = normalizeName(categoryName);
  return (
    guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        normalizeName(channel.name) === categoryNorm
    ) || null
  );
}

function findPanelChannel(guild, categoryId, targetName, aliases = [], usedIds = new Set()) {
  const channelNorm = normalizeName(targetName);
  const aliasNorm = new Set([targetName, ...(aliases || [])].map((entry) => normalizeName(entry)));
  return (
    guild.channels.cache.find((channel) => {
      if (channel.type !== ChannelType.GuildText) {
        return false;
      }
      if (usedIds.has(String(channel.id))) {
        return false;
      }
      const normalized = normalizeName(channel.name);
      if (String(channel.parentId || "") === String(categoryId || "")) {
        return normalized === channelNorm || aliasNorm.has(normalized);
      }
      return normalized === channelNorm;
    }) || null
  );
}

async function findPreferredPanelChannel(guild, preferredChannelId, usedIds = new Set()) {
  const channelId = String(preferredChannelId || "").trim();
  if (!channelId) {
    return null;
  }
  if (usedIds.has(channelId)) {
    return null;
  }
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildText) {
    return null;
  }
  return channel;
}

function getPanelChannelSettingKey(ticketType) {
  switch (String(ticketType || "").toLowerCase()) {
    case "support":
      return "supportTicketPanelChannelId";
    case "middleman":
      return "middlemanTicketPanelChannelId";
    case "service":
      return "serviceTicketPanelChannelId";
    case "index":
      return "indexTicketPanelChannelId";
    case "role":
      return "roleRequestTicketPanelChannelId";
    case "report":
      return "reportTicketPanelChannelId";
    case "host":
      return "hostGiveawayTicketPanelChannelId";
    default:
      return null;
  }
}

function getEnforcedPanelChannelId(guildId, ticketType) {
  const guildMap =
    ENFORCED_PANEL_CHANNEL_IDS_BY_GUILD[String(guildId || "").trim()] || null;
  const value = String(guildMap?.[String(ticketType || "").trim()] || "").trim();
  return value || null;
}

function buildPanelEmbed(ticketType, buttonLabel, color) {
  const titleMap = {
    support: "🎫 Support Ticket",
    middleman: "💱 Middleman Ticket",
    service: "🤝 Service Ticket",
    index: "📊 Index Ticket",
    role: "🏷 Role Request Ticket",
    report: "📝 Report Ticket",
    host: "👥 Host Giveaway Ticket"
  };
  const textMap = {
    support:
      "Need staff help? Open a support ticket and explain your issue clearly so the team can assist fast.",
    middleman:
      "Need secure trading help? Open a middleman ticket and wait for MM staff.",
    service:
      "Need Blox Fruits services? Open a service ticket and wait for service staff.",
    index:
      "Need indexing help? Open an index ticket and share what you need reviewed.",
    role:
      "Need a role request review? Open a role request ticket and provide all needed details.",
    report:
      "Need to report a problem or user? Open a report ticket and include full proof and details.",
    host:
      "Want to host a giveaway? Open a host giveaway ticket and include your giveaway details."
  };

  return new EmbedBuilder()
    .setColor(color || 0x2b2d31)
    .setTitle(titleMap[ticketType] || "🎫 Ticket")
    .setDescription(textMap[ticketType] || "Open a ticket below.")
    .setFooter({ text: "One open ticket per type per user" });
}

function buildPanelRow(ticketType, buttonLabel, style) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_open_${ticketType}`)
      .setLabel(String(buttonLabel || "Open Ticket").slice(0, 80))
      .setStyle(style || ButtonStyle.Primary)
  );
}

function collectTicketStaffRoleIds(settings) {
  const sets = [
    settings.supportTeamRoleIds,
    settings.middlemanTeamRoleIds,
    settings.serviceTeamRoleIds,
    settings.indexTeamRoleIds,
    settings.roleRequestTeamRoleIds,
    settings.reportTeamRoleIds,
    settings.reportHandlerRoleIds,
    settings.hostGiveawayTeamRoleIds,
    settings.hostGiveawayRoleIds,
    settings.giveawayHostRoleId ? [settings.giveawayHostRoleId] : [],
    settings.fullCommandRoleIds,
    settings.ticketForceClaimRoleIds
  ];
  return Array.from(
    new Set(
      sets
        .flatMap((entry) => (Array.isArray(entry) ? entry : []))
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
}

async function applyPanelChannelPermissions(channel, settings, clientUserId) {
  const staffRoleIds = collectTicketStaffRoleIds(settings);
  const baseOverwrites = [
    {
      id: channel.guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads
      ]
    },
    {
      id: clientUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels
      ]
    }
  ];

  for (const roleId of staffRoleIds) {
    baseOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  await channel.permissionOverwrites.set(baseOverwrites, "Auto ticket panel permission sync");
}

async function upsertPanelMessage(channel, panelType, buttonLabel, color, style, clientUserId) {
  const customId = `ticket_open_${panelType}`;
  const row = buildPanelRow(panelType, buttonLabel, style);
  const embed = buildPanelEmbed(panelType, buttonLabel, color);

  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (recent) {
    const existing = recent.find(
      (message) =>
        String(message.author?.id || "") === String(clientUserId) &&
        message.components?.some((r) =>
          r.components?.some((button) => button.customId === customId)
        )
    );
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] }).catch(() => null);
      return { created: false, updated: true };
    }
  }

  await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  return { created: true, updated: false };
}

async function applyTicketPanelPlacementToGuild(guild, clientUserId) {
  if (!guild || !clientUserId) {
    return { changed: 0, failed: 0, skipped: 0, details: [] };
  }

  const details = [];
  let changed = 0;
  let failed = 0;
  let skipped = 0;
  const usedChannelIds = new Set();

  await guild.channels.fetch().catch(() => null);
  const settings = getGuildSettingsSync(guild.id);
  const ticketTypeConfig = getTicketTypeConfig(guild.id);

  let category = findCategory(guild, PANEL_CATEGORY_NAME);
  if (!category) {
    category = await guild.channels
      .create({
        name: PANEL_CATEGORY_NAME,
        type: ChannelType.GuildCategory
      })
      .catch(() => null);
    if (!category) {
      return {
        changed,
        failed: failed + 1,
        skipped,
        details: ["[FAIL] Could not create ticket panel category"]
      };
    }
    changed += 1;
    details.push(`[OK] Created category: ${PANEL_CATEGORY_NAME}`);
  } else {
    skipped += 1;
    details.push(`[SKIP] Category exists: ${PANEL_CATEGORY_NAME}`);
  }

  for (let index = 0; index < PANEL_LAYOUT.length; index += 1) {
    const layout = PANEL_LAYOUT[index];
    const typeConfig = ticketTypeConfig[layout.type];
    if (!typeConfig || typeConfig.enabled === false) {
      skipped += 1;
      details.push(`[SKIP] ${layout.type} panel disabled`);
      continue;
    }

    const panelChannelSettingKey = getPanelChannelSettingKey(layout.type);
    const configuredPanelChannelId = panelChannelSettingKey
      ? settings[panelChannelSettingKey]
      : null;
    const enforcedPanelChannelId = getEnforcedPanelChannelId(guild.id, layout.type);
    const preferredPanelChannelId = enforcedPanelChannelId || configuredPanelChannelId;
    const mustUsePreferredChannel = Boolean(enforcedPanelChannelId);
    let channel = await findPreferredPanelChannel(
      guild,
      preferredPanelChannelId,
      usedChannelIds
    );

    let usingPreferredChannel = false;
    if (channel) {
      usingPreferredChannel = true;
      usedChannelIds.add(String(channel.id));
      details.push(
        `[OK] Using configured ${layout.type} panel channel: ${channel.name} (${channel.id})`
      );
    }

    if (!channel) {
      const extraAliases = PANEL_FALLBACK_ALIASES_BY_TYPE[layout.type] || [];
      channel = findPanelChannel(
        guild,
        category.id,
        layout.channelName,
        [...(layout.aliases || []), ...extraAliases],
        usedChannelIds
      );

      if (!channel && mustUsePreferredChannel) {
        failed += 1;
        details.push(
          `[FAIL] ${layout.type} panel channel (${preferredPanelChannelId}) not found. Skipped creating duplicate.`
        );
        continue;
      }
    }

    if (!channel) {
      if (NEVER_AUTO_CREATE_PANEL_TYPES.has(layout.type)) {
        const configuredHint = preferredPanelChannelId
          ? `configured channel ${preferredPanelChannelId}`
          : "configured panel channel";
        failed += 1;
        details.push(
          `[FAIL] ${layout.type} panel not found from ${configuredHint}. Auto-create is disabled for this panel type.`
        );
        continue;
      }

      channel = await guild.channels
        .create({
          name: layout.channelName,
          type: ChannelType.GuildText,
          parent: category.id,
          position: index
        })
        .catch(() => null);
      if (!channel) {
        failed += 1;
        details.push(`[FAIL] Could not create channel: ${layout.channelName}`);
        continue;
      }
      changed += 1;
      details.push(`[OK] Created panel channel: ${layout.channelName}`);
    } else {
      usedChannelIds.add(String(channel.id));
      let localChanged = false;
      if (!usingPreferredChannel && String(channel.parentId || "") !== String(category.id)) {
        const moved = await channel
          .setParent(category.id, { lockPermissions: false })
          .then(() => true)
          .catch(() => false);
        localChanged = localChanged || moved;
      }
      if (!usingPreferredChannel && channel.name !== layout.channelName) {
        const renamed = await channel
          .setName(layout.channelName, "Auto ticket panel layout sync")
          .then(() => true)
          .catch(() => false);
        localChanged = localChanged || renamed;
      }
      if (!usingPreferredChannel) {
        await channel.setPosition(index).catch(() => null);
      }
      if (localChanged) {
        changed += 1;
        details.push(`[OK] Updated panel channel: ${layout.channelName}`);
      } else {
        skipped += 1;
        details.push(`[SKIP] Panel channel already aligned: ${layout.channelName}`);
      }
    }

    await applyPanelChannelPermissions(channel, settings, clientUserId).catch(() => null);
    const panelMessageResult = await upsertPanelMessage(
      channel,
      layout.type,
      typeConfig.buttonLabel,
      layout.color,
      layout.style,
      clientUserId
    ).catch(() => ({ created: false, updated: false, failed: true }));

    if (panelMessageResult.failed) {
      failed += 1;
      details.push(`[FAIL] Could not post/update ${layout.type} panel message`);
      continue;
    }
    if (panelMessageResult.created || panelMessageResult.updated) {
      changed += 1;
      details.push(`[OK] ${layout.type} panel message synced`);
    } else {
      skipped += 1;
      details.push(`[SKIP] ${layout.type} panel message unchanged`);
    }
  }

  return { changed, failed, skipped, details };
}

async function syncTicketPanelPlacementForConfiguredGuilds(client) {
  if (!config.autoTicketPanelPlacementEnabled) {
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

    const outcome = await applyTicketPanelPlacementToGuild(guild, client.user?.id);
    results.push({
      guildId: guild.id,
      ...outcome
    });
  }

  return { skipped: false, results };
}

module.exports = {
  PANEL_CATEGORY_NAME,
  PANEL_LAYOUT,
  syncTicketPanelPlacementForConfiguredGuilds
};
