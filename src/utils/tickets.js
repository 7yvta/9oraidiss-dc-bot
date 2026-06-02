const { getGuildSettingsSync } = require("./guildSettings");

const MAIN_GUILD_ID = "1479255758561480906";
const DEFAULT_TRANSCRIPT_LOG_CHANNEL_ID = "1499962658051326022";

const DEFAULT_TICKET_REGISTRY = Object.freeze({
  support: {
    label: "Support Ticket",
    buttonLabel: "Request Support",
    panelChannelId: "1480002919737589861",
    categoryId: "1489735635253071872",
    teamRoleIds: ["1479264429383225520"]
  },
  middleman: {
    label: "Middleman Ticket",
    buttonLabel: "Request MM Team",
    panelChannelId: "1506055902048944360",
    categoryId: "1489735694283833455",
    teamRoleIds: ["1499837044237537460"]
  },
  index: {
    label: "Index Ticket",
    buttonLabel: "Index Request",
    panelChannelId: "1505526250763190486",
    categoryId: "1489735769340903524",
    teamRoleIds: ["1483634346333311160"]
  },
  role: {
    label: "Role Request Ticket",
    buttonLabel: "Role Request",
    panelChannelId: "1505526254458372226",
    categoryId: "1499146688072519780",
    teamRoleIds: ["1493298416363765941"]
  },
  report: {
    label: "Report Ticket",
    buttonLabel: "Open Report Ticket",
    panelChannelId: "1505604766468804814",
    categoryId: "1505582476544704693",
    teamRoleIds: ["1479264180866388089", "1479263836778532934", "1483555926492451118"]
  },
  host: {
    label: "Host Giveaway Ticket",
    buttonLabel: "Open Host Giveaway Ticket",
    panelChannelId: "1505604770805579957",
    categoryId: "1505582187112697898",
    teamRoleIds: ["1481709821844520970"]
  }
});

const ENFORCED_TICKET_CATEGORIES_BY_GUILD = Object.freeze({
  "1479255758561480906": {
    support: "1489735635253071872",
    middleman: "1489735694283833455",
    index: "1489735769340903524",
    role: "1499146688072519780",
    report: "1505582476544704693",
    host: "1505582187112697898"
  }
});

const ENFORCED_TICKET_PANELS_BY_GUILD = Object.freeze({
  "1479255758561480906": Object.fromEntries(
    Object.entries(DEFAULT_TICKET_REGISTRY).map(([key, value]) => [
      key,
      value.panelChannelId
    ])
  )
});

function normalizeRoleIds(roleIds) {
  return [...new Set(
    (Array.isArray(roleIds) ? roleIds : [])
      .map((roleId) => String(roleId || "").trim())
      .filter(Boolean)
  )];
}

function resolveTicketCategoryId(guildId, typeKey, configuredCategoryId, fallbackCategoryId) {
  const configured = String(configuredCategoryId || "").trim();
  if (configured) {
    return configured;
  }

  const guildOverrides =
    ENFORCED_TICKET_CATEGORIES_BY_GUILD[String(guildId || "").trim()] || null;
  const enforced = String(guildOverrides?.[String(typeKey || "").trim()] || "").trim();
  if (enforced) {
    return enforced;
  }

  return String(fallbackCategoryId || "").trim() || null;
}

function resolveTicketPanelChannelId(guildId, typeKey, configuredPanelChannelId) {
  const configured = String(configuredPanelChannelId || "").trim();
  if (configured) {
    return configured;
  }

  const guildOverrides =
    ENFORCED_TICKET_PANELS_BY_GUILD[String(guildId || "").trim()] || null;
  const enforced = String(guildOverrides?.[String(typeKey || "").trim()] || "").trim();
  if (enforced) {
    return enforced;
  }
  return String(DEFAULT_TICKET_REGISTRY[typeKey]?.panelChannelId || "").trim() || null;
}

function resolveTicketTeamRoleIds(typeKey, settings) {
  const key = String(typeKey || "").toLowerCase();
  const defaults = DEFAULT_TICKET_REGISTRY[key]?.teamRoleIds || [];
  const map = {
    support: settings.supportTeamRoleIds,
    middleman: settings.middlemanTeamRoleIds,
    index: settings.indexTeamRoleIds,
    role: settings.roleRequestTeamRoleIds,
    report:
      Array.isArray(settings.reportTeamRoleIds) && settings.reportTeamRoleIds.length > 0
        ? settings.reportTeamRoleIds
        : settings.reportHandlerRoleIds,
    host:
      Array.isArray(settings.hostGiveawayTeamRoleIds) &&
      settings.hostGiveawayTeamRoleIds.length > 0
        ? settings.hostGiveawayTeamRoleIds
        : settings.hostGiveawayRoleIds || (settings.giveawayHostRoleId ? [settings.giveawayHostRoleId] : [])
  };

  if (String(settings?.[`${key}TicketRoleId`] || "").trim()) {
    return [String(settings[`${key}TicketRoleId`]).trim()];
  }

  const configured = normalizeRoleIds(map[key]);
  if (configured.length > 0) {
    return configured;
  }
  return normalizeRoleIds(defaults);
}

