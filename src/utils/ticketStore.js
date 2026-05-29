const path = require('path');
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const TICKET_FILE = path.join(__dirname, '../../data/tickets.json');

async function ensureTicketFile() {
  return true;
}

async function readTicketStore() {
  await ensureTicketFile();
  return readJsonDocument({
    namespace: "core_store",
    docKey: "tickets",
    filePath: TICKET_FILE,
    defaultValue: {}
  });
}

async function writeTicketStore(data) {
  await writeJsonDocument({
    namespace: "core_store",
    docKey: "tickets",
    filePath: TICKET_FILE,
    value: data
  });
}

async function createTicket({ guildId, channelId, userId, type, subject }) {
  const store = await readTicketStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  const ticket = {
    id: channelId,
    userId,
    type,
    subject,
    status: 'open',
    claimedBy: null,
    createdAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    messages: []
  };
  
  store[guildId][channelId] = ticket;
  await writeTicketStore(store);
  return ticket;
}

async function getTicket({ guildId, channelId }) {
  const store = await readTicketStore();
  return store[guildId]?.[channelId] || null;
}

async function getAllTickets({ guildId }) {
  const store = await readTicketStore();
  return Object.values(store[guildId] || {});
}

async function getUserTickets({ guildId, userId }) {
  const store = await readTicketStore();
  const tickets = Object.values(store[guildId] || {});
  return tickets.filter(ticket => ticket.userId === userId);
}

async function updateTicket({ guildId, channelId, updates }) {
  const store = await readTicketStore();
  const ticket = store[guildId]?.[channelId];
  
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  Object.assign(ticket, updates);
  await writeTicketStore(store);
  return ticket;
}

async function claimTicket({ guildId, channelId, moderatorId }) {
  return updateTicket({
    guildId,
    channelId,
    updates: {
      claimedBy: moderatorId,
      status: 'claimed'
    }
  });
}

async function closeTicket({ guildId, channelId, closedBy, reason }) {
  return updateTicket({
    guildId,
    channelId,
    updates: {
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy,
      closeReason: reason
    }
  });
}

async function addTicketMessage({ guildId, channelId, message }) {
  const store = await readTicketStore();
  const ticket = store[guildId]?.[channelId];
  
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  ticket.messages.push({
    id: require('crypto').randomUUID().slice(0, 8),
    content: message.content,
    authorId: message.authorId,
    authorTag: message.authorTag,
    timestamp: new Date().toISOString()
  });
  
  await writeTicketStore(store);
  return ticket;
}

async function deleteTicket({ guildId, channelId }) {
  const store = await readTicketStore();
  
  if (store[guildId]) {
    delete store[guildId][channelId];
    await writeTicketStore(store);
    return true;
  }
  
  return false;
}

async function setTicketSettings({ guildId, settings }) {
  const store = await readTicketStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  store[guildId].settings = {
    categoryId: settings.categoryId || null,
    supportRoleId: settings.supportRoleId || null,
    maxTicketsPerUser: settings.maxTicketsPerUser || 5,
    transcriptChannelId: settings.transcriptChannelId || null,
    panelChannelId: settings.panelChannelId || null,
    panelMessage: settings.panelMessage || null,
    updatedAt: new Date().toISOString()
  };
  
  await writeTicketStore(store);
  return store[guildId].settings;
}

async function getTicketSettings({ guildId }) {
  const store = await readTicketStore();
  return store[guildId]?.settings || null;
}

module.exports = {
  createTicket,
  getTicket,
  getAllTickets,
  getUserTickets,
  updateTicket,
  claimTicket,
  closeTicket,
  addTicketMessage,
  deleteTicket,
  setTicketSettings,
  getTicketSettings
};
