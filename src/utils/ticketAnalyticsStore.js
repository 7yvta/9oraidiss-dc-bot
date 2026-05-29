const path = require("node:path");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const dataDir = path.join(__dirname, "..", "..", "data");
const analyticsFile = path.join(dataDir, "ticket-analytics.json");
let queue = Promise.resolve();

async function readStore() {
  return readJsonDocument({
    namespace: "core_store",
    docKey: "ticket_analytics",
    filePath: analyticsFile,
    defaultValue: { guilds: {} }
  });
}

function writeStore(data) {
  queue = queue.then(() =>
    writeJsonDocument({
      namespace: "core_store",
      docKey: "ticket_analytics",
      filePath: analyticsFile,
      value: data
    })
  );
  return queue;
}

function ensureGuild(store, guildId) {
  if (!store.guilds) {
    store.guilds = {};
  }
  if (!store.guilds[guildId]) {
    store.guilds[guildId] = {
      tickets: {},
      metrics: {
        totalClosed: 0,
        totalOpenToCloseMs: 0,
        totalOpenToClaimMs: 0,
        claimedCount: 0,
        byCloser: {},
        byClaimer: {}
      }
    };
  }
  return store.guilds[guildId];
}

async function trackTicketOpened({ guildId, channelId, ownerId, ticketType, openedAt = Date.now() }) {
  const store = await readStore();
  const guild = ensureGuild(store, String(guildId));
  guild.tickets[String(channelId)] = {
    ownerId: String(ownerId || ""),
    ticketType: String(ticketType || "unknown"),
    openedAt: Number(openedAt || Date.now()),
    claimedBy: null,
    claimedAt: null,
    closedBy: null,
    closedAt: null
  };
  await writeStore(store);
}

async function trackTicketClaimed({ guildId, channelId, claimerId, claimedAt = Date.now() }) {
  const store = await readStore();
  const guild = ensureGuild(store, String(guildId));
  const ticket = guild.tickets[String(channelId)];
  if (!ticket) {
    return;
  }
  ticket.claimedBy = String(claimerId || "");
  ticket.claimedAt = Number(claimedAt || Date.now());
  await writeStore(store);
}

async function trackTicketClosed({
  guildId,
  channelId,
  closedBy,
  closedAt = Date.now()
}) {
  const store = await readStore();
  const guild = ensureGuild(store, String(guildId));
  const ticket = guild.tickets[String(channelId)];
  if (!ticket) {
    return;
  }

  ticket.closedBy = String(closedBy || "");
  ticket.closedAt = Number(closedAt || Date.now());

  const metrics = guild.metrics;
  const openToCloseMs = Math.max(0, Number(ticket.closedAt) - Number(ticket.openedAt || ticket.closedAt));
  metrics.totalClosed += 1;
  metrics.totalOpenToCloseMs += openToCloseMs;

  if (ticket.claimedAt && ticket.openedAt) {
    const openToClaimMs = Math.max(0, Number(ticket.claimedAt) - Number(ticket.openedAt));
    metrics.claimedCount += 1;
    metrics.totalOpenToClaimMs += openToClaimMs;
  }

  if (ticket.closedBy) {
    metrics.byCloser[ticket.closedBy] = (metrics.byCloser[ticket.closedBy] || 0) + 1;
  }
  if (ticket.claimedBy) {
    metrics.byClaimer[ticket.claimedBy] = (metrics.byClaimer[ticket.claimedBy] || 0) + 1;
  }

  delete guild.tickets[String(channelId)];
  await writeStore(store);
}

