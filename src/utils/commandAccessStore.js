const fs = require('fs/promises');
const path = require('path');

const COMMAND_ACCESS_FILE = path.join(__dirname, '../data/commandAccess.json');

async function ensureCommandAccessFile() {
  try {
    await fs.access(COMMAND_ACCESS_FILE);
  } catch {
    await fs.writeFile(COMMAND_ACCESS_FILE, '{}');
  }
}

async function readCommandAccessStore() {
  await ensureCommandAccessFile();
  const data = await fs.readFile(COMMAND_ACCESS_FILE, 'utf8');
  return JSON.parse(data);
}

async function writeCommandAccessStore(data) {
  await ensureCommandAccessFile();
  await fs.writeFile(COMMAND_ACCESS_FILE, JSON.stringify(data, null, 2));
}

async function setRoleCommandAccess({ guildId, roleId, commands }) {
  const store = await readCommandAccessStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  store[guildId][roleId] = {
    commands: commands || [],
    updatedAt: new Date().toISOString()
  };
  
  await writeCommandAccessStore(store);
  return store[guildId][roleId];
}

async function getRoleCommandAccess({ guildId, roleId }) {
  const store = await readCommandAccessStore();
  return store[guildId]?.[roleId] || null;
}

async function getAllRoleCommandAccess({ guildId }) {
  const store = await readCommandAccessStore();
  return store[guildId] || {};
}

async function addCommandToRole({ guildId, roleId, commandName }) {
  const store = await readCommandAccessStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  if (!store[guildId][roleId]) {
    store[guildId][roleId] = { commands: [] };
  }
  
  if (!store[guildId][roleId].commands.includes(commandName)) {
    store[guildId][roleId].commands.push(commandName);
    store[guildId][roleId].updatedAt = new Date().toISOString();
  }
  
  await writeCommandAccessStore(store);
  return store[guildId][roleId];
}

async function removeCommandFromRole({ guildId, roleId, commandName }) {
  const store = await readCommandAccessStore();
  const roleAccess = store[guildId]?.[roleId];
  
  if (roleAccess) {
    roleAccess.commands = roleAccess.commands.filter(cmd => cmd !== commandName);
    roleAccess.updatedAt = new Date().toISOString();
    await writeCommandAccessStore(store);
  }
  
  return roleAccess;
}

async function canRoleUseCommand({ guildId, roleId, commandName }) {
  const store = await readCommandAccessStore();
  const roleAccess = store[guildId]?.[roleId];
  
  if (!roleAccess) {
    return false;
  }
  
  return roleAccess.commands.includes(commandName);
}

async function getUserCommandAccess({ guildId, userRoles }) {
  const store = await readCommandAccessStore();
  const guildAccess = store[guildId] || {};
  
  const userCommands = new Set();
  
  for (const roleId of userRoles) {
    const roleAccess = guildAccess[roleId];
    if (roleAccess) {
      roleAccess.commands.forEach(cmd => userCommands.add(cmd));
    }
  }
  
  return Array.from(userCommands);
}

async function deleteRoleCommandAccess({ guildId, roleId }) {
  const store = await readCommandAccessStore();
  
  if (store[guildId]) {
    delete store[guildId][roleId];
    await writeCommandAccessStore(store);
    return true;
  }
  
  return false;
}

async function setGlobalCommandAccess({ guildId, enabledCommands, disabledCommands }) {
  const store = await readCommandAccessStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  store[guildId].global = {
    enabled: enabledCommands || [],
    disabled: disabledCommands || [],
    updatedAt: new Date().toISOString()
  };
  
  await writeCommandAccessStore(store);
  return store[guildId].global;
}

async function getGlobalCommandAccess({ guildId }) {
  const store = await readCommandAccessStore();
  return store[guildId]?.global || null;
}

module.exports = {
  setRoleCommandAccess,
  getRoleCommandAccess,
  getAllRoleCommandAccess,
  addCommandToRole,
  removeCommandFromRole,
  canRoleUseCommand,
  getUserCommandAccess,
  deleteRoleCommandAccess,
  setGlobalCommandAccess,
  getGlobalCommandAccess
};
