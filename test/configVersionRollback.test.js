const test = require("node:test");
const assert = require("node:assert/strict");
const {
  saveConfigVersion,
  listConfigVersions,
  getConfigVersion
} = require("../src/utils/configVersionStore");
const { setCanaryConfig, getCanaryConfig } = require("../src/utils/canaryModeStore");

function uniqueGuildId() {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

test("config version store should save/list/get versions", async () => {
  const guildId = uniqueGuildId();
  await saveConfigVersion({
    guildId,
    overrides: { a: 1 },
    source: "test_1",
    actorId: "tester"
  });
  await saveConfigVersion({
    guildId,
    overrides: { a: 2 },
    source: "test_2",
    actorId: "tester"
  });

  const versions = await listConfigVersions({ guildId, limit: 5 });
  assert.equal(Array.isArray(versions), true);
  assert.equal(versions.length >= 2, true);

  const firstId = versions[0].id;
  const loaded = await getConfigVersion({ guildId, versionId: firstId });
  assert.ok(loaded);
  assert.equal(loaded.id, firstId);
});

test("canary config should round-trip enable/disable", async () => {
  const guildId = uniqueGuildId();
  const enabled = await setCanaryConfig({
    enabled: true,
    guildId,
    updatedBy: "tester"
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.guildId, guildId);

  const loaded = await getCanaryConfig();
  assert.equal(loaded.enabled, true);
  assert.equal(loaded.guildId, guildId);

  const disabled = await setCanaryConfig({
    enabled: false,
    guildId,
    updatedBy: "tester"
  });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.guildId, null);
});