function topMapEntries(mapObj, limit = 5) {
  return Object.entries(mapObj || {})
    .map(([id, value]) => ({ id, value: Number(value || 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

async function getTicketAnalytics(guildId) {
  const store = await readStore();
  const guild = ensureGuild(store, String(guildId));
  const metrics = guild.metrics || {};
  const totalClosed = Number(metrics.totalClosed || 0);
  const avgCloseMs =
    totalClosed > 0 ? Math.floor(Number(metrics.totalOpenToCloseMs || 0) / totalClosed) : 0;
  const avgClaimMs =
    Number(metrics.claimedCount || 0) > 0
      ? Math.floor(Number(metrics.totalOpenToClaimMs || 0) / Number(metrics.claimedCount))
      : 0;

  return {
    totalClosed,
    averageCloseMs: avgCloseMs,
    averageClaimMs: avgClaimMs,
    openTicketsTracked: Object.keys(guild.tickets || {}).length,
    topClosers: topMapEntries(metrics.byCloser, 5),
    topClaimers: topMapEntries(metrics.byClaimer, 5)
  };
}

function buildQueueByType(tickets) {
  const queue = {
    support: { open: 0, unclaimed: 0 },
    middleman: { open: 0, unclaimed: 0 },
    index: { open: 0, unclaimed: 0 },
    role: { open: 0, unclaimed: 0 },
    unknown: { open: 0, unclaimed: 0 }
  };

  for (const ticket of tickets) {
    const key = queue[ticket.ticketType] ? ticket.ticketType : "unknown";
    queue[key].open += 1;
    if (!ticket.claimedBy) {
      queue[key].unclaimed += 1;
    }
  }
  return queue;
}

function buildStaffRanking(metrics) {
  const scores = new Map();
  for (const [id, value] of Object.entries(metrics.byCloser || {})) {
    scores.set(id, (scores.get(id) || 0) + Number(value || 0) * 2);
  }
  for (const [id, value] of Object.entries(metrics.byClaimer || {})) {
    scores.set(id, (scores.get(id) || 0) + Number(value || 0));
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

async function getTicketSlaSnapshot(guildId, options = {}) {
  const store = await readStore();
  const guild = ensureGuild(store, String(guildId));
  const tickets = Object.entries(guild.tickets || {}).map(([channelId, ticket]) => ({
    channelId: String(channelId),
    ownerId: String(ticket.ownerId || ""),
    ticketType: String(ticket.ticketType || "unknown"),
    openedAt: Number(ticket.openedAt || 0),
    claimedAt: ticket.claimedAt ? Number(ticket.claimedAt) : null,
    claimedBy: ticket.claimedBy ? String(ticket.claimedBy) : null
  }));

  const now = Date.now();
  const unclaimedTickets = tickets
    .filter((ticket) => !ticket.claimedBy)
    .map((ticket) => ({
      ...ticket,
      ageMs: Math.max(0, now - Number(ticket.openedAt || now))
    }))
    .sort((a, b) => b.ageMs - a.ageMs);
  const claimedOpenTickets = tickets.filter((ticket) => Boolean(ticket.claimedBy));

  const metrics = guild.metrics || {};
  const totalClosed = Number(metrics.totalClosed || 0);
  const averageCloseMs =
    totalClosed > 0 ? Math.floor(Number(metrics.totalOpenToCloseMs || 0) / totalClosed) : 0;
  const claimedCount = Number(metrics.claimedCount || 0);
  const averageFirstResponseMs =
    claimedCount > 0
      ? Math.floor(Number(metrics.totalOpenToClaimMs || 0) / claimedCount)
      : 0;

  const oldestUnclaimed = unclaimedTickets
    .slice(0, Math.max(1, Number(options.oldestLimit) || 5))
    .map((ticket) => ({
      channelId: ticket.channelId,
      ownerId: ticket.ownerId,
      ticketType: ticket.ticketType,
      ageMs: ticket.ageMs
    }));

  return {
    totalOpen: tickets.length,
    unclaimedCount: unclaimedTickets.length,
    claimedOpenCount: claimedOpenTickets.length,
    averageFirstResponseMs,
    averageCloseMs,
    queueByType: buildQueueByType(tickets),
    oldestUnclaimed,
    staffRanking: buildStaffRanking(metrics)
  };
}

module.exports = {
  trackTicketOpened,
  trackTicketClaimed,
  trackTicketClosed,
  getTicketAnalytics,
  getTicketSlaSnapshot
};
