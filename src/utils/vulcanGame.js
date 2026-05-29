const fs = require("node:fs/promises");
const path = require("node:path");

const dataDir = path.join(__dirname, "..", "..", "data");
const storePath = path.join(dataDir, "vulcan-game.json");

const STOCK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const INVENTORY_PREVIEW_LIMIT = 20;
const LIVE_STOCK_SOURCE_URL = "https://r.jina.ai/http://fruityblox.com/stock";
const LIVE_STOCK_FETCH_COOLDOWN_MS = 60 * 1000;

const FRUITS = [
  { key: "rocket", name: "Rocket", rarity: "Common", value: 3000, weight: 18 },
  { key: "spin", name: "Spin", rarity: "Common", value: 3500, weight: 18 },
  { key: "chop", name: "Chop", rarity: "Common", value: 4500, weight: 16 },
  { key: "spring", name: "Spring", rarity: "Common", value: 5500, weight: 15 },
  { key: "bomb", name: "Bomb", rarity: "Uncommon", value: 12000, weight: 12 },
  { key: "smoke", name: "Smoke", rarity: "Uncommon", value: 15000, weight: 11 },
  { key: "spike", name: "Spike", rarity: "Uncommon", value: 20000, weight: 10 },
  { key: "flame", name: "Flame", rarity: "Rare", value: 250000, weight: 9 },
  { key: "ice", name: "Ice", rarity: "Rare", value: 300000, weight: 8 },
  { key: "dark", name: "Dark", rarity: "Rare", value: 420000, weight: 7 },
  { key: "sand", name: "Sand", rarity: "Rare", value: 450000, weight: 7 },
  { key: "light", name: "Light", rarity: "Epic", value: 650000, weight: 6 },
  { key: "rubber", name: "Rubber", rarity: "Epic", value: 750000, weight: 6 },
  { key: "barrier", name: "Barrier", rarity: "Epic", value: 820000, weight: 5 },
  { key: "ghost", name: "Ghost", rarity: "Epic", value: 900000, weight: 5 },
  { key: "magma", name: "Magma", rarity: "Legendary", value: 1200000, weight: 4 },
  { key: "quake", name: "Quake", rarity: "Legendary", value: 1500000, weight: 3 },
  { key: "buddha", name: "Buddha", rarity: "Legendary", value: 1200000, weight: 3.4 },
  { key: "portal", name: "Portal", rarity: "Legendary", value: 1900000, weight: 2.4 },
  { key: "pain", name: "Pain", rarity: "Legendary", value: 2300000, weight: 2.2 },
  { key: "rumble", name: "Rumble", rarity: "Legendary", value: 2100000, weight: 2.3 },
  { key: "blizzard", name: "Blizzard", rarity: "Legendary", value: 2000000, weight: 2.5 },
  { key: "dough", name: "Dough", rarity: "Mythical", value: 3000000, weight: 1.7 },
  { key: "leopard", name: "Leopard", rarity: "Mythical", value: 5000000, weight: 0.95 },
  { key: "dragon", name: "Dragon", rarity: "Mythical", value: 4500000, weight: 1.1 },
  { key: "kitsune", name: "Kitsune", rarity: "Mythical", value: 8000000, weight: 0.8 }
];

const FRUIT_ALIASES = {
  blade: "chop",
  budha: "buddha",
  paw: "pain",
  lightning: "rumble",
  lighthing: "rumble"
};

const PREFERRED_FRUIT_KEYS_FOR_COMMAND_CHOICES = [
  "kitsune",
  "dragon",
  "leopard",
  "dough",
  "portal",
  "buddha",
  "pain",
  "rumble",
  "blizzard",
  "magma",
  "quake"
];

const RARITY_COLORS = {
  Common: 0x95a5a6,
  Uncommon: 0x2ecc71,
  Rare: 0x3498db,
  Epic: 0x9b59b6,
  Legendary: 0xf39c12,
  Mythical: 0xe74c3c
};

