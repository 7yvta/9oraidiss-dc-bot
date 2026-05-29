const fs = require('fs/promises');
const path = require('path');

const ACTION_LOG_FILE = path.join(__dirname, '../data/actionLog.json');

async function ensureActionLogFile() {
  try {
    await fs.access(ACTION_LOG_FILE);
  } catch {
    await fs.writeFile(ACTION_LOG_FILE, '{}');
  }
}

async function readActionLogStore() {
  await ensureActionLogFile();
  const data = await fs.readFile(ACTION_LOG_FILE, 'utf8');
  return JSON.parse(data);
}

async function writeActionLogStore(data) {
  await ensureActionLogFile();
  await fs.writeFile(ACTION_LOG_FILE, JSON.stringify(data, null, 2));
}

async function setActionLogSettings({ guildId, settings }) {
  const store = await readActionLogStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  store[guildId].settings = {
    channelId: settings.channelId || null,
    logJoins: settings.logJoins || false,
    logLeaves: settings.logLeaves || false,
    logBans: settings.logBans || false,
    logKicks: settings.logKicks || false,
    logWarnings: settings.logWarnings || false,
    logRoleChanges: settings.logRoleChanges || false,
    logChannelChanges: settings.logChannelChanges || false,
    logMessageDeletes: settings.logMessageDeletes || false,
    embedColor: settings.embedColor || 0x0099ff,
    updatedAt: new Date().toISOString()
  };
  
  await writeActionLogStore(store);
  return store[guildId].settings;
}

async function getActionLogSettings({ guildId }) {
  const store = await readActionLogStore();
  return store[guildId]?.settings || null;
}

async function logAction({ guildId, action, details }) {
  const store = await readActionLogStore();
  
  if (!store[guildId]) {
    store[guildId] = { logs: [] };
  }
  
  if (!store[guildId].logs) {
    store[guildId].logs = [];
  }
  
  const logEntry = {
    id: require('crypto').randomUUID().slice(0, 8),
    action,
    details,
    timestamp: new Date().toISOString()
  };
  
  store[guildId].logs.push(logEntry);
  
  // Keep only last 1000 logs per guild
  if (store[guildId].logs.length > 1000) {
    store[guildId].logs = store[guildId].logs.slice(-1000);
  }
  
  await writeActionLogStore(store);
  return logEntry;
}

async function getActionLogs({ guildId, limit = 50, action }) {
  const store = await readActionLogStore();
  const logs = store[guildId]?.logs || [];
  
  let filteredLogs = logs;
  
  if (action) {
    filteredLogs = logs.filter(log => log.action === action);
  }
  
  // Return most recent logs first
  return filteredLogs.slice(-limit).reverse();
}

async function clearActionLogs({ guildId }) {
  const store = await readActionLogStore();
  
  if (store[guildId]) {
    store[guildId].logs = [];
    await writeActionLogStore(store);
    return true;
  }
  
  return false;
}

async function getLogStats({ guildId }) {
  const store = await readActionLogStore();
  const logs = store[guildId]?.logs || [];
  
  const stats = {
    total: logs.length,
    byAction: {},
    recent24h: 0,
    recent7d: 0
  };
  
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  logs.forEach(log => {
    // Count by action type
    stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
    
    // Count recent logs
    const logTime = new Date(log.timestamp);
    if (logTime > dayAgo) {
      stats.recent24h++;
    }
    if (logTime > weekAgo) {
      stats.recent7d++;
    }
  });
  
  return stats;
}

module.exports = {
  setActionLogSettings,
  getActionLogSettings,
  logAction,
  getActionLogs,
  clearActionLogs,
  getLogStats
};
