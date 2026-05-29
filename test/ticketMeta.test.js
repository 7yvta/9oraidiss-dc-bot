const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseTicketTopic,
  inferTicketTypeFromName,
  buildTicketTopic,
  resolveTicketContext
} = require("../src/utils/ticketMeta");

test("parseTicketTopic should parse owner/type/claim", () => {
  const parsed = parseTicketTopic(
    "ticket-owner:123456789;ticket-type:middleman;ticket-claimed:5555"
  );
  assert.equal(parsed.ownerId, "123456789");
  assert.equal(parsed.ticketType, "middleman");
  assert.equal(parsed.claimedBy, "5555");
});

test("inferTicketTypeFromName should resolve known prefixes", () => {
  assert.equal(inferTicketTypeFromName("support-user-1"), "support");
  assert.equal(inferTicketTypeFromName("middleman-test"), "middleman");
  assert.equal(inferTicketTypeFromName("index-x"), "index");
  assert.equal(inferTicketTypeFromName("role-request"), "role");
});

test("buildTicketTopic should build consistent metadata", () => {
  const topic = buildTicketTopic({
    ownerId: "1",
    ticketType: "support",
    claimedBy: "2"
  });
  assert.match(topic, /ticket-owner:1/);
  assert.match(topic, /ticket-type:support/);
  assert.match(topic, /ticket-claimed:2/);
});

test("resolveTicketContext should fallback to channel name when topic missing", () => {
  const context = resolveTicketContext({
    name: "middleman-john-1234",
    topic: "",
    guild: null,
    parentId: null
  });
  assert.ok(context);
  assert.equal(context.ticketType, "middleman");
  assert.equal(context.source, "name");
});
