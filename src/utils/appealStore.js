const path = require("path");
const crypto = require("node:crypto");
const { readJsonDocument, writeJsonDocument } = require("./persistentStore");

const APPEAL_FILE = path.join(__dirname, "../../data/appeals.json");
const APPEAL_DIR = path.dirname(APPEAL_FILE);

async function ensureAppealFile() {
  // No-op: handled by persistentStore.
  return true;
}

async function readAppealStore() {
  await ensureAppealFile();
  return readJsonDocument({
    namespace: "core_store",
    docKey: "appeals",
    filePath: APPEAL_FILE,
    defaultValue: {}
  });
}

async function writeAppealStore(data) {
  await writeJsonDocument({
    namespace: "core_store",
    docKey: "appeals",
    filePath: APPEAL_FILE,
    value: data
  });
}

function ensureAppealShape(appeal) {
  if (!appeal || typeof appeal !== "object") {
    return appeal;
  }

  if (!Array.isArray(appeal.history)) {
    appeal.history = [];
  }
  if (!Array.isArray(appeal.notes)) {
    appeal.notes = [];
  }
  return appeal;
}

function pushAppealHistory(appeal, entry) {
  ensureAppealShape(appeal);
  appeal.history.push({
    id: crypto.randomUUID().slice(0, 8),
    type: String(entry?.type || "update"),
    actorId: entry?.actorId ? String(entry.actorId) : null,
    note: entry?.note ? String(entry.note).slice(0, 500) : null,
    at: new Date().toISOString(),
    meta: entry?.meta && typeof entry.meta === "object" ? entry.meta : {}
  });
}

async function createAppeal({
  guildId,
  userId,
  reason,
  moderatorsNote,
  targetGuildId = null,
  source = "unknown"
}) {
  const store = await readAppealStore();
  
  if (!store[guildId]) {
    store[guildId] = {};
  }
  
  const appeal = {
    id: crypto.randomUUID().slice(0, 8),
    userId,
    reason,
    moderatorsNote,
    targetGuildId: targetGuildId || null,
    source: String(source || "unknown"),
    status: "pending",
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    decision: null,
    response: null,
    history: [],
    notes: []
  };
  pushAppealHistory(appeal, {
    type: "submitted",
    actorId: userId,
    note: "Appeal submitted",
    meta: {
      source: appeal.source,
      targetGuildId: appeal.targetGuildId
    }
  });
  
  store[guildId][appeal.id] = appeal;
  await writeAppealStore(store);
  return appeal;
}

async function getAppeal({ guildId, appealId }) {
  const store = await readAppealStore();
  const appeal = store[guildId]?.[appealId] || null;
  return ensureAppealShape(appeal);
}

async function getAllAppeals({ guildId }) {
  const store = await readAppealStore();
  return Object.values(store[guildId] || {}).map((appeal) => ensureAppealShape(appeal));
}

async function getUserAppeals({ guildId, userId }) {
  const store = await readAppealStore();
  const appeals = Object.values(store[guildId] || {}).map((appeal) => ensureAppealShape(appeal));
  return appeals.filter(appeal => appeal.userId === userId);
}

async function updateAppeal({ guildId, appealId, updates }) {
  const store = await readAppealStore();
  const appeal = ensureAppealShape(store[guildId]?.[appealId]);
  
  if (!appeal) {
    throw new Error("Appeal not found");
  }
  
  Object.assign(appeal, updates);
  if (updates?.historyEvent && typeof updates.historyEvent === "object") {
    pushAppealHistory(appeal, updates.historyEvent);
    delete appeal.historyEvent;
  }
  await writeAppealStore(store);
  return appeal;
}

async function approveAppeal({ guildId, appealId, reviewerId, response }) {
  return updateAppeal({
    guildId,
    appealId,
    updates: {
      status: "approved",
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerId,
      decision: "approved",
      response,
      historyEvent: {
        type: "approved",
        actorId: reviewerId,
        note: response || "Appeal approved"
      }
    }
  });
}

async function rejectAppeal({ guildId, appealId, reviewerId, response }) {
  return updateAppeal({
    guildId,
    appealId,
    updates: {
      status: "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerId,
      decision: "rejected",
      response,
      historyEvent: {
        type: "rejected",
        actorId: reviewerId,
        note: response || "Appeal rejected"
      }
    }
  });
}

async function addAppealNote({ guildId, appealId, authorId, note }) {
  const text = String(note || "").trim();
  if (!text) {
    return null;
  }

  const store = await readAppealStore();
  const appeal = ensureAppealShape(store[guildId]?.[appealId]);
  if (!appeal) {
    throw new Error("Appeal not found");
  }

  const entry = {
    id: crypto.randomUUID().slice(0, 8),
    authorId: authorId ? String(authorId) : null,
    note: text.slice(0, 1200),
    createdAt: new Date().toISOString()
  };
  appeal.notes.push(entry);
  pushAppealHistory(appeal, {
    type: "note",
    actorId: authorId || null,
    note: text.slice(0, 500)
  });
  await writeAppealStore(store);
  return entry;
}

async function deleteAppeal({ guildId, appealId }) {
  const store = await readAppealStore();
  
  if (store[guildId]) {
    delete store[guildId][appealId];
    await writeAppealStore(store);
    return true;
  }
  
  return false;
}

module.exports = {
  createAppeal,
  getAppeal,
  getAllAppeals,
  getUserAppeals,
  updateAppeal,
  approveAppeal,
  rejectAppeal,
  addAppealNote,
  deleteAppeal
};
