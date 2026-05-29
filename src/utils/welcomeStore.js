const fs = require('fs/promises');
const path = require('path');

const WELCOME_FILE = path.join(__dirname, '../data/welcome.json');

async function ensureWelcomeFile() {
  try {
    await fs.access(WELCOME_FILE);
  } catch {
    await fs.writeFile(WELCOME_FILE, '{}');
  }
}

async function readWelcomeStore() {
  await ensureWelcomeFile();
  const data = await fs.readFile(WELCOME_FILE, 'utf8');
  return JSON.parse(data);
}

async function writeWelcomeStore(data) {
  await ensureWelcomeFile();
  await fs.writeFile(WELCOME_FILE, JSON.stringify(data, null, 2));
}

async function setWelcomeSettings({ guildId, settings }) {
  const store = await readWelcomeStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  store[guildId] = {
    enabled: settings.enabled || false,
    channelId: settings.channelId || null,
    message: settings.message || 'Welcome {user} to {guild}!',
    embedTitle: settings.embedTitle || 'Welcome!',
    embedColor: settings.embedColor || 0x00ff00,
    embedThumbnail: settings.embedThumbnail || null,
    autoRole: settings.autoRole || null,
    sendDM: settings.sendDM || false,
    dmMessage: settings.dmMessage || 'Welcome to our server!',
    updatedAt: new Date().toISOString()
  };
  
  await writeWelcomeStore(store);
  return store[guildId];
}

async function getWelcomeSettings({ guildId }) {
  const store = await readWelcomeStore();
  return store[guildId] || null;
}

async function toggleWelcome({ guildId, enabled }) {
  const store = await readWelcomeStore();
  
  if (!store[guildId]) {
    store[guildId] = { enabled: false };
  }
  
  store[guildId].enabled = enabled;
  store[guildId].updatedAt = new Date().toISOString();
  
  await writeWelcomeStore(store);
  return store[guildId];
}

async function setAutoRole({ guildId, roleId }) {
  const store = await readWelcomeStore();
  
  if (!store[guildId]) {
    store[guildId] = { enabled: false };
  }
  
  store[guildId].autoRole = roleId;
  store[guildId].updatedAt = new Date().toISOString();
  
  await writeWelcomeStore(store);
  return store[guildId];
}

async function setWelcomeChannel({ guildId, channelId }) {
  const store = await readWelcomeStore();
  
  if (!store[guildId]) {
    store[guildId] = { enabled: false };
  }
  
  store[guildId].channelId = channelId;
  store[guildId].updatedAt = new Date().toISOString();
  
  await writeWelcomeStore(store);
  return store[guildId];
}

async function setWelcomeMessage({ guildId, message }) {
  const store = await readWelcomeStore();
  
  if (!store[guildId]) {
    store[guildId] = { enabled: false };
  }
  
  store[guildId].message = message;
  store[guildId].updatedAt = new Date().toISOString();
  
  await writeWelcomeStore(store);
  return store[guildId];
}

async function deleteWelcomeSettings({ guildId }) {
  const store = await readWelcomeStore();
  
  if (store[guildId]) {
    delete store[guildId];
    await writeWelcomeStore(store);
    return true;
  }
  
  return false;
}

async function logWelcomeEvent({ guildId, userId, action, details }) {
  const store = await readWelcomeStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  if (!store[guildId].events) {
    store[guildId].events = [];
  }
  
  const event = {
    id: require('crypto').randomUUID().slice(0, 8),
    userId,
    action,
    details,
    timestamp: new Date().toISOString()
  };
  
  store[guildId].events.push(event);
  
  // Keep only last 100 events per guild
  if (store[guildId].events.length > 100) {
    store[guildId].events = store[guildId].events.slice(-100);
  }
  
  await writeWelcomeStore(store);
  return event;
}

async function getWelcomeEvents({ guildId, limit = 50 }) {
  const store = await readWelcomeStore();
  const events = store[guildId]?.events || [];
  
  // Return most recent events first
  return events.slice(-limit).reverse();
}

module.exports = {
  setWelcomeSettings,
  getWelcomeSettings,
  toggleWelcome,
  setAutoRole,
  setWelcomeChannel,
  setWelcomeMessage,
  deleteWelcomeSettings,
  logWelcomeEvent,
  getWelcomeEvents
};