let writeQueue = Promise.resolve();

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashTextToSeed(text) {
  let hash = 2166136261;
  const value = String(text || "");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickByWeight(entries, randomValue) {
  const total = entries.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
  if (!Number.isFinite(total) || total <= 0) {
    return entries[0] || null;
  }

  let cursor = randomValue * total;
  for (const entry of entries) {
    cursor -= Number(entry.weight || 0);
    if (cursor <= 0) {
      return entry;
    }
  }
  return entries[entries.length - 1] || null;
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(storePath, JSON.stringify({ guilds: {} }, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { guilds: {} };
    }
    if (!parsed.guilds || typeof parsed.guilds !== "object" || Array.isArray(parsed.guilds)) {
      parsed.guilds = {};
    }
    return parsed;
  } catch {
    return { guilds: {} };
  }
}

function queueWrite(store) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8")
  );
  return writeQueue;
}

function ensureGuild(store, guildId) {
  const id = String(guildId || "");
  if (!store.guilds[id]) {
    store.guilds[id] = {
      users: {},
      stock: null,
      stockHistory: [],
      stockAlert: {
        channelId: null,
        roleIds: [],
        normalRoleId: null,
        mirageRoleId: null,
        fruitWatchers: []
      },
      autoWinOrLose: {
        channelId: null
      },
      greetChannels: [],
      autoRoles: []
    };
  }
  return store.guilds[id];
}

function ensureUser(guildEntry, userId) {
  const id = String(userId || "");
  if (!guildEntry.users[id]) {
    guildEntry.users[id] = {
      balance: 10000,
      boosterLevel: 1,
      rolls: 0,
      wins: 0,
      losses: 0,
      sold: 0,
      inventory: {},
      lastRollAt: 0,
      lastSeenStockAt: 0
    };
  }
  return guildEntry.users[id];
}

function getFruitByName(rawName) {
  const input = String(rawName || "")
    .trim()
    .toLowerCase();
  if (!input) {
    return null;
  }
  const target = FRUIT_ALIASES[input] || input;
  return (
    FRUITS.find((fruit) => fruit.key === target) ||
    FRUITS.find((fruit) => fruit.name.toLowerCase() === target)
  );
}

function getFruitChoicesForCommands(limit = 25) {
  const ordered = [];
  const seen = new Set();

  for (const key of PREFERRED_FRUIT_KEYS_FOR_COMMAND_CHOICES) {
    const fruit = FRUITS.find((entry) => entry.key === key);
    if (!fruit || seen.has(fruit.key)) {
      continue;
    }
    ordered.push(fruit);
    seen.add(fruit.key);
  }

  for (const fruit of FRUITS) {
    if (seen.has(fruit.key)) {
      continue;
    }
    ordered.push(fruit);
    seen.add(fruit.key);
  }

  return ordered.slice(0, Math.max(1, Math.min(25, Number(limit) || 25)));
}

function getFruitWeightWithBooster(fruit, boosterLevel) {
  const level = Math.max(1, Number(boosterLevel || 1));
  const base = Number(fruit.weight || 1);

  if (fruit.rarity === "Mythical") {
    return base * (1 + Math.min(level - 1, 20) * 0.08);
  }
  if (fruit.rarity === "Legendary") {
    return base * (1 + Math.min(level - 1, 20) * 0.06);
  }
  if (fruit.rarity === "Epic") {
    return base * (1 + Math.min(level - 1, 20) * 0.03);
  }
  if (fruit.rarity === "Common") {
    return Math.max(0.4, base * (1 - Math.min(level - 1, 20) * 0.03));
  }
  if (fruit.rarity === "Uncommon") {
    return Math.max(0.5, base * (1 - Math.min(level - 1, 20) * 0.02));
  }
  return base;
}

function drawFruit(boosterLevel, randomFn = Math.random) {
  const weighted = FRUITS.map((fruit) => ({
    fruit,
    weight: getFruitWeightWithBooster(fruit, boosterLevel)
  }));
  const picked = pickByWeight(weighted, randomFn())?.fruit || FRUITS[0];
  return picked;
}

function getCurrentStockWindow(now = Date.now()) {
  return Math.floor(now / STOCK_INTERVAL_MS);
}

