const fs = require('fs/promises');
const path = require('path');

const SERVER_ACCESS_FILE = path.join(__dirname, '../data/serverAccess.json');

async function ensureServerAccessFile() {
  try {
    await fs.access(SERVER_ACCESS_FILE);
  } catch {
    await fs.writeFile(SERVER_ACCESS_FILE, '{}');
  }
}

async function readServerAccessStore() {
  await ensureServerAccessFile();
  const data = await fs.readFile(SERVER_ACCESS_FILE, 'utf8');
  return JSON.parse(data);
}

async function writeServerAccessStore(data) {
  await ensureServerAccessFile();
  await fs.writeFile(SERVER_ACCESS_FILE, JSON.stringify(data, null, 2));
}

async function setGuildLock({ enabled, allowedGuilds }) {
  const store = await readServerAccessStore();
  
  store.guildLock = {
    enabled: enabled || false,
    allowedGuilds: allowedGuilds || [],
    updatedAt: new Date().toISOString()
  };
  
  await writeServerAccessStore(store);
  return store.guildLock;
}

async function getGuildLock() {
  const store = await readServerAccessStore();
  return store.guildLock || { enabled: false, allowedGuilds: [] };
}

async function addAllowedGuild({ guildId }) {
  const store = await readServerAccessStore();
  
  if (!store.guildLock) {
    store.guildLock = { enabled: false, allowedGuilds: [] };
  }
  
  if (!store.guildLock.allowedGuilds.includes(guildId)) {
    store.guildLock.allowedGuilds.push(guildId);
    store.guildLock.updatedAt = new Date().toISOString();
  }
  
  await writeServerAccessStore(store);
  return store.guildLock;
}

async function removeAllowedGuild({ guildId }) {
  const store = await readServerAccessStore();
  
  if (store.guildLock) {
    store.guildLock.allowedGuilds = store.guildLock.allowedGuilds.filter(id => id !== guildId);
    store.guildLock.updatedAt = new Date().toISOString();
  }
  
  await writeServerAccessStore(store);
  return store.guildLock;
}

async function isGuildAllowed({ guildId }) {
  const guildLock = await getGuildLock();
  
  if (!guildLock.enabled) {
    return true;
  }
  
  return guildLock.allowedGuilds.includes(guildId);
}

async function setOwnerOnlyMode({ enabled, ownerId }) {
  const store = await readServerAccessStore();
  
  store.ownerOnlyMode = {
    enabled: enabled || false,
    ownerId: ownerId || null,
    updatedAt: new Date().toISOString()
  };
  
  await writeServerAccessStore(store);
  return store.ownerOnlyMode;
}

async function getOwnerOnlyMode() {
  const store = await readServerAccessStore();
  return store.ownerOnlyMode || { enabled: false, ownerId: null };
}

async function setCommandPrefix({ prefix }) {
  const store = await readServerAccessStore();
  
  store.commandPrefix = {
    prefix: prefix || '!',
    updatedAt: new Date().toISOString()
  };
  
  await writeServerAccessStore(store);
  return store.commandPrefix;
}

async function getCommandPrefix() {
  const store = await readServerAccessStore();
  return store.commandPrefix?.prefix || '!';
}

async function setIntents({ guildMembers, messageContent }) {
  const store = await readServerAccessStore();
  
  store.intents = {
    guildMembers: guildMembers || false,
    messageContent: messageContent || false,
    updatedAt: new Date().toISOString()
  };
  
  await writeServerAccessStore(store);
  return store.intents;
}

async function getIntents() {
  const store = await readServerAccessStore();
  return store.intents || { guildMembers: false, messageContent: false };
}

async function getAllAccessSettings() {
  const store = await readServerAccessStore();
  return store;
}

module.exports = {
  setGuildLock,
  getGuildLock,
  addAllowedGuild,
  removeAllowedGuild,
  isGuildAllowed,
  setOwnerOnlyMode,
  getOwnerOnlyMode,
  setCommandPrefix,
  getCommandPrefix,
  setIntents,
  getIntents,
  getAllAccessSettings
};
