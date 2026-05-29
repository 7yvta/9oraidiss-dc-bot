const test = require("node:test");
const assert = require("node:assert/strict");
const {
  xpForNextLevel,
  totalXpForLevel,
  totalXpCapForMaxLevel
} = require("../src/utils/levelStore");

test("xpForNextLevel should always be >= 1", () => {
  for (let level = 0; level <= 200; level += 1) {
    assert.ok(xpForNextLevel(level) >= 1);
  }
});

test("totalXpForLevel should be monotonic", () => {
  let previous = 0;
  for (let level = 0; level <= 120; level += 1) {
    const current = totalXpForLevel(level);
    assert.ok(current >= previous);
    previous = current;
  }
});

test("totalXpCapForMaxLevel should equal totalXpForLevel for valid cap", () => {
  assert.equal(totalXpCapForMaxLevel(1), totalXpForLevel(1));
  assert.equal(totalXpCapForMaxLevel(50), totalXpForLevel(50));
});