function generateStockForWindow(guildId, windowId) {
  const seed = hashTextToSeed(`${guildId}:${windowId}:vulcan-stock`);
  const random = mulberry32(seed);
  const pool = [...FRUITS];
  const selected = [];
  const count = 5;

  while (selected.length < count && pool.length > 0) {
    const weightedPool = pool.map((fruit) => ({
      fruit,
      weight: Math.max(0.1, fruit.weight)
    }));
    const picked = pickByWeight(weightedPool, random())?.fruit || pool[0];
    selected.push({
      key: picked.key,
      name: picked.name,
      rarity: picked.rarity,
      value: picked.value
    });
    const idx = pool.findIndex((entry) => entry.key === picked.key);
    if (idx >= 0) {
      pool.splice(idx, 1);
    }
  }

  return selected;
}

function parseCountdownToMilliseconds(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

function parseSectionItems(sectionText) {
  const items = [];
  const regex = /###\s+([A-Za-z0-9' -]+)\s+([A-Za-z]+)\s+([0-9,]+)\s+R\s*([0-9,]+)/g;
  let match;
  while ((match = regex.exec(sectionText)) !== null) {
    const name = String(match[1] || "").trim();
    const type = String(match[2] || "").trim();
    const beli = Number(String(match[3] || "0").replace(/,/g, ""));
    const robux = Number(String(match[4] || "0").replace(/,/g, ""));
    if (!name || !Number.isFinite(beli) || beli <= 0) {
      continue;
    }
    const mapped = getFruitByName(name);
    items.push({
      key: mapped?.key || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      rarity: mapped?.rarity || type,
      value: mapped?.value || beli,
      type,
      beli,
      robux
    });
  }
  return items;
}

function parseLiveStockMarkdown(markdown, now) {
  const text = String(markdown || "");
  const lower = text.toLowerCase();
  const normalStart = lower.indexOf("## normal");
  const mirageStart = lower.indexOf("## mirage");
  if (normalStart < 0) {
    return null;
  }

  const normalSection =
    mirageStart > normalStart
      ? text.slice(normalStart, mirageStart)
      : text.slice(normalStart);
  const mirageSection = mirageStart >= 0 ? text.slice(mirageStart) : "";

  const normalItems = parseSectionItems(normalSection);
  const mirageItems = parseSectionItems(mirageSection);
  if (normalItems.length === 0) {
    return null;
  }

  const normalResetRaw = normalSection.match(/Next reset\s+(\d{1,2}:\d{2}:\d{2})/i)?.[1] || null;
  const mirageResetRaw = mirageSection.match(/Next reset\s+(\d{1,2}:\d{2}:\d{2})/i)?.[1] || null;
  const normalResetMs = parseCountdownToMilliseconds(normalResetRaw);
  const mirageResetMs = parseCountdownToMilliseconds(mirageResetRaw);
  const nextNormalResetAt = normalResetMs ? now + normalResetMs : null;
  const nextMirageResetAt = mirageResetMs ? now + mirageResetMs : null;

  const signature = JSON.stringify({
    normal: normalItems.map((item) => item.key),
    mirage: mirageItems.map((item) => item.key)
  });
  const normalSignature = JSON.stringify(normalItems.map((item) => item.key));
  const mirageSignature = JSON.stringify(mirageItems.map((item) => item.key));

  return {
    source: "live_fruityblox",
    signature,
    normalSignature,
    mirageSignature,
    fetchedAt: now,
    normalItems,
    mirageItems,
    normalResetRaw,
    mirageResetRaw,
    nextNormalResetAt,
    nextMirageResetAt
  };
}

async function fetchLiveStockSnapshot(now) {
  const response = await fetch(LIVE_STOCK_SOURCE_URL, {
    signal: AbortSignal.timeout(20000),
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; nexus-bot/1.0)"
    }
  });
  if (!response.ok) {
    return null;
  }
  const text = await response.text();
  return parseLiveStockMarkdown(text, now);
}

