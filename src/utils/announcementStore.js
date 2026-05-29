const fs = require('fs/promises');
const path = require('path');

const ANNOUNCEMENT_FILE = path.join(__dirname, '../data/announcements.json');

async function ensureAnnouncementFile() {
  try {
    await fs.access(ANNOUNCEMENT_FILE);
  } catch {
    await fs.writeFile(ANNOUNCEMENT_FILE, '{}');
  }
}

async function readAnnouncementStore() {
  await ensureAnnouncementFile();
  const data = await fs.readFile(ANNOUNCEMENT_FILE, 'utf8');
  return JSON.parse(data);
}

async function writeAnnouncementStore(data) {
  await ensureAnnouncementFile();
  await fs.writeFile(ANNOUNCEMENT_FILE, JSON.stringify(data, null, 2));
}

async function setAnnouncementSettings({ guildId, type, settings }) {
  const store = await readAnnouncementStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  store[guildId][type] = {
    enabled: settings.enabled || false,
    channelId: settings.channelId || null,
    message: settings.message || null,
    embedColor: settings.embedColor || null,
    embedTitle: settings.embedTitle || null,
    updatedAt: new Date().toISOString()
  };
  
  await writeAnnouncementStore(store);
  return store[guildId][type];
}

async function getAnnouncementSettings({ guildId, type }) {
  const store = await readAnnouncementStore();
  return store[guildId]?.[type] || null;
}

async function getAllAnnouncementSettings({ guildId }) {
  const store = await readAnnouncementStore();
  return store[guildId] || {};
}

async function toggleAnnouncement({ guildId, type, enabled }) {
  const store = await readAnnouncementStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  if (!store[guildId][type]) {
    store[guildId][type] = { enabled: false };
  }
  
  store[guildId][type].enabled = enabled;
  store[guildId][type].updatedAt = new Date().toISOString();
  
  await writeAnnouncementStore(store);
  return store[guildId][type];
}

async function deleteAnnouncementSettings({ guildId, type }) {
  const store = await readAnnouncementStore();
  
  if (store[guildId]) {
    delete store[guildId][type];
    await writeAnnouncementStore(store);
    return true;
  }
  
  return false;
}

module.exports = {
  setAnnouncementSettings,
  getAnnouncementSettings,
  getAllAnnouncementSettings,
  toggleAnnouncement,
  deleteAnnouncementSettings
};
