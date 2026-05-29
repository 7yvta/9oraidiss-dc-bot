const test = require("node:test");
const assert = require("node:assert/strict");
const { Collection } = require("discord.js");

const {
  trackTicketOpened,
  trackTicketClaimed,
  trackTicketClosed,
  getTicketSlaSnapshot,
  getTicketAnalytics
} = require("../src/utils/ticketAnalyticsStore");
const {
  createAppeal,
  addAppealNote,
  approveAppeal,
  getAppeal
} = require("../src/utils/appealStore");
const { diagnoseRoleTriggersForMember } = require("../src/utils/roleTriggerSync");

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

test("ticket lifecycle flow tracks open -> claim -> close metrics", async () => {
  const guildId = uniqueId("guild");
  const channelId = uniqueId("chan");
  const ownerId = uniqueId("owner");
  const claimerId = uniqueId("claimer");
  const closerId = uniqueId("closer");
  const openedAt = Date.now() - 60_000;
  const claimedAt = openedAt + 20_000;
  const closedAt = openedAt + 50_000;

  await trackTicketOpened({
    guildId,
    channelId,
    ownerId,
    ticketType: "support",
    openedAt
  });
  await trackTicketClaimed({
    guildId,
    channelId,
    claimerId,
    claimedAt
  });

  const openSnapshot = await getTicketSlaSnapshot(guildId);
  assert.equal(openSnapshot.totalOpen >= 1, true);
  assert.equal(openSnapshot.claimedOpenCount >= 1, true);

  await trackTicketClosed({
    guildId,
    channelId,
    closedBy: closerId,
    closedAt
  });

  const closedSnapshot = await getTicketSlaSnapshot(guildId);
  const analytics = await getTicketAnalytics(guildId);
  assert.equal(closedSnapshot.totalOpen >= 0, true);
  assert.equal(analytics.totalClosed >= 1, true);
  assert.equal(analytics.averageCloseMs >= 0, true);
  assert.equal(analytics.averageClaimMs >= 0, true);
});

test("appeal flow tracks history/note/approval", async () => {
  const guildId = uniqueId("guild");
  const userId = uniqueId("user");
  const reviewerId = uniqueId("reviewer");

  const appeal = await createAppeal({
    guildId,
    userId,
    reason: "Test reason",
    moderatorsNote: "Test note",
    source: "test"
  });
  assert.equal(appeal.status, "pending");

  await addAppealNote({
    guildId,
    appealId: appeal.id,
    authorId: reviewerId,
    note: "Investigating"
  });

  await approveAppeal({
    guildId,
    appealId: appeal.id,
    reviewerId,
    response: "Approved for test"
  });

  const updated = await getAppeal({ guildId, appealId: appeal.id });
  assert.equal(updated.status, "approved");
  const historyTypes = (updated.history || []).map((entry) => entry.type);
  assert.ok(historyTypes.includes("submitted"));
  assert.ok(historyTypes.includes("note"));
  assert.ok(historyTypes.includes("approved"));
});

test("trigger diagnostics reports matched rules and planned target actions", async () => {
  const sourceRole = { id: "1479264717972308111", name: "Source A", position: 5 };
  const targetRole = { id: "1499840987495665774", name: "Target A", position: 2 };

  const guildRoles = new Collection();
  guildRoles.set(sourceRole.id, sourceRole);
  guildRoles.set(targetRole.id, targetRole);

  const guild = {
    id: uniqueId("guild"),
    roles: {
      cache: guildRoles,
      fetch: async () => null
    },
    members: {
      fetch: async () => member
    }
  };

  const memberRoles = new Collection();
  memberRoles.set(sourceRole.id, sourceRole);

  const member = {
    id: uniqueId("member"),
    guild,
    roles: { cache: memberRoles },
    client: {
      guilds: {
        cache: new Collection(),
        fetch: async () => null
      }
    }
  };

  const diagnostics = await diagnoseRoleTriggersForMember(member);
  assert.ok(diagnostics);
  assert.equal(Array.isArray(diagnostics.ruleDiagnostics), true);
  assert.equal(Array.isArray(diagnostics.targetDiagnostics), true);

  const targetAction = diagnostics.targetDiagnostics.find(
    (entry) => entry.roleId === targetRole.id
  );
  assert.ok(targetAction);
  assert.equal(["add", "none", "remove"].includes(targetAction.plannedAction), true);
});