async function getOrRefreshStock(guildId, options = {}) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const now = Number(options.now || Date.now());
  const windowId = getCurrentStockWindow(now);
  const force = Boolean(options.force);
  const actorId = options.actorId ? String(options.actorId) : null;

  let refreshed = false;
  const previousStock = guildEntry.stock || null;
  const shouldTryLiveFetch =
    force ||
    !previousStock ||
    now - Number(previousStock.fetchedAt || previousStock.updatedAt || 0) >=
      LIVE_STOCK_FETCH_COOLDOWN_MS;

  if (shouldTryLiveFetch) {
    const live = await fetchLiveStockSnapshot(now).catch(() => null);
    if (live) {
      const changed = previousStock?.signature !== live.signature;
      const normalChanged =
        !previousStock ||
        previousStock.normalSignature !== live.normalSignature;
      const mirageChanged =
        !previousStock ||
        previousStock.mirageSignature !== live.mirageSignature;
      const nextStock = {
        source: live.source,
        signature: live.signature,
        normalSignature: live.normalSignature,
        mirageSignature: live.mirageSignature,
        updatedAt: now,
        fetchedAt: now,
        updatedBy: actorId,
        normalItems: live.normalItems,
        mirageItems: live.mirageItems,
        items: live.normalItems,
        normalResetRaw: live.normalResetRaw,
        mirageResetRaw: live.mirageResetRaw,
        nextNormalResetAt: live.nextNormalResetAt,
        nextMirageResetAt: live.nextMirageResetAt
      };

      guildEntry.stock = nextStock;
      if (changed || force || !previousStock) {
        guildEntry.stockHistory = [
          {
            mode: "live",
            signature: live.signature,
            updatedAt: now,
            items: live.normalItems,
            normalItems: live.normalItems,
            mirageItems: live.mirageItems
          },
          ...(Array.isArray(guildEntry.stockHistory) ? guildEntry.stockHistory : [])
        ].slice(0, 25);
        refreshed = true;
      }
      await queueWrite(store);

      return {
        refreshed,
        normalChanged,
        mirageChanged,
        stock: guildEntry.stock,
        nextRefreshAt:
          live.nextNormalResetAt ||
          live.nextMirageResetAt ||
          now + STOCK_INTERVAL_MS
      };
    }
  }

  const shouldRefreshFallbackStock =
    force ||
    !guildEntry.stock ||
    (guildEntry.stock.source === "fallback_simulated" &&
      guildEntry.stock.windowId !== windowId);

  if (shouldRefreshFallbackStock) {
    const items = generateStockForWindow(guildId, windowId);
    guildEntry.stock = {
      source: "fallback_simulated",
      signature: `fallback:${windowId}`,
      windowId,
      updatedAt: now,
      fetchedAt: now,
      updatedBy: actorId,
      items
    };

    guildEntry.stockHistory = [
      {
        windowId,
        updatedAt: now,
        items
      },
      ...(Array.isArray(guildEntry.stockHistory) ? guildEntry.stockHistory : [])
    ].slice(0, 25);
    refreshed = true;
    await queueWrite(store);
  }

  return {
    refreshed,
    normalChanged: refreshed,
    mirageChanged: false,
    stock: guildEntry.stock,
    nextRefreshAt:
      guildEntry.stock?.nextNormalResetAt ||
      guildEntry.stock?.nextMirageResetAt ||
      (windowId + 1) * STOCK_INTERVAL_MS
  };
}

async function markStockSeen(guildId, userId, timestamp = Date.now()) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  userEntry.lastSeenStockAt = Number(timestamp || Date.now());
  await queueWrite(store);
  return userEntry.lastSeenStockAt;
}

async function getLastSeen(guildId, userId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  return {
    lastSeenStockAt: Number(userEntry.lastSeenStockAt || 0),
    stockHistory: Array.isArray(guildEntry.stockHistory)
      ? guildEntry.stockHistory.slice(0, 5)
      : []
  };
}

async function rollFruitForUser(guildId, userId, options = {}) {
  const amountRaw = Number(options.amount || 1);
  const amount = Math.max(1, Math.min(25, Math.floor(amountRaw)));
  const ignoreCooldown = Boolean(options.ignoreCooldown);
  const now = Number(options.now || Date.now());
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  const cooldownMs = 25 * 1000;

  if (!ignoreCooldown && amount === 1 && now - Number(userEntry.lastRollAt || 0) < cooldownMs) {
    const retryAfterMs = cooldownMs - (now - Number(userEntry.lastRollAt || 0));
    return {
      ok: false,
      reason: "cooldown",
      retryAfterMs
    };
  }

  const results = [];
  for (let i = 0; i < amount; i += 1) {
    const fruit = drawFruit(userEntry.boosterLevel, Math.random);
    const slot = userEntry.inventory[fruit.key] || { qty: 0, locked: false };
    slot.qty = Number(slot.qty || 0) + 1;
    userEntry.inventory[fruit.key] = slot;
    userEntry.rolls = Number(userEntry.rolls || 0) + 1;
    results.push(fruit);
  }

  userEntry.lastRollAt = now;
  await queueWrite(store);

  return {
    ok: true,
    results,
    boosterLevel: Number(userEntry.boosterLevel || 1),
    totalRolls: Number(userEntry.rolls || 0)
  };
}

