const {
  Events,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalSubmitInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const { setTimeout: delay } = require("node:timers/promises");
const config = require("../config");
const { canUseCommand, canHandleTicket } = require("../utils/accessControl");
const { hasRecentAction, markRecentAction, clearRecentAction } = require("../utils/actionDeduper");
const {
  getTrade,
  markConfirmed,
  isFullyConfirmed,
  buildTradeEmbed,
  buildTradeButtons
} = require("../utils/tradeConfirmationStore");
const {
  getTicketTypeFromCustomId,
  getTicketTypeConfig,
  getTicketTeamRoleIds: getUnifiedTicketTeamRoleIds
} = require("../utils/tickets");
const { resolveTicketContext, buildTicketTopic } = require("../utils/ticketMeta");
const {
  buildTicketControlsRow,
  buildTicketOpenEmbed,
  buildTicketEventEmbed,
  updateTicketControlMessage
} = require("../utils/ticketUi");
const { buildLogEmbed, buildResultEmbed, sendLogToChannel, sendTicketLog } = require("../utils/logger");
const { createTicketTranscriptAttachment } = require("../utils/ticketTranscript");
const { getGuildSettingsSync } = require("../utils/guildSettings");
const {
  trackTicketOpened,
  trackTicketClaimed,
  trackTicketClosed
} = require("../utils/ticketAnalyticsStore");
const { createRoleApplication, updateRoleApplication } = require("../utils/roleApplicationStore");
const { readRoleAppSettings } = require("../utils/roleApplicationStore");
const {
  canReviewAppeal,
  buildAppealReviewComponents,
  processAppealDecision
} = require("../utils/appealReview");
const {
  startSelectedApplicationFlow,
  handleApplicationReviewDecision
} = require("../commands/utility/apply");
const { triggerSubmittedVouch } = require("../utils/autoVouchScheduler");
const { runOnce } = require("../utils/idempotency");
const { checkCooldown, formatRetryAfter, parseCooldownMs } = require("../utils/cooldowns");

const SERVICE_TICKET_CATEGORY_NAME = "service tickets";
const VOUCH_SUBMIT_BUTTON_ID = "vouch_submit_open";
const VOUCH_SUBMIT_MODAL_ID = "vouch_submit_modal";
const processedInteractionIds = new Map();
const INTERACTION_PROCESS_TTL_MS = 2 * 60 * 1000;
const SLASH_COMMAND_COOLDOWN_MS = parseCooldownMs(
  process.env.SLASH_COMMAND_COOLDOWN_MS,
  3000
);

function isInteractionAlreadyAcknowledged(error) {
  const code = error?.code ?? error?.rawError?.code ?? error?.data?.code;
  return code === 40060;
}

function stripFlagsForEditReply(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "flags")) {
    return payload;
  }
  const clone = { ...payload };
  delete clone.flags;
  return clone;
}

function shouldSkipProcessedInteraction(interactionId) {
  const normalizedId = String(interactionId || "").trim();
  if (!normalizedId) {
    return false;
  }

  const now = Date.now();
  const seenAt = processedInteractionIds.get(normalizedId);
  if (seenAt && now - seenAt < INTERACTION_PROCESS_TTL_MS) {
    return true;
  }

  processedInteractionIds.set(normalizedId, now);
  for (const [cachedId, cachedAt] of processedInteractionIds) {
    if (now - cachedAt > INTERACTION_PROCESS_TTL_MS) {
      processedInteractionIds.delete(cachedId);
    }
  }

  return false;
}

function formatTicketName(type, username) {
  const displayType = String(type || "").toLowerCase();
  const clean = username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 18);
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `${displayType}-${clean || "user"}-${suffix}`;
}

function parseUserIdFromInput(rawInput) {
  const input = String(rawInput || "").trim();
  if (!input) {
    return null;
  }
  const mentionMatch = input.match(/^<@!?(\d{17,20})>$/);
  if (mentionMatch?.[1]) {
    return mentionMatch[1];
  }
  if (/^\d{17,20}$/.test(input)) {
    return input;
  }
  return null;
}

function getMemberSearchScore(member, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!member || !normalizedQuery) {
    return 0;
  }

  const displayName = String(member.displayName || "").toLowerCase();
  const username = String(member.user?.username || "").toLowerCase();
  const tag = String(member.user?.tag || "").toLowerCase();
  const id = String(member.id || "").toLowerCase();

  if (id === normalizedQuery) {
    return 1000;
  }
  if (tag === normalizedQuery) {
    return 950;
  }
  if (displayName === normalizedQuery) {
    return 900;
  }
  if (username === normalizedQuery) {
    return 850;
  }
  if (displayName.startsWith(normalizedQuery)) {
    return 800;
  }
  if (username.startsWith(normalizedQuery)) {
    return 780;
  }
  if (displayName.includes(normalizedQuery)) {
    return 700;
  }
  if (username.includes(normalizedQuery)) {
    return 680;
  }
  return 0;
}

