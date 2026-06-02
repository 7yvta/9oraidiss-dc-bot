require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { syncSlashCommands } = require("./src/utils/slashCommandSync");
const { normalizeCommandPayloads } = require("./src/utils/commandPayload");
const {
  filterCommandsForGuild,
  shouldIncludeCommandForGuild,
  getCommandPublishPolicy
} = require("./src/utils/commandPublishPolicy");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const deployScope = String(process.env.COMMAND_DEPLOY_SCOPE || "guild").toLowerCase();
const allowGlobalDeploy =
  String(process.env.ALLOW_GLOBAL_COMMAND_DEPLOY || "false").toLowerCase() === "true";
const deployAllGuilds =
  String(process.env.DEPLOY_ALL_GUILD_COMMANDS || "true").toLowerCase() !== "false" ||
  String(process.env.DEPLOY_COMMANDS_ALL_GUILDS || "false").toLowerCase() === "true";

if (!token || !clientId) {
  console.error("Missing TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

function readCommandFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...readCommandFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function discordGet(pathname) {
  const response = await fetch(`${DISCORD_API_BASE}${pathname}`, {
    headers: { Authorization: `Bot ${token}` }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`GET ${pathname} failed with ${response.status}: ${payload?.message || text}`);
  }
  return payload;
}

async function listBotGuildIds() {
  const guilds = await discordGet("/users/@me/guilds");
  return Array.isArray(guilds)
    ? guilds.map((guild) => String(guild.id || "").trim()).filter(Boolean)
    : [];
}

const allCommands = [];
const commandsPath = path.join(__dirname, "src", "commands");
const commandFiles = readCommandFiles(commandsPath);

for (const filePath of commandFiles) {
  const command = require(filePath);
  if (!command.data || !command.execute) {
    console.warn(`Skipping invalid command file: ${filePath}`);
    continue;
  }
  const payload = command.data.toJSON();
  const commandName = String(payload?.name || "").trim().toLowerCase();
  if (commandName === "giveaway" || commandName.startsWith("giveaway_")) {
    continue;
  }
  allCommands.push(payload);
}

function buildCommandsForGuild(targetGuildId, commandPolicy) {
  return normalizeCommandPayloads(filterCommandsForGuild(allCommands, targetGuildId, commandPolicy));
}

async function deployGuildCommands(targetGuildId, commandPolicy) {
  const commands = buildCommandsForGuild(targetGuildId, commandPolicy);
  const result = await syncSlashCommands({
    token,
    clientId,
    guildId: targetGuildId,
    commands,
    deployScope: "guild",
    clearGlobalFirst: false,
    clearGuildFirst: false
  });
  console.log(`Guild commands (${targetGuildId}): ${result.guildCount}`);
  return result.guildCount;
}

async function deploy() {
  try {
    if ((deployScope === "global" || deployScope === "both") && !allowGlobalDeploy) {
      throw new Error(
        `Global command deploy is blocked. Set ALLOW_GLOBAL_COMMAND_DEPLOY=true to allow scope "${deployScope}".`
      );
    }

    const commandPolicy = getCommandPublishPolicy();

    if (deployScope === "guild" && deployAllGuilds) {
      const guildIds = await listBotGuildIds();
      if (guildIds.length === 0) {
        throw new Error("Bot guild list is empty; cannot deploy guild commands.");
      }

      console.log(`Deploying slash commands to ${guildIds.length} guild(s)...`);
      let total = 0;
      for (const targetGuildId of guildIds) {
        total += await deployGuildCommands(targetGuildId, commandPolicy);
      }
      console.log(`Command sync complete for ${guildIds.length} guild(s). Total registered: ${total}`);
      process.exitCode = 0;
      return;
    }

    let commands = allCommands;
    if (deployScope === "guild") {
      commands = filterCommandsForGuild(allCommands, guildId, commandPolicy);
    } else if (deployScope === "global") {
      commands = allCommands.filter((command) =>
        shouldIncludeCommandForGuild(command?.name, null, commandPolicy)
      );
    } else if (deployScope === "both") {
      commands = allCommands.filter((command) =>
        shouldIncludeCommandForGuild(command?.name, null, commandPolicy)
      );
    }

    commands = normalizeCommandPayloads(commands);

    console.log(
      `Deploying ${commands.length} slash command(s) with scope "${deployScope}"...`
    );
    const result = await syncSlashCommands({
      token,
      clientId,
      guildId,
      commands,
      deployScope,
      clearGlobalFirst: false,
      clearGuildFirst: false
    });
    console.log(`Command sync complete (scope: ${result.scope}).`);
    console.log(`Global commands: ${result.globalCount}`);
    if (guildId) {
      console.log(`Guild commands (${guildId}): ${result.guildCount}`);
    }
    process.exitCode = 0;
  } catch (error) {
    console.error("Failed to deploy commands:", error);
    process.exitCode = 1;
  }
}

deploy();