async function getInventory(guildId, userId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  const items = Object.entries(userEntry.inventory || {})
    .map(([fruitKey, entry]) => {
      const fruit = getFruitByName(fruitKey);
      if (!fruit) {
        return null;
      }
      return {
        key: fruit.key,
        name: fruit.name,
        rarity: fruit.rarity,
        value: fruit.value,
        qty: Number(entry.qty || 0),
        locked: Boolean(entry.locked)
      };
    })
    .filter(Boolean)
    .filter((item) => item.qty > 0)
    .sort((a, b) => b.value - a.value || b.qty - a.qty || a.name.localeCompare(b.name));

  return {
    items,
    previewLimit: INVENTORY_PREVIEW_LIMIT
  };
}

async function getBalanceProfile(guildId, userId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  const inventory = Object.values(userEntry.inventory || {});
  const totalItems = inventory.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  return {
    balance: Number(userEntry.balance || 0),
    boosterLevel: Number(userEntry.boosterLevel || 1),
    wins: Number(userEntry.wins || 0),
    losses: Number(userEntry.losses || 0),
    sold: Number(userEntry.sold || 0),
    rolls: Number(userEntry.rolls || 0),
    totalItems
  };
}

async function lockOrUnlockFruit(guildId, userId, fruitName, shouldLock) {
  const fruit = getFruitByName(fruitName);
  if (!fruit) {
    return { ok: false, reason: "fruit_not_found" };
  }

  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  const slot = userEntry.inventory[fruit.key];
  if (!slot || Number(slot.qty || 0) <= 0) {
    return { ok: false, reason: "not_owned", fruit };
  }
  slot.locked = Boolean(shouldLock);
  userEntry.inventory[fruit.key] = slot;
  await queueWrite(store);
  return { ok: true, fruit, locked: slot.locked };
}

async function sellFruit(guildId, userId, fruitName, quantity) {
  const fruit = getFruitByName(fruitName);
  if (!fruit) {
    return { ok: false, reason: "fruit_not_found" };
  }

  const qty = Math.max(1, Math.floor(Number(quantity || 1)));
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  const slot = userEntry.inventory[fruit.key];
  if (!slot || Number(slot.qty || 0) < qty) {
    return { ok: false, reason: "insufficient_qty", fruit };
  }
  if (slot.locked) {
    return { ok: false, reason: "locked", fruit };
  }

  slot.qty = Number(slot.qty || 0) - qty;
  if (slot.qty <= 0) {
    delete userEntry.inventory[fruit.key];
  } else {
    userEntry.inventory[fruit.key] = slot;
  }

  const sellPrice = Math.floor(fruit.value * 0.75) * qty;
  userEntry.balance = Number(userEntry.balance || 0) + sellPrice;
  userEntry.sold = Number(userEntry.sold || 0) + qty;

  await queueWrite(store);
  return {
    ok: true,
    fruit,
    qty,
    sellPrice,
    newBalance: Number(userEntry.balance || 0)
  };
}

async function getFruitValue(fruitName) {
  const fruit = getFruitByName(fruitName);
  if (!fruit) {
    return { ok: false };
  }
  return {
    ok: true,
    fruit,
    sellValue: Math.floor(fruit.value * 0.75)
  };
}

async function upgradeBooster(guildId, userId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  const level = Number(userEntry.boosterLevel || 1);
  const maxLevel = 15;
  if (level >= maxLevel) {
    return { ok: false, reason: "max_level", level, maxLevel };
  }

  const cost = 2500 * level;
  if (Number(userEntry.balance || 0) < cost) {
    return { ok: false, reason: "insufficient_balance", level, cost, balance: userEntry.balance || 0 };
  }

  userEntry.balance = Number(userEntry.balance || 0) - cost;
  userEntry.boosterLevel = level + 1;
  await queueWrite(store);

  return {
    ok: true,
    oldLevel: level,
    newLevel: Number(userEntry.boosterLevel),
    cost,
    newBalance: Number(userEntry.balance || 0)
  };
}

