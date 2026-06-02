require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const config = require("./config");
const { loadCommands } = require("./handlers/loadCommands");
const { loadEvents } = require("./handlers/loadEvents");
const { createHealthCheck } = require("./health");
const {
  startInstanceWatchdog,
  stopInstanceWatchdog
} = require("./utils/instanceWatchdog");

if (!config.token) {
  console.error("Missing TOKEN in .env");
  process.exit(1);
}

const runtimeDir = path.join(__dirname, "..", "data", "runtime");
function resolveInstanceLockPath() {
  const tokenHash = crypto
    .createHash("sha256")
    .update(String(config.token || "missing-token"))
    .digest("hex")
    .slice(0, 16);
  const sharedRuntimeDir = path.join(
    os.homedir(),
    ".nexus-bot",
    "runtime"
  );
  return {
    runtimeDir: sharedRuntimeDir,
    instanceLockPath: path.join(sharedRuntimeDir, `bot-instance-${tokenHash}.lock`)
  };
}
const lockPaths = resolveInstanceLockPath();
const instanceLockPath = lockPaths.instanceLockPath;
let hasInstanceLock = false;

function isProcessAlive(pid) {
  const parsedPid = Number(pid);
  if (!Number.isFinite(parsedPid) || parsedPid <= 0) {
    return false;
  }
  try {
    process.kill(parsedPid, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseInstanceLock() {
  if (!hasInstanceLock) {
    return;
  }

  try {
    const raw = fs.readFileSync(instanceLockPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Number(parsed?.pid) === Number(process.pid)) {
      fs.unlinkSync(instanceLockPath);
    }
  } catch {
    // ignore cleanup failures
  }
}

function acquireInstanceLock() {
  const allowMultiInstance =
    String(process.env.ALLOW_MULTI_INSTANCE || "").trim().toLowerCase() === "true";
  if (allowMultiInstance) {
    return true;
  }

  fs.mkdirSync(lockPaths.runtimeDir || runtimeDir, { recursive: true });
  const lockPayload = JSON.stringify(
    {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      cwd: process.cwd()
    },
    null,
    2
  );

  try {
    fs.writeFileSync(instanceLockPath, lockPayload, { flag: "wx" });
    hasInstanceLock = true;
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") {
      console.error("Could not create bot instance lock:", error);
      return false;
    }
  }

  let existingPid = null;
  try {
    const raw = fs.readFileSync(instanceLockPath, "utf8");
    const parsed = JSON.parse(raw);
    existingPid = Number(parsed?.pid) || null;
  } catch {
    existingPid = null;
  }

  if (existingPid && isProcessAlive(existingPid)) {
    console.error(
      `Another bot instance is already running (PID ${existingPid}). Stop it first or set ALLOW_MULTI_INSTANCE=true.`
    );
    return false;
  }

  try {
    fs.writeFileSync(instanceLockPath, lockPayload, { flag: "w" });
    hasInstanceLock = true;
    return true;
  } catch (error) {
    console.error("Could not replace stale bot instance lock:", error);
    return false;
  }
}

process.on("exit", releaseInstanceLock);
process.on("SIGINT", () => {
  stopInstanceWatchdog().catch(() => null);
  releaseInstanceLock();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopInstanceWatchdog().catch(() => null);
  releaseInstanceLock();
  process.exit(0);
});
process.on("SIGBREAK", () => {
  stopInstanceWatchdog().catch(() => null);
  releaseInstanceLock();
  process.exit(0);
});

function getIntents(withPrivileged) {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ];
  if (withPrivileged && config.guildMembersIntent) {
    intents.push(GatewayIntentBits.GuildMembers);
  }
  return intents;
}

function createBotClient(intents) {
  const client = new Client({
    intents,
    partials: [Partials.Channel]
  });
  client.commands = new Collection();
  loadCommands(client);
  loadEvents(client);
  return client;
}

function startStandaloneHealthServer(client) {
  const healthApp = createHealthCheck(client);
  const port = Number(process.env.PORT || 8080);
  healthApp.listen(port, "0.0.0.0", () => {
    console.log(`Health check server listening on port ${port}`);
  });
}

let httpServicesStarted = false;
async function startHttpServices(client) {
  if (httpServicesStarted) {
    return;
  }
  httpServicesStarted = true;

  startStandaloneHealthServer(client);
}

async function bootClient(client) {
  await startHttpServices(client);
  await client.login(config.token);

  const watchdogEnabled =
    String(process.env.INSTANCE_WATCHDOG_ENABLED || "true").trim().toLowerCase() !== "false";

  if (!watchdogEnabled) {
    console.warn("Instance watchdog is disabled by INSTANCE_WATCHDOG_ENABLED=false.");
    return;
  }

  const watchdogState = await startInstanceWatchdog(client).catch((error) => {
    console.error("Instance watchdog start failed:", error);
    return null;
  });
  if (watchdogState?.blockStartup) {
    console.error("Duplicate bot instance detected by watchdog. Stopping this process.");
    process.exit(1);
    return;
  }
}

async function startBot() {
  if (!acquireInstanceLock()) {
    process.exit(1);
  }

  const preferredIntents = getIntents(true);
  let client = createBotClient(preferredIntents);

  try {
    await bootClient(client);
    return;
  } catch (error) {
    const errorText = String(error?.message || error);
    if (!errorText.includes("disallowed intents")) {
      console.error("Bot login failed:", error);
      process.exit(1);
    }

    console.warn(
      "Privileged intents are disabled in Discord portal. Starting in safe mode without privileged intents."
    );

    try {
      client.destroy();
    } catch {
      // ignore destroy errors
    }

    const fallbackIntents = getIntents(false);
    client = createBotClient(fallbackIntents);

    try {
      await bootClient(client);
      return;
    } catch (fallbackError) {
      console.error("Bot login failed in fallback mode:", fallbackError);
      process.exit(1);
    }
  }
}

startBot();
