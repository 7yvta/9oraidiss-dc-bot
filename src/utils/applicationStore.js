const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const dataDir = path.join(__dirname, "..", "..", "data");
const applicationsFile = path.join(dataDir, "applications.json");
const applicationSettingsFile = path.join(dataDir, "application-settings.json");

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(applicationsFile);
  } catch {
    await fs.writeFile(applicationsFile, JSON.stringify({}, null, 2), "utf8");
  }

  try {
    await fs.access(applicationSettingsFile);
  } catch {
    await fs.writeFile(applicationSettingsFile, JSON.stringify({
      enabled: true,
      channelId: null,
      logChannelId: null,
      questions: [
        {
          id: "name",
          question: "What is your name/username?",
          required: true,
          type: "text"
        },
        {
          id: "age",
          question: "How old are you?",
          required: true,
          type: "number",
          min: 13
        },
        {
          id: "experience",
          question: "How much experience do you have with this type of server?",
          required: true,
          type: "textarea"
        },
        {
          id: "reason",
          question: "Why do you want to join this server?",
          required: true,
          type: "textarea"
        }
      ],
      autoRoles: [],
      pendingRole: null,
      approvedRole: null,
      rejectedRole: null
    }, null, 2), "utf8");
  }
}

async function readApplications() {
  await ensureStore();
  const raw = await fs.readFile(applicationsFile, "utf8");
  return JSON.parse(raw);
}

async function writeApplications(data) {
  await fs.writeFile(applicationsFile, JSON.stringify(data, null, 2), "utf8");
}

async function readApplicationSettings() {
  await ensureStore();
  const raw = await fs.readFile(applicationSettingsFile, "utf8");
  return JSON.parse(raw);
}

async function writeApplicationSettings(data) {
  await fs.writeFile(applicationSettingsFile, JSON.stringify(data, null, 2), "utf8");
}

async function createApplication({
  guildId,
  userId,
  answers,
  applicationType = null,
  status = "pending"
}) {
  const applications = await readApplications();
  if (!applications[guildId]) {
    applications[guildId] = {};
  }

  const application = {
    id: crypto.randomUUID().slice(0, 8),
    userId,
    applicationType,
    answers,
    status,
    submittedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    reviewMessage: null
  };

  applications[guildId][application.id] = application;
  await writeApplications(applications);
  return application;
}

async function getApplications({ guildId, status = null }) {
  const applications = await readApplications();
  const guildApplications = applications[guildId] || {};
  
  if (status) {
    return Object.values(guildApplications).filter(app => app.status === status);
  }
  
  return Object.values(guildApplications);
}

async function updateApplication({ guildId, applicationId, updates }) {
  const applications = await readApplications();
  if (!applications[guildId] || !applications[guildId][applicationId]) {
    return null;
  }

  applications[guildId][applicationId] = {
    ...applications[guildId][applicationId],
    ...updates,
    reviewedAt: updates.status ? new Date().toISOString() : applications[guildId][applicationId].reviewedAt
  };

  await writeApplications(applications);
  return applications[guildId][applicationId];
}

async function deleteApplication({ guildId, applicationId }) {
  const applications = await readApplications();
  if (!applications[guildId] || !applications[guildId][applicationId]) {
    return false;
  }

  delete applications[guildId][applicationId];
  await writeApplications(applications);
  return true;
}

module.exports = {
  createApplication,
  getApplications,
  updateApplication,
  deleteApplication,
  readApplicationSettings,
  writeApplicationSettings
};