async function resolveMemberFromInput(guild, rawInput) {
  const query = String(rawInput || "").trim().replace(/^@+/, "");
  if (!guild || !query) {
    return null;
  }

  const parsedId = parseUserIdFromInput(query);
  if (parsedId) {
    return guild.members.fetch(parsedId).catch(() => null);
  }

  const cachedMatches = guild.members.cache
    .map((member) => ({ member, score: getMemberSearchScore(member, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  if (cachedMatches.length > 0) {
    return cachedMatches[0].member;
  }

  const fetched = await guild.members.fetch({ query, limit: 25 }).catch(() => null);
  if (!fetched || fetched.size === 0) {
    return null;
  }

  const fetchedMatches = [...fetched.values()]
    .map((member) => ({ member, score: getMemberSearchScore(member, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return fetchedMatches[0]?.member || null;
}

function buildTicketOverwrites(interaction, ownerId, teamRoleIds) {
  const overwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: ownerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  for (const roleId of teamRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }
  return overwrites;
}

function getTicketTeamRoleIds(ticketType, guildId) {
  return getUnifiedTicketTeamRoleIds(ticketType, guildId);
}

function resolveForcedTicketTypeFromPanelChannel(interaction) {
  const guildId = String(interaction?.guildId || "").trim();
  const channelId = String(interaction?.channelId || "").trim();
  if (!guildId || !channelId) {
    return null;
  }

  const panelChannelMap = Object.fromEntries(
    Object.entries(getTicketTypeConfig(guildId)).map(([type, entry]) => [
      type,
      String(entry?.panelChannelId || "").trim()
    ])
  );

  const forcedTypeKey = Object.entries(panelChannelMap).find(
    ([, mappedChannelId]) => mappedChannelId && mappedChannelId === channelId
  )?.[0];

  if (!forcedTypeKey) {
    return null;
  }

  const ticketTypeConfig = getTicketTypeConfig(guildId);
  return ticketTypeConfig[forcedTypeKey] || null;
}

function resolveTicketTypeFromPanelMessage(interaction) {
  const guildId = String(interaction?.guildId || "").trim();
  if (!guildId) {
    return null;
  }

  const embedText = [
    interaction.message?.embeds?.[0]?.title,
    interaction.message?.embeds?.[0]?.description,
    ...(interaction.message?.components || []).flatMap((row) =>
      (row.components || []).map((component) => component.label)
    )
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const typeHints = [
    ["middleman", ["middleman", "mm ticket", "request mm"]],
    ["service", ["service ticket", "service team", "blox fruit service"]],
    ["support", ["support ticket", "contacting support"]],
    ["index", ["index ticket", "index service"]],
    ["role", ["role request", "role ticket"]],
    ["report", ["report ticket"]],
    ["host", ["host giveaway", "giveaway host"]]
  ];

  const forcedTypeKey = typeHints.find(([, hints]) =>
    hints.some((hint) => embedText.includes(hint))
  )?.[0];

  if (!forcedTypeKey) {
    return null;
  }

  const ticketTypeConfig = getTicketTypeConfig(guildId);
  return ticketTypeConfig[forcedTypeKey] || null;
}

function getTicketTranscriptFooterText(ticketType) {
  const normalizedType = String(ticketType || "").toLowerCase();
  if (normalizedType === "middleman") {
    return "Powered by 9oraidiss Middleman Service";
  }
  if (normalizedType === "service") {
    return "Powered by 9oraidiss Service Team";
  }
  return "Powered by 9oraidiss Ticket Service";
}

async function ensureHiddenTicketCategory(category, guild) {
  if (!category || category.type !== ChannelType.GuildCategory) {
    return;
  }

  const everyoneRoleId = guild.roles?.everyone?.id;
  if (everyoneRoleId) {
    await category.permissionOverwrites
      .edit(
        everyoneRoleId,
        { ViewChannel: false },
        { reason: "Hide ticket category from public until ticket is opened" }
      )
      .catch(() => null);
  }

  await category.permissionOverwrites
    .edit(
      guild.client.user.id,
      { ViewChannel: true, ManageChannels: true, ReadMessageHistory: true },
      { reason: "Ensure bot can manage ticket category" }
    )
    .catch(() => null);
}

async function resolveTicketParentCategory(guild, ticketType, configuredCategoryId) {
  const configuredId = String(configuredCategoryId || "").trim();
  const normalizedType = String(ticketType || "").toLowerCase();

  if (normalizedType === "service") {
    if (configuredId) {
      const configuredCategory =
        guild.channels.cache.get(configuredId) ||
        (await guild.channels.fetch(configuredId).catch(() => null));
      if (configuredCategory?.type === ChannelType.GuildCategory) {
        await ensureHiddenTicketCategory(configuredCategory, guild);
        return configuredCategory.id;
      }
      return configuredId;
    }

    const normalizedTargetName = SERVICE_TICKET_CATEGORY_NAME.toLowerCase();
    let serviceCategory =
      guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildCategory &&
          String(channel.name || "").toLowerCase() === normalizedTargetName
      ) || null;

    if (!serviceCategory && configuredId) {
      const configuredCategory =
        guild.channels.cache.get(configuredId) ||
        (await guild.channels.fetch(configuredId).catch(() => null));
      if (configuredCategory?.type === ChannelType.GuildCategory) {
        serviceCategory = configuredCategory;
      }
    }

    if (!serviceCategory) {
      return null;
    }

    await ensureHiddenTicketCategory(serviceCategory, guild);
    return serviceCategory.id;
  }

  if (configuredId) {
    const configuredCategory =
      guild.channels.cache.get(configuredId) ||
      (await guild.channels.fetch(configuredId).catch(() => null));
    if (configuredCategory?.type === ChannelType.GuildCategory) {
      await ensureHiddenTicketCategory(configuredCategory, guild);
      return configuredCategory.id;
    }
  }
  return configuredId || null;
}

function isSameTicketForUser(channel, ownerId, ticketTypeKey) {
  if (!channel || !channel.topic) {
    return false;
  }
  return (
    channel.topic.includes(`ticket-owner:${ownerId}`) &&
    channel.topic.includes(`ticket-type:${ticketTypeKey}`)
  );
}

async function findExistingTicketChannel(guild, ownerId, ticketTypeKey) {
  await guild.channels.fetch().catch(() => null);
  return (
    guild.channels.cache.find((channel) =>
      isSameTicketForUser(channel, ownerId, ticketTypeKey)
    ) || null
  );
}

async function collapseDuplicateTickets(guild, ownerId, ticketTypeKey) {
  await guild.channels.fetch().catch(() => null);

  const matchingChannels = guild.channels.cache
    .filter((channel) => isSameTicketForUser(channel, ownerId, ticketTypeKey))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (matchingChannels.size <= 1) {
    return matchingChannels.first() || null;
  }

  const survivor = matchingChannels.first();
  for (const channel of matchingChannels.values()) {
    if (channel.id === survivor.id) {
      continue;
    }
    await channel.delete("Duplicate ticket auto-cleanup").catch(() => null);
  }

  return survivor;
}

async function handleTicketOpen(interaction, ticketType) {
  const ownerId = interaction.user.id;

  if (ticketType?.enabled === false) {
    await interaction.reply({
      content: "This ticket type is currently disabled.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const openKey = `${ticketType.key}:${ownerId}`;
  if (hasRecentAction("ticket_open", interaction.guild.id, openKey)) {
    await interaction.reply({
      content: "Ticket creation is already in progress. Please wait a moment.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  markRecentAction("ticket_open", interaction.guild.id, openKey, 15000);

  try {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (error) {
      if (!isInteractionAlreadyAcknowledged(error)) {
        console.error("Ticket open defer error:", error);
      }
    }

    const existingChannel = await findExistingTicketChannel(
      interaction.guild,
      ownerId,
      ticketType.key
    );

    if (existingChannel) {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `You already have an open ticket: ${existingChannel}`
        });
      } else {
        await interaction.reply({
          content: `You already have an open ticket: ${existingChannel}`,
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    const teamRoleIds = getTicketTeamRoleIds(ticketType.key, interaction.guild.id);

    const parentCategoryId = await resolveTicketParentCategory(
      interaction.guild,
      ticketType.key,
      ticketType.categoryId
    );

    const channel = await interaction.guild.channels.create({
      name: formatTicketName(ticketType.key, interaction.user.username),
      type: ChannelType.GuildText,
      parent: parentCategoryId || undefined,
      topic: buildTicketTopic({
        ownerId,
        ticketType: ticketType.key,
        claimedBy: null
      }),
      // Use resolved team role list to keep open/claim behavior consistent.
      permissionOverwrites: buildTicketOverwrites(
        interaction,
        ownerId,
        teamRoleIds
      )
    });

    const openEmbed = buildTicketOpenEmbed({
      ticketType: ticketType.key,
      openerId: interaction.user.id,
      introMessage: ticketType.introMessage
    });

    const roleMentions = teamRoleIds
      .map((roleId) => `<@&${roleId}>`)
      .join(" ");
    const openerMention = `<@${interaction.user.id}>`;
    const openContent = roleMentions || openerMention;

    await channel.send({
      content: openContent,
      embeds: [openEmbed],
      components: [buildTicketControlsRow({ ticketType: ticketType.key, claimed: false })]
    });

    const canonicalChannel = await collapseDuplicateTickets(
      interaction.guild,
      ownerId,
      ticketType.key
    );
    if (canonicalChannel && canonicalChannel.id !== channel.id) {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `You already have an open ticket: ${canonicalChannel}`
        });
      } else {
        await interaction.reply({
          content: `You already have an open ticket: ${canonicalChannel}`,
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    await trackTicketOpened({
      guildId: interaction.guild.id,
      channelId: channel.id,
      ownerId,
      ticketType: ticketType.key,
      openedAt: Date.now()
    }).catch(() => null);

    if (interaction.deferred) {
      await interaction.editReply({ content: `Ticket created: ${channel}` });
      return;
    }

    const payload = { content: `Ticket created: ${channel}`, flags: MessageFlags.Ephemeral };
    if (interaction.replied) {
      await interaction.followUp(payload);
      return;
    }

    await interaction.reply(payload);
  } finally {
    clearRecentAction("ticket_open", interaction.guild.id, openKey);
  }
}

async function handleTicketClaim(interaction) {
  const channel = interaction.channel;
  const context = resolveTicketContext(channel);
  if (!channel || !context?.ticketType) {
    await interaction.reply({
      content: "This button only works inside ticket channels.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const { ownerId, ticketType, claimedBy } = context;
  const isSupport = canHandleTicket(interaction.member, ticketType);
  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);

  if (!isSupport && !isAdmin) {
    await interaction.reply({
      content: "Only the assigned team can claim this ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (claimedBy && claimedBy !== interaction.user.id) {
    await interaction.reply({
      content: `This ticket is already claimed by <@${claimedBy}>.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (claimedBy === interaction.user.id) {
    await interaction.reply({
      content: "You already claimed this ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await channel.setTopic(
    buildTicketTopic({
      ownerId,
      ticketType,
      claimedBy: interaction.user.id
    }),
    "Ticket claimed by staff"
  );

  const teamRoleIds = getTicketTeamRoleIds(ticketType, interaction.guild.id);

  for (const roleId of teamRoleIds) {
    await channel.permissionOverwrites
      .edit(
        roleId,
        {
          ViewChannel: true,
          SendMessages: false,
          ReadMessageHistory: true
        },
        { reason: "Ticket claimed: team roles switched to watch-only" }
      )
      .catch(() => null);
  }

  await channel.permissionOverwrites
    .edit(
      interaction.user.id,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        ManageMessages: true
      },
      { reason: "Ticket claimer gets active response permissions" }
    )
    .catch(() => null);

  await updateTicketControlMessage(channel, { ticketType, claimed: true }).catch(() => null);

  await trackTicketClaimed({
    guildId: interaction.guild.id,
    channelId: channel.id,
    claimerId: interaction.user.id,
    claimedAt: Date.now()
  }).catch(() => null);

  await interaction.reply({
    embeds: [
      buildTicketEventEmbed({
        ticketType,
        color:
          ticketType === "middleman" || ticketType === "service"
            ? 0x57f287
            : undefined,
        title: "✅ Ticket Claimed",
        description:
          ticketType === "middleman"
            ? `${interaction.user} will be your middleman for today.`
            : ticketType === "service"
              ? `${interaction.user} will be your service staff for today.`
            : `${interaction.user} will handle this ticket now.`
      })
    ]
  });
}
async function handleTicketUnclaim(interaction) {
  const channel = interaction.channel;
  const context = resolveTicketContext(channel);
  if (!channel || !context?.ticketType) {
    await interaction.reply({
      content: "This button only works inside ticket channels.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const { ownerId, ticketType, claimedBy } = context;

  if (!claimedBy) {
    await interaction.reply({
      content: "This ticket is not claimed.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
  const isClaimer = claimedBy === interaction.user.id;
  const canForceUnclaim = canUseCommand(interaction.member, "forceclaim");

  if (!isClaimer && !isAdmin && !canForceUnclaim) {
    await interaction.reply({
      content: "Only the ticket claimer (or admin/forceclaim role) can unclaim this ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const teamRoleIds = getTicketTeamRoleIds(ticketType, interaction.guild.id);

  await channel.setTopic(
    buildTicketTopic({
      ownerId,
      ticketType,
      claimedBy: null
    }),
    "Ticket unclaimed"
  );

  for (const roleId of teamRoleIds) {
    await channel.permissionOverwrites
      .edit(
        roleId,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          ManageMessages: true
        },
        { reason: "Ticket unclaimed: staff roles restored" }
      )
      .catch(() => null);
  }

  await channel.permissionOverwrites
    .delete(claimedBy, { reason: "Ticket unclaimed: remove claimer override" })
    .catch(() => null);

  await updateTicketControlMessage(channel, { ticketType, claimed: false }).catch(() => null);

  await interaction.reply({
    embeds: [
      buildTicketEventEmbed({
        ticketType,
        title: "Unclaimed Ticket",
        description: "All assigned staff team members can now respond to the ticket."
      })
    ]
  });
}
async function handleTicketClose(interaction) {
  const channel = interaction.channel;
  const context = resolveTicketContext(channel);
  if (!channel || !context?.ticketType) {
    await interaction.reply({
      content: "This button only works inside ticket channels.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const { ownerId, ticketType, claimedBy } = context;
  const isOwner = ownerId === interaction.user.id;
  const isSupport = canHandleTicket(interaction.member, ticketType);
  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);

  if (!isOwner && !isSupport && !isAdmin) {
    await interaction.reply({
      content: "Only the ticket owner or support team can close this ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({
    embeds: [
      buildTicketEventEmbed({
        ticketType,
        title: "Closing Ticket",
        description: "This ticket will close in 5 seconds."
      })
    ]
  });

  await delay(5000);

  let transcriptAttachment = null;

  try {
    const transcript = await createTicketTranscriptAttachment(channel, {
      ownerId,
      ticketType,
      claimedBy,
      closedById: interaction.user.id
    });
    transcriptAttachment = transcript.attachment;
  } catch (error) {
    console.error("Ticket transcript generation failed:", error);
  }

  const closedAtUnix = Math.floor(Date.now() / 1000);
  const closeLogEmbed = buildLogEmbed({
    title: `Transcript for Ticket #${channel.name}`,
    color: 0x5865f2,
    footer: getTicketTranscriptFooterText(ticketType),
    fields: [
      { name: "Ticket Creator", value: ownerId ? `<@${ownerId}>` : "Unknown" },
      {
        name: "Claimed By",
        value: claimedBy ? `<@${claimedBy}>` : "Not claimed"
      },
      { name: "Closed By", value: `<@${interaction.user.id}>` },
      { name: "Closed At", value: `<t:${closedAtUnix}:F>` }
    ]
  });

  await trackTicketClosed({
    guildId: interaction.guild.id,
    channelId: channel.id,
    closedBy: interaction.user.id,
    closedAt: Date.now()
  }).catch(() => null);

  try {
    await channel.delete("Ticket closed");
  } catch (error) {
    console.error("Ticket close delete error:", error);
  }

  await sendTicketLog(
    interaction.guild,
    closeLogEmbed,
    transcriptAttachment ? { files: [transcriptAttachment] } : {}
  );
}

async function handleAppealReviewButton(interaction) {
  const [, action, appealId] = String(interaction.customId || "").split(":");
  if (!action || !appealId || !["approve", "reject"].includes(action)) {
    await interaction.reply({
      content: "Invalid appeal action.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!canReviewAppeal(interaction.member)) {
    await interaction.reply({
      content: "You are not allowed to review appeals.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const decision = await processAppealDecision({
    client: interaction.client,
    guild: interaction.guild,
    action,
    appealId,
    reviewerUser: interaction.user
  });

  if (!decision.ok) {
    const reasonText =
      decision.reason === "not_found"
        ? "Appeal not found."
        : decision.reason === "already_processed"
          ? `Appeal already processed (${decision.appeal?.status || "unknown"}).`
          : "Could not process appeal.";

    await interaction.reply({
      content: reasonText,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const sourceEmbed = interaction.message.embeds?.[0] || null;
  const updatedEmbed = sourceEmbed
    ? EmbedBuilder.from(sourceEmbed)
    : new EmbedBuilder().setTitle("Appeal Review");

  const existingFields = Array.isArray(sourceEmbed?.fields)
    ? sourceEmbed.fields.filter(
        (field) =>
          !["Status", "Reviewed By", "Unban Result", "DM Sent"].includes(
            String(field?.name || "").trim()
          )
      )
    : [];

  updatedEmbed
    .setColor(action === "approve" ? 0x57f287 : 0xed4245)
    .setFields([
      ...existingFields,
      {
        name: "Status",
        value: action === "approve" ? "Approved" : "Rejected"
      },
      {
        name: "Reviewed By",
        value: `${interaction.user.tag} (${interaction.user.id})`
      },
      {
        name: "Unban Result",
        value:
          action === "approve"
            ? decision.unbanned
              ? "Unbanned successfully"
              : decision.unbanError
                ? `Unban failed: ${decision.unbanError}`
                : "Unban not confirmed"
            : "Not applicable"
      },
      { name: "DM Sent", value: decision.dmSent ? "Yes" : "No" }
    ])
    .setFooter({ text: "Applications & Appeals" })
    .setTimestamp();

  await interaction.update({
    embeds: [updatedEmbed],
    components: buildAppealReviewComponents(appealId, true)
  });

  await interaction.followUp({
    content:
      action === "approve"
        ? `Appeal approved. ${decision.unbanned ? "User unbanned." : "Unban failed, please check permissions."}`
        : "Appeal rejected. User can submit another appeal later.",
    flags: MessageFlags.Ephemeral
  });
}

async function handleVouchSubmitOpenButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(VOUCH_SUBMIT_MODAL_ID)
    .setTitle("Submit Vouch");

  const targetInput = new TextInputBuilder()
    .setCustomId("vouch_target_user")
    .setLabel("Vouched For: mention, ID, or username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64)
    .setPlaceholder("@user or 123456789...");

  const reasonInput = new TextInputBuilder()
    .setCustomId("vouch_reason")
    .setLabel("Reason")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(400)
    .setPlaceholder("trusted mm, clean trade...");

  modal.addComponents(
    new ActionRowBuilder().addComponents(targetInput),
    new ActionRowBuilder().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

async function handleVouchSubmitModal(interaction) {
  const rawTarget = interaction.fields.getTextInputValue("vouch_target_user");
  const reason = interaction.fields.getTextInputValue("vouch_reason");
  const targetMember = await resolveMemberFromInput(interaction.guild, rawTarget);

  if (!targetMember) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Vouch Failed",
          color: 0xed4245,
          fields: [{ name: "Reason", value: "Target user was not found in this server." }]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const result = await triggerSubmittedVouch(interaction.guild, {
    vouchedForId: targetMember.id,
    vouchedById: interaction.user.id,
    reason,
    requestId: interaction.id
  });

  if (!result?.ok) {
    let failureReason = "Could not submit vouch.";
    if (result?.reason === "disabled") {
      failureReason = "Vouch system is disabled right now.";
    } else if (result?.reason === "self_vouch_not_allowed") {
      failureReason = "You cannot vouch yourself.";
    } else if (result?.reason === "channel_unavailable") {
      failureReason = "Vouch channel is not available.";
    } else if (result?.reason === "submit_cooldown") {
      failureReason = "Please wait a few seconds and submit again.";
    }

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Vouch Failed",
          color: 0xed4245,
          fields: [{ name: "Reason", value: failureReason }]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({
    embeds: [
      buildResultEmbed({
        title: result?.scam ? "Scam Vouch Submitted" : "Vouch Submitted",
        color: result?.scam ? 0xed4245 : 0x57f287,
        fields: [
          { name: "Vouched For", value: `<@${result.vouchedForId}>`, inline: true },
          { name: "Vouched By", value: `<@${result.vouchedById}>`, inline: true },
          { name: "Reason", value: String(result.reason || reason || "trusted mm") },
          result?.scam
            ? {
                name: "Scam Vouch Counter",
                value: String(result.totalScamVouches || 1),
                inline: true
              }
            : { name: "Total Vouches", value: String(result.totalVouches || 1), inline: true }
        ]
      })
    ],
    flags: MessageFlags.Ephemeral
  });
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (shouldSkipProcessedInteraction(interaction?.id)) {
      return;
    }

    const globalExecution = await runOnce({
      scope: "interaction_event",
      key: String(interaction?.id || ""),
      ttlMs: INTERACTION_PROCESS_TTL_MS,
      action: async () => true
    });
    if (globalExecution.skipped) {
      return;
    }

    try {
      if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        const payload = {
          embeds: [
            buildResultEmbed({
              title: "Command Not Available",
              color: 0xed4245,
              fields: [
                {
                  name: "Reason",
                  value:
                    "This command is not loaded on the bot yet. Please wait a moment and try again."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        };

        try {
          await interaction.reply(payload);
        } catch (error) {
          if (!isInteractionAlreadyAcknowledged(error)) {
            console.error(`Missing command handler for /${interaction.commandName}:`, error);
          }
        }

        console.warn(`Slash command missing from runtime: /${interaction.commandName}`);
        return;
      }

      if (!canUseCommand(interaction.member, interaction.commandName)) {
        const payload = {
          embeds: [
            buildResultEmbed({
              title: "Command Blocked",
              color: 0xed4245,
              fields: [
                {
                  name: "Reason",
                  value: "You are not allowed to use this command."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        };

        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload);
          } else {
            await interaction.reply(payload);
          }
        } catch (error) {
          if (!isInteractionAlreadyAcknowledged(error)) {
            console.error("Command blocked reply error:", error);
          }
        }
        return;
      }

      const cooldown = checkCooldown({
        guildId: interaction.guildId,
        userId: interaction.user?.id,
        bucket: "slash_command",
        cooldownMs: SLASH_COMMAND_COOLDOWN_MS
      });
      if (!cooldown.allowed) {
        const payload = {
          embeds: [
            buildResultEmbed({
              title: "Cooldown",
              color: 0xfee75c,
              fields: [
                {
                  name: "Wait",
                  value: `Try again in **${formatRetryAfter(cooldown.retryAfterMs)}**.`
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        };

        try {
          await interaction.reply(payload);
        } catch (error) {
          if (!isInteractionAlreadyAcknowledged(error)) {
            console.error("Cooldown reply error:", error);
          }
        }
        return;
      }

      const originalReply = interaction.reply.bind(interaction);
      const originalDeferReply = interaction.deferReply.bind(interaction);
      const originalEditReply = interaction.editReply.bind(interaction);
      const originalFollowUp = interaction.followUp.bind(interaction);

      interaction.deferReply = async (payload) => {
        if (interaction.deferred || interaction.replied) {
          return null;
        }
        return originalDeferReply(payload);
      };

      interaction.reply = async (payload) => {
        if (interaction.deferred && !interaction.replied) {
          return originalEditReply(stripFlagsForEditReply(payload));
        }
        if (interaction.replied) {
          return originalFollowUp(payload);
        }
        return originalReply(payload);
      };

      try {
        // Ack immediately to avoid 3s slash timeout on slow commands.
        // Keep this public by default so normal command outputs are visible to everyone.
        await interaction.deferReply({ flags: 0 });
      } catch (error) {
        if (!isInteractionAlreadyAcknowledged(error)) {
          console.error(`Auto defer failed for /${interaction.commandName}:`, error);
        }
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        if (isInteractionAlreadyAcknowledged(error)) {
          return;
        }
        console.error(`Error in /${interaction.commandName}:`, error);

        const errorMessage = {
          embeds: [
            buildResultEmbed({
              title: "Command Failed",
              color: 0xed4245,
              fields: [
                {
                  name: "Reason",
                  value: "Something went wrong while running that command."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral
        };

        if (interaction.deferred && !interaction.replied) {
          await interaction
            .editReply(stripFlagsForEditReply(errorMessage))
            .catch(() => null);
          return;
        }

        if (interaction.replied) {
          await interaction.followUp(errorMessage).catch(() => null);
          return;
        }

        await interaction.reply(errorMessage).catch(() => null);
        return;
      }

      if (interaction.deferred && !interaction.replied) {
        await interaction
          .editReply({
            embeds: [
              buildResultEmbed({
                title: "Command Completed",
                color: 0x5865f2,
                fields: [
                  {
                    name: "Notice",
                    value: "Command finished without explicit output."
                  }
                ]
              })
            ]
          })
          .catch(() => null);
      } else if (!interaction.deferred && !interaction.replied) {
        await interaction
          .reply({
            embeds: [
              buildResultEmbed({
                title: "Command Completed",
                color: 0x5865f2,
                fields: [
                  {
                    name: "Notice",
                    value: "This command finished without a reply. Response fallback was applied."
                  }
                ]
              })
            ],
            flags: MessageFlags.Ephemeral
          })
          .catch(() => null);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === VOUCH_SUBMIT_MODAL_ID) {
        await handleVouchSubmitModal(interaction);
        return;
      }
      await handleApplicationModal(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleApplicationSelectMenu(interaction);
      return;
    }

    if (!interaction.isButton()) {
      return;
    }

    if (interaction.customId === VOUCH_SUBMIT_BUTTON_ID) {
      await handleVouchSubmitOpenButton(interaction);
      return;
    }

    if (interaction.customId.startsWith("appeal_review:")) {
      await handleAppealReviewButton(interaction).catch(async (error) => {
        console.error("Appeal review button error:", error);
        const payload = {
          content: "Could not process appeal action.",
          flags: MessageFlags.Ephemeral
        };
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => null);
          return;
        }
        await interaction.reply(payload).catch(() => null);
      });
      return;
    }

    if (interaction.customId === "ticket_close") {
      await handleTicketClose(interaction).catch(async (error) => {
        console.error("Ticket close error:", error);
        const payload = { content: "Could not close this ticket.", flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => null);
          return;
        }
        await interaction.reply(payload).catch(() => null);
      });
      return;
    }

    if (interaction.customId === "ticket_claim") {
      await handleTicketClaim(interaction).catch(async (error) => {
        console.error("Ticket claim error:", error);
        const payload = { content: "Could not claim this ticket.", flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => null);
          return;
        }
        await interaction.reply(payload).catch(() => null);
      });
      return;
    }

    if (interaction.customId === "ticket_unclaim") {
      await handleTicketUnclaim(interaction).catch(async (error) => {
        console.error("Ticket unclaim error:", error);
        const payload = { content: "Could not unclaim this ticket.", flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => null);
          return;
        }
        await interaction.reply(payload).catch(() => null);
      });
      return;
    }

    if (interaction.customId.startsWith("ticket_open_")) {
      const forcedTicketType =
        resolveForcedTicketTypeFromPanelChannel(interaction) ||
        resolveTicketTypeFromPanelMessage(interaction);
      const ticketType =
        forcedTicketType || getTicketTypeFromCustomId(interaction.customId, interaction.guildId);
      if (ticketType) {
        try {
          await handleTicketOpen(interaction, ticketType);
        } catch (error) {
          console.error("Ticket open error:", error);

          const message =
            "Could not create ticket. Check category IDs, role IDs, and my permissions.";

          if (interaction.deferred) {
            await interaction.editReply({ content: message }).catch(() => null);
            return;
          }

          const payload = { content: message, flags: MessageFlags.Ephemeral };
          if (interaction.replied) {
            await interaction.followUp(payload).catch(() => null);
            return;
          }

          await interaction.reply(payload).catch(() => null);
        }
        return;
      }
    }

    if (interaction.customId.startsWith("apply_review:")) {
      const [, action, applicationId] = interaction.customId.split(":");
      if (!action || !applicationId || !["approve", "reject"].includes(action)) {
        await interaction.reply({
          content: "Invalid application review action.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await handleApplicationReviewDecision(interaction, action, applicationId);
      return;
    }

    if (interaction.customId.startsWith("confirm_trade:")) {
      const [, messageId, targetUserId] = interaction.customId.split(":");
      if (!messageId || !targetUserId) {
        await interaction.reply({
          content: "Invalid confirmation button.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.user.id !== targetUserId) {
        await interaction.reply({
          content: "This button is not for you.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const trade = getTrade(messageId);
      if (!trade) {
        await interaction.reply({
          content: "This confirmation is expired. Please create a new one.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const result = markConfirmed(messageId, interaction.user.id);
      if (!result.ok) {
        await interaction.reply({
          content: "Could not confirm this trade.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const updatedTrade = result.trade;
      await interaction.update({
        content: `<@${updatedTrade.user1Id}> <@${updatedTrade.user2Id}>`,
        embeds: [buildTradeEmbed(updatedTrade)],
        components: buildTradeButtons(updatedTrade)
      });

      await interaction.followUp({
        content: "Your confirmation has been recorded.",
        flags: MessageFlags.Ephemeral
      });

      if (isFullyConfirmed(updatedTrade)) {
        await interaction.channel.send(
          `✅ Trade confirmed by <@${updatedTrade.user1Id}> and <@${updatedTrade.user2Id}>.`
        );
      }
      return;
    }      await handleApplicationButton(interaction);
    } catch (error) {
      if (isInteractionAlreadyAcknowledged(error)) {
        return;
      }
      console.error("Unhandled interactionCreate error:", error);

      const payload = {
        content: "Something went wrong while processing this interaction.",
        flags: MessageFlags.Ephemeral
      };

      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply(payload).catch(() => null);
        return;
      }
      if (interaction.replied) {
        await interaction.followUp(payload).catch(() => null);
        return;
      }
      await interaction.reply(payload).catch(() => null);
    }
  }
};

async function handleApplicationModal(interaction) {
  if (!interaction.customId.startsWith("role_application:")) {
    return;
  }

  const applicationId = interaction.customId.slice("role_application:".length);
  const settings = await readRoleAppSettings();
  const appConfig = settings.applications.find(
    (app) => app.enabled && app.id === applicationId
  );

  if (!appConfig) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Invalid Application",
          color: 0xed4245,
          fields: [
            {
              name: "Error",
              value: "This role application is not available anymore."
            }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (appConfig.minAge) {
    const user = interaction.user;
    const accountAge = Date.now() - user.createdTimestamp;
    const minAgeMs = appConfig.minAge * 365.25 * 24 * 60 * 60 * 1000;

    if (accountAge < minAgeMs) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Age Requirement Not Met",
            color: 0xed4245,
            fields: [
              {
                name: "Requirement",
                value: `Your account must be at least ${appConfig.minAge} years old.`
              },
              {
                name: "Your Account Age",
                value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  }

  const answers = {};
  const questions = Array.isArray(appConfig.questions)
    ? appConfig.questions.slice(0, 5)
    : [];

  for (const question of questions) {
    let value = "";
    try {
      value = interaction.fields.getTextInputValue(`question_${question.id}`).trim();
    } catch {
      value = "";
    }

    if (question.required && !value) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Missing Required Fields",
            color: 0xed4245,
            fields: [
              {
                name: "Error",
                value: `Question "${question.question}" is required.`
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    answers[question.id] = value;
  }

  const application = await createRoleApplication({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    applicationId,
    answers
  });

  await interaction.reply({
    embeds: [
      buildResultEmbed({
        title: "Application Submitted",
        color: 0x57f287,
        fields: [
          {
            name: "Success",
            value: `Your application for **${appConfig.roleName}** has been submitted.`
          },
          {
            name: "Application ID",
            value: `#${application.id}`
          },
          {
            name: "Next Steps",
            value: "Staff will review your application and notify you."
          }
        ]
      })
    ],
    flags: MessageFlags.Ephemeral
  });

  if (settings.logChannelId) {
    const logChannel = interaction.guild.channels.cache.get(settings.logChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle("New Role Application")
        .setColor(0x7289da)
        .addFields(
          {
            name: "User",
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true
          },
          {
            name: "Role",
            value: appConfig.roleName,
            inline: true
          },
          {
            name: "Application ID",
            value: `#${application.id}`,
            inline: true
          }
        )
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
  }
}

async function handleApplicationButton(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith("approve_app_")) {
    const applicationId = customId.slice("approve_app_".length);
    await handleApplicationAction(interaction, "approve", applicationId);
    return;
  }
  if (customId.startsWith("reject_app_")) {
    const applicationId = customId.slice("reject_app_".length);
    await handleApplicationAction(interaction, "reject", applicationId);
    return;
  }
  if (customId.startsWith("delete_app_")) {
    const applicationId = customId.slice("delete_app_".length);
    await handleApplicationAction(interaction, "delete", applicationId);
    return;
  }
}

async function handleApplicationAction(interaction, action, applicationId) {
  if (!applicationId) {
    await interaction.reply({
      content: "Invalid application action.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const statusByAction = {
    approve: "approved",
    reject: "rejected",
    delete: "deleted"
  };

  const application = await updateRoleApplication({
    guildId: interaction.guildId,
    applicationId,
    updates: {
      status: statusByAction[action] || "pending",
      reviewedBy: interaction.user.id
    }
  });

  if (!application) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Application Not Found",
          color: 0xed4245,
          fields: [
            {
              name: "Error",
              value: "Application not found or already processed."
            }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const settings = await readRoleAppSettings();
  const appConfig = settings.applications.find((a) => a.id === application.applicationId);

  if (action === "approve" && appConfig?.roleId) {
    const member = await interaction.guild.members.fetch(application.userId).catch(() => null);
    if (member) {
      await member.roles.add(appConfig.roleId, "Application approved").catch(() => null);
    }
  }

  const actionColors = {
    approve: 0x57f287,
    reject: 0xed4245,
    delete: 0xf59e0b
  };
  const actionTexts = {
    approve: "Approved",
    reject: "Rejected",
    delete: "Deleted"
  };

  const targetUser = await interaction.client.users.fetch(application.userId).catch(() => null);
  if (targetUser) {
    await targetUser
      .send({
        embeds: [
          buildResultEmbed({
            title: "Role Application Updated",
            color: actionColors[action],
            fields: [
              { name: "Role", value: appConfig?.roleName || application.applicationId },
              { name: "Status", value: actionTexts[action] || "Updated" },
              { name: "Reviewed By", value: interaction.user.tag }
            ]
          })
        ]
      })
      .catch(() => null);
  }

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle(`Application ${actionTexts[action]}`)
        .setColor(actionColors[action])
        .setDescription(`Application #${applicationId} has been ${actionTexts[action].toLowerCase()}.`)
        .addFields(
          {
            name: "User",
            value: `<@${application.userId}>`,
            inline: true
          },
          {
            name: "Reviewed By",
            value: interaction.user.tag,
            inline: true
          }
        )
    ],
    components: []
  });
}

async function handleApplicationSelectMenu(interaction) {
  const customId = interaction.customId;
  if (customId === "apply_select") {
    const selectedTypeId = interaction.values[0];
    await startSelectedApplicationFlow(interaction, selectedTypeId);
    return;
  }
  if (customId.startsWith("role_select_")) {
    await handleRoleSelection(interaction);
  }
}

async function handleRoleSelection(interaction) {
  const selectedRoleId = interaction.values[0];
  const settings = await readRoleAppSettings();
  const appConfig = settings.applications.find((a) => a.id === selectedRoleId);

  if (!appConfig) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Invalid Role",
          color: 0xed4245,
          fields: [
            {
              name: "Error",
              value: "Selected role not found."
            }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const questions = Array.isArray(appConfig.questions)
    ? appConfig.questions.slice(0, 5)
    : [];
  if (questions.length === 0) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Invalid Application Setup",
          color: 0xed4245,
          fields: [
            {
              name: "Error",
              value: "This role has no configured questions."
            }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`role_application:${appConfig.id}`)
    .setTitle(`${appConfig.roleName} Application`);

  questions.forEach((question) => {
    const textInput = new TextInputBuilder()
      .setCustomId(`question_${question.id}`)
      .setLabel(question.question.slice(0, 45))
      .setStyle(question.type === "textarea" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(question.required);

    if (question.type === "number" && question.min) {
      textInput.setPlaceholder(`Minimum value: ${question.min}`);
    }

    const row = new ActionRowBuilder().addComponents(textInput);
    modal.addComponents(row);
  });

  await interaction.showModal(modal);
}





