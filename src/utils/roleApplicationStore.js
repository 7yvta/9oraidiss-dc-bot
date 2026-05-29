const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const dataDir = path.join(__dirname, "..", "..", "data");
const roleApplicationsFile = path.join(dataDir, "role-applications.json");
const roleAppSettingsFile = path.join(dataDir, "role-app-settings.json");

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(roleApplicationsFile);
  } catch {
    await fs.writeFile(roleApplicationsFile, JSON.stringify({}, null, 2), "utf8");
  }

  try {
    await fs.access(roleAppSettingsFile);
  } catch {
    await fs.writeFile(roleAppSettingsFile, JSON.stringify({
      enabled: true,
      logChannelId: null,
      applications: [
        {
          id: "moderator",
          roleId: null,
          roleName: "Moderator",
          description: "Apply for moderator role to help manage the server",
          questions: [
            {
              id: "experience",
              question: "How much moderation experience do you have?",
              required: true,
              type: "textarea"
            },
            {
              id: "reason",
              question: "Why do you want to be a moderator?",
              required: true,
              type: "textarea"
            },
            {
              id: "availability",
              question: "How many hours per day can you be active?",
              required: true,
              type: "text"
            }
          ],
          enabled: true,
          autoApprove: false,
          minAge: 16
        },
        {
          id: "staff",
          roleId: null,
          roleName: "Staff",
          description: "Apply for staff role to help with server management",
          questions: [
            {
              id: "skills",
              question: "What skills do you have that would help as staff?",
              required: true,
              type: "textarea"
            },
            {
              id: "motivation",
              question: "What motivates you to help in this server?",
              required: true,
              type: "textarea"
            }
          ],
          enabled: true,
          autoApprove: false,
          minAge: 14
        }
      ]
    }, null, 2), "utf8");
  }
}

async function readRoleApplications() {
  await ensureStore();
  const raw = await fs.readFile(roleApplicationsFile, "utf8");
  return JSON.parse(raw);
}

async function writeRoleApplications(data) {
  await fs.writeFile(roleApplicationsFile, JSON.stringify(data, null, 2), "utf8");
}

async function readRoleAppSettings() {
  await ensureStore();
  const raw = await fs.readFile(roleAppSettingsFile, "utf8");
  return JSON.parse(raw);
}

async function writeRoleAppSettings(data) {
  await fs.writeFile(roleAppSettingsFile, JSON.stringify(data, null, 2), "utf8");
}

async function createRoleApplication({ guildId, userId, applicationId, answers }) {
  const applications = await readRoleApplications();
  if (!applications[guildId]) {
    applications[guildId] = {};
  }

  const application = {
    id: crypto.randomUUID().slice(0, 8),
    userId,
    applicationId,
    answers,
    status: "pending",
    submittedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    reviewMessage: null
  };

  applications[guildId][application.id] = application;
  await writeRoleApplications(applications);
  return application;
}

async function getRoleApplications({ guildId, applicationId = null, status = null }) {
  const applications = await readRoleApplications();
  const guildApplications = applications[guildId] || {};
  
  let results = Object.values(guildApplications);
  
  if (applicationId) {
    results = results.filter(app => app.applicationId === applicationId);
  }
  
  if (status) {
    results = results.filter(app => app.status === status);
  }
  
  return results;
}

async function updateRoleApplication({ guildId, applicationId, updates }) {
  const applications = await readRoleApplications();
  if (!applications[guildId] || !applications[guildId][applicationId]) {
    return null;
  }

  applications[guildId][applicationId] = {
    ...applications[guildId][applicationId],
    ...updates,
    reviewedAt: updates.status ? new Date().toISOString() : applications[guildId][applicationId].reviewedAt
  };

  await writeRoleApplications(applications);
  return applications[guildId][applicationId];
}

async function deleteRoleApplication({ guildId, applicationId }) {
  const applications = await readRoleApplications();
  if (!applications[guildId] || !applications[guildId][applicationId]) {
    return false;
  }

  delete applications[guildId][applicationId];
  await writeRoleApplications(applications);
  return true;
}

module.exports = {
  createRoleApplication,
  getRoleApplications,
  updateRoleApplication,
  deleteRoleApplication,
  readRoleAppSettings,
  writeRoleAppSettings
};