async function getBoostInfo(guildId, userId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  const level = Number(userEntry.boosterLevel || 1);
  return {
    level,
    mythicalBonusPercent: Math.round((Math.max(0, level - 1) * 8) * 100) / 100,
    legendaryBonusPercent: Math.round((Math.max(0, level - 1) * 6) * 100) / 100,
    epicBonusPercent: Math.round((Math.max(0, level - 1) * 3) * 100) / 100,
    nextUpgradeCost: level >= 15 ? null : 2500 * level
  };
}

async function setStockAlert(guildId, channelId, roleIds = []) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const normalizedList = Array.from(
    new Set(
      (Array.isArray(roleIds) ? roleIds : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
  const normalRoleId = normalizedList[0] || null;
  const mirageRoleId = normalizedList[1] || null;
  guildEntry.stockAlert = {
    channelId: channelId ? String(channelId) : null,
    roleIds: normalizedList,
    normalRoleId,
    mirageRoleId
  };
  await queueWrite(store);
  return guildEntry.stockAlert;
}

async function setStockAlertDetailed(guildId, options = {}) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const currentAlert = guildEntry.stockAlert || {};
  const channelId = options.channelId ? String(options.channelId) : null;
  const normalRoleId = options.normalRoleId ? String(options.normalRoleId) : null;
  const mirageRoleId = options.mirageRoleId ? String(options.mirageRoleId) : null;
  const roleIds = [normalRoleId, mirageRoleId].filter(Boolean);
  const incomingWatchers = Array.isArray(options.fruitWatchers)
    ? options.fruitWatchers
    : Array.isArray(currentAlert.fruitWatchers)
      ? currentAlert.fruitWatchers
      : [];
  const fruitWatchers = incomingWatchers
    .map((entry) => ({
      fruitKey: String(entry?.fruitKey || "").trim().toLowerCase(),
      roleId: String(entry?.roleId || "").trim()
    }))
    .filter((entry) => entry.fruitKey && entry.roleId)
    .slice(0, 20);

  guildEntry.stockAlert = {
    channelId,
    roleIds,
    normalRoleId,
    mirageRoleId,
    fruitWatchers
  };
  await queueWrite(store);
  return guildEntry.stockAlert;
}

async function upsertFruitWatcher(guildId, fruitKey, roleId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const key = String(fruitKey || "").trim().toLowerCase();
  const rid = String(roleId || "").trim();
  if (!key || !rid) {
    return guildEntry.stockAlert || {};
  }

  const current = Array.isArray(guildEntry.stockAlert?.fruitWatchers)
    ? guildEntry.stockAlert.fruitWatchers
    : [];
  const next = current
    .filter((entry) => String(entry?.fruitKey || "").toLowerCase() !== key)
    .concat([{ fruitKey: key, roleId: rid }])
    .slice(0, 20);

  guildEntry.stockAlert = {
    ...(guildEntry.stockAlert || {}),
    fruitWatchers: next
  };
  await queueWrite(store);
  return guildEntry.stockAlert;
}

async function clearStockAlert(guildId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  guildEntry.stockAlert = {
    channelId: null,
    roleIds: [],
    normalRoleId: null,
    mirageRoleId: null,
    fruitWatchers: []
  };
  await queueWrite(store);
  return guildEntry.stockAlert;
}

async function getStockAlert(guildId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const alert = guildEntry.stockAlert || {};
  const normalRoleId =
    alert.normalRoleId || (Array.isArray(alert.roleIds) ? alert.roleIds[0] : null) || null;
  const mirageRoleId =
    alert.mirageRoleId || (Array.isArray(alert.roleIds) ? alert.roleIds[1] : null) || null;
  const roleIds = [normalRoleId, mirageRoleId].filter(Boolean);
  const fruitWatchers = Array.isArray(alert.fruitWatchers)
    ? alert.fruitWatchers
        .map((entry) => ({
          fruitKey: String(entry?.fruitKey || "").trim().toLowerCase(),
          roleId: String(entry?.roleId || "").trim()
        }))
        .filter((entry) => entry.fruitKey && entry.roleId)
        .slice(0, 20)
    : [];
  return {
    channelId: alert.channelId || null,
    roleIds,
    normalRoleId,
    mirageRoleId,
    fruitWatchers
  };
}

async function setAutoWinOrLoseChannel(guildId, channelId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  guildEntry.autoWinOrLose = { channelId: channelId ? String(channelId) : null };
  await queueWrite(store);
  return guildEntry.autoWinOrLose;
}

async function getAutoWinOrLoseChannel(guildId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  return guildEntry.autoWinOrLose || { channelId: null };
}

async function recordWinOrLose(guildId, userId, result) {
  const mode = String(result || "").toLowerCase();
  if (!["win", "loss"].includes(mode)) {
    return { ok: false, reason: "invalid_result" };
  }
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  const userEntry = ensureUser(guildEntry, userId);
  if (mode === "win") {
    userEntry.wins = Number(userEntry.wins || 0) + 1;
    userEntry.balance = Number(userEntry.balance || 0) + 800;
  } else {
    userEntry.losses = Number(userEntry.losses || 0) + 1;
    userEntry.balance = Math.max(0, Number(userEntry.balance || 0) - 250);
  }
  await queueWrite(store);
  return { ok: true };
}

async function setGreetChannels(guildId, channelIds) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  guildEntry.greetChannels = Array.from(
    new Set(
      (Array.isArray(channelIds) ? channelIds : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
  await queueWrite(store);
  return guildEntry.greetChannels;
}

async function getGreetChannels(guildId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  return Array.isArray(guildEntry.greetChannels) ? guildEntry.greetChannels : [];
}

async function addGreetChannel(guildId, channelId) {
  const current = await getGreetChannels(guildId);
  if (!current.includes(String(channelId))) {
    current.push(String(channelId));
  }
  return setGreetChannels(guildId, current);
}

async function removeGreetChannel(guildId, channelId) {
  const current = await getGreetChannels(guildId);
  return setGreetChannels(
    guildId,
    current.filter((id) => id !== String(channelId))
  );
}

async function setAutoRoles(guildId, roleIds) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  guildEntry.autoRoles = Array.from(
    new Set(
      (Array.isArray(roleIds) ? roleIds : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
  await queueWrite(store);
  return guildEntry.autoRoles;
}

async function getAutoRoles(guildId) {
  const store = await readStore();
  const guildEntry = ensureGuild(store, guildId);
  return Array.isArray(guildEntry.autoRoles) ? guildEntry.autoRoles : [];
}

async function addAutoRole(guildId, roleId) {
  const roles = await getAutoRoles(guildId);
  if (!roles.includes(String(roleId))) {
    roles.push(String(roleId));
  }
  return setAutoRoles(guildId, roles);
}

async function removeAutoRole(guildId, roleId) {
  const roles = await getAutoRoles(guildId);
  return setAutoRoles(
    guildId,
    roles.filter((id) => id !== String(roleId))
  );
}

async function listGuildIds() {
  const store = await readStore();
  return Object.keys(store.guilds || {});
}

module.exports = {
  FRUITS,
  getFruitChoicesForCommands,
  RARITY_COLORS,
  STOCK_INTERVAL_MS,
  getFruitByName,
  getFruitValue,
  getOrRefreshStock,
  markStockSeen,
  getLastSeen,
  rollFruitForUser,
  getInventory,
  sellFruit,
  lockOrUnlockFruit,
  getBalanceProfile,
  upgradeBooster,
  getBoostInfo,
  setStockAlert,
  setStockAlertDetailed,
  upsertFruitWatcher,
  clearStockAlert,
  getStockAlert,
  setAutoWinOrLoseChannel,
  getAutoWinOrLoseChannel,
  recordWinOrLose,
  setGreetChannels,
  getGreetChannels,
  addGreetChannel,
  removeGreetChannel,
  setAutoRoles,
  getAutoRoles,
  addAutoRole,
  removeAutoRole,
  listGuildIds
};