function getTicketTypeOverride(typeKey, settings) {
  const types = settings.ticketTypes;
  if (!types || typeof types !== "object") {
    return null;
  }
  const entry = types[typeKey];
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return entry;
}

function normalizeTicketIntroLineBreaks(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function getStyledDefaultIntroMessage(typeKey) {
  switch (String(typeKey || "").toLowerCase()) {
    case "middleman":
      return `{user}, Thank you for using our middleman service.

Please wait for a middleman to assist you.

If you have any questions, please let a staff member know.`;
    case "support":
      return `{user}, Thank you for contacting support.

Please wait for a support member to assist you.

If you have any questions, please let a staff member know.`;
    case "index":
      return `{user}, Thank you for using our index team.

One of our team members will help you soon.

If you have any questions, please let a staff member know.`;
    case "role":
      return `{user}, Thank you for your role request.

Please wait for a staff member to review your request.

If you have any questions, please let a staff member know.`;
    case "report":
      return `{user}, Thank you for opening a report ticket.

Please send full proof and details so staff can review quickly.

One report staff member will assist you soon.`;
    case "host":
      return `{user}, Thank you for requesting a giveaway host ticket.

A giveaway host team member will review your request soon.

Please include your giveaway details and requirements.`;
    default:
      return `{user}, Thank you for opening a ticket.

Please wait for a staff member to assist you.`;
  }
}

function isLegacyDefaultIntro(typeKey, introMessage) {
  const normalized = normalizeTicketIntroLineBreaks(introMessage)
    .toLowerCase()
    .replace(/\s+/g, " ");
  const key = String(typeKey || "").toLowerCase();
  if (!normalized) {
    return false;
  }

  if (key === "middleman") {
    return (
      normalized.includes("middleman system") ||
      normalized.includes("need a safe trade? open a ticket below.") ||
      normalized.includes("a trusted middleman will assist you.")
    );
  }

  if (key === "support") {
    return (
      normalized.includes("support ticket") ||
      normalized.includes("please describe your issue clearly.")
    );
  }

  if (key === "index") {
    return (
      normalized.includes("base index system") ||
      normalized.includes("want your base to be indexed?") ||
      normalized.includes("want your base to be colored ?")
    );
  }

  if (key === "role") {
    return (
      normalized.includes("role request ticket") ||
      normalized.includes("please send your role request clearly.")
    );
  }

  return false;
}

function getTicketTypeConfig(guildId) {
  const settings = getGuildSettingsSync(guildId);
  const defaultTypes = Object.fromEntries(
    Object.entries(DEFAULT_TICKET_REGISTRY).map(([key, value]) => [
      key,
      {
        buttonLabel: value.buttonLabel,
        introMessage: getStyledDefaultIntroMessage(key)
      }
    ])
  );

  function resolveType(typeKey) {
    const override = getTicketTypeOverride(typeKey, settings) || {};
    const defaults = defaultTypes[typeKey] || {};
    const overrideButton = String(override.buttonLabel || "").trim();
    const overrideIntro = String(override.introMessage || "").trim();
    const introFromOverride = overrideIntro && !isLegacyDefaultIntro(typeKey, overrideIntro);
    const isLegacyMiddlemanButton =
      String(typeKey || "").toLowerCase() === "middleman" &&
      /middleman/i.test(overrideButton);
    const resolvedButton = isLegacyMiddlemanButton
      ? String(defaults.buttonLabel || "").trim()
      : overrideButton;
    const resolvedIntro = introFromOverride
      ? overrideIntro
      : defaults.introMessage || `${typeKey} ticket`;
    return {
      enabled: override.enabled !== false,
      buttonLabel:
        String(resolvedButton || defaults.buttonLabel || "").trim() ||
        defaults.buttonLabel ||
        typeKey,
      introMessage: normalizeTicketIntroLineBreaks(resolvedIntro)
    };
  }

  const supportResolved = resolveType("support");
  const middlemanResolved = resolveType("middleman");
  const indexResolved = resolveType("index");
  const roleResolved = resolveType("role");
  const reportResolved = resolveType("report");
  const hostResolved = resolveType("host");

  return {
    support: {
      key: "support",
      label: DEFAULT_TICKET_REGISTRY.support.label,
      enabled: supportResolved.enabled,
      buttonLabel: supportResolved.buttonLabel,
      panelChannelId: resolveTicketPanelChannelId(guildId, "support", settings.supportTicketPanelChannelId),
      categoryId: resolveTicketCategoryId(guildId, "support", settings.supportTicketCategoryId, null),
      teamRoleIds: resolveTicketTeamRoleIds("support", settings),
      transcriptLogChannelId: settings.ticketTranscriptLogId || DEFAULT_TRANSCRIPT_LOG_CHANNEL_ID,
      introMessage: supportResolved.introMessage
    },
    middleman: {
      key: "middleman",
      label: DEFAULT_TICKET_REGISTRY.middleman.label,
      enabled: middlemanResolved.enabled,
      buttonLabel: middlemanResolved.buttonLabel,
      panelChannelId: resolveTicketPanelChannelId(guildId, "middleman", settings.middlemanTicketPanelChannelId),
      categoryId: resolveTicketCategoryId(
        guildId,
        "middleman",
        settings.middlemanTicketCategoryId,
        settings.supportTicketCategoryId
      ),
      teamRoleIds: resolveTicketTeamRoleIds("middleman", settings),
      transcriptLogChannelId: settings.ticketTranscriptLogId || DEFAULT_TRANSCRIPT_LOG_CHANNEL_ID,
      introMessage: middlemanResolved.introMessage
    },
    index: {
      key: "index",
      label: DEFAULT_TICKET_REGISTRY.index.label,
      enabled: indexResolved.enabled,
      buttonLabel: indexResolved.buttonLabel,
      panelChannelId: resolveTicketPanelChannelId(guildId, "index", settings.indexTicketPanelChannelId),
      categoryId: resolveTicketCategoryId(guildId, "index", settings.indexTicketCategoryId, null),
      teamRoleIds: resolveTicketTeamRoleIds("index", settings),
      transcriptLogChannelId: settings.ticketTranscriptLogId || DEFAULT_TRANSCRIPT_LOG_CHANNEL_ID,
      introMessage: indexResolved.introMessage
    },
    role: {
      key: "role",
      label: DEFAULT_TICKET_REGISTRY.role.label,
      enabled: roleResolved.enabled,
      buttonLabel: roleResolved.buttonLabel,
      panelChannelId: resolveTicketPanelChannelId(guildId, "role", settings.roleRequestTicketPanelChannelId),
      categoryId: resolveTicketCategoryId(guildId, "role", settings.roleRequestTicketCategoryId, null),
      teamRoleIds: resolveTicketTeamRoleIds("role", settings),
      transcriptLogChannelId: settings.ticketTranscriptLogId || DEFAULT_TRANSCRIPT_LOG_CHANNEL_ID,
      introMessage: roleResolved.introMessage
    },
    report: {
      key: "report",
      label: DEFAULT_TICKET_REGISTRY.report.label,
      enabled: reportResolved.enabled,
      buttonLabel: reportResolved.buttonLabel,
      panelChannelId: resolveTicketPanelChannelId(guildId, "report", settings.reportTicketPanelChannelId),
      categoryId: resolveTicketCategoryId(
        guildId,
        "report",
        settings.reportTicketCategoryId,
        settings.supportTicketCategoryId
      ),
      teamRoleIds: resolveTicketTeamRoleIds("report", settings),
      transcriptLogChannelId: settings.ticketTranscriptLogId || DEFAULT_TRANSCRIPT_LOG_CHANNEL_ID,
      introMessage: reportResolved.introMessage
    },
    host: {
      key: "host",
      label: DEFAULT_TICKET_REGISTRY.host.label,
      enabled: hostResolved.enabled,
      buttonLabel: hostResolved.buttonLabel,
      panelChannelId: resolveTicketPanelChannelId(guildId, "host", settings.hostGiveawayTicketPanelChannelId),
      categoryId: resolveTicketCategoryId(
        guildId,
        "host",
        settings.hostGiveawayTicketCategoryId,
        settings.supportTicketCategoryId
      ),
      teamRoleIds: resolveTicketTeamRoleIds("host", settings),
      transcriptLogChannelId: settings.ticketTranscriptLogId || DEFAULT_TRANSCRIPT_LOG_CHANNEL_ID,
      introMessage: hostResolved.introMessage
    }
  };
}

function getTicketTeamRoleIds(ticketType, guildId) {
  const config = getTicketTypeConfig(guildId);
  return normalizeRoleIds(config[String(ticketType || "").toLowerCase()]?.teamRoleIds || []);
}

function getTicketCategoryMap(guildId) {
  const config = getTicketTypeConfig(guildId);
  const map = new Map();
  for (const [type, entry] of Object.entries(config)) {
    const categoryId = String(entry?.categoryId || "").trim();
    if (!categoryId) {
      continue;
    }
    const existing = map.get(categoryId);
    map.set(categoryId, existing && existing !== type ? "__ambiguous__" : type);
  }
  return map;
}

function getTicketTypeFromCustomId(customId, guildId) {
  const prefix = "ticket_open_";
  if (!customId.startsWith(prefix)) {
    return null;
  }
  const type = customId.slice(prefix.length);
  const ticketTypeConfig = getTicketTypeConfig(guildId);
  return ticketTypeConfig[type] || null;
}

module.exports = {
  DEFAULT_TICKET_REGISTRY,
  DEFAULT_TRANSCRIPT_LOG_CHANNEL_ID,
  MAIN_GUILD_ID,
  getTicketCategoryMap,
  getTicketTeamRoleIds,
  getTicketTypeConfig,
  getTicketTypeFromCustomId
};

