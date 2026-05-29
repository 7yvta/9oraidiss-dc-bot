const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildEventDispatchKey,
  runEventOnce
} = require("../src/utils/eventIdempotency");

test("buildEventDispatchKey should create stable key for simple events", () => {
  const key = buildEventDispatchKey("messageDelete", [
    { id: "100", guild: { id: "200" } }
  ]);
  assert.equal(typeof key, "string");
  assert.match(key, /messagedelete/);
  assert.match(key, /200/);
  assert.match(key, /100/);
});

test("runEventOnce should skip duplicate event within ttl", async () => {
  const args = [{ id: `msg-${Date.now()}`, guild: { id: "g1" } }];
  let calls = 0;
  const execute = async () => {
    calls += 1;
    return calls;
  };

  await runEventOnce({
    eventName: "messageDelete",
    args,
    execute,
    ttlMs: 800
  });
  await runEventOnce({
    eventName: "messageDelete",
    args,
    execute,
    ttlMs: 800
  });
  assert.equal(calls, 1);
});
