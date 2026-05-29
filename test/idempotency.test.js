const test = require("node:test");
const assert = require("node:assert/strict");
const { hasSeen, runOnce } = require("../src/utils/idempotency");

test("hasSeen should dedupe within ttl", async () => {
  const key = `test:${Date.now()}`;
  assert.equal(hasSeen(key, 1100), false);
  assert.equal(hasSeen(key, 1100), true);
  await new Promise((resolve) => setTimeout(resolve, 1300));
  assert.equal(hasSeen(key, 1100), false);
});

test("runOnce should execute action once per ttl window", async () => {
  const key = `runOnce:${Date.now()}`;
  let calls = 0;
  const action = async () => {
    calls += 1;
    return calls;
  };

  const first = await runOnce({ scope: "t", key, ttlMs: 300, action });
  const second = await runOnce({ scope: "t", key, ttlMs: 300, action });
  assert.equal(first.skipped, false);
  assert.equal(second.skipped, true);
  assert.equal(calls, 1);
});
