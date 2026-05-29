require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const {
  filterCommandsForGuild,
  getCommandPublishPolicy
} = require("../src/utils/commandPublishPolicy");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function publishGuildCommands(commands, maxAttempts = 25) {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  const route = `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`Publish attempt ${attempt}/${maxAttempts}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(route, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(commands),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const payload = await response.json().catch(() => null);
      if (response.ok) {
        console.log(
          `Publish success. Commands: ${Array.isArray(payload) ? payload.length : 0}`
        );
        return true;
      }

      const retryAfter = Number(payload?.retry_after || 0);
      const status = Number(response.status || 0);
      if (status === 429 && retryAfter > 0 && attempt < maxAttempts) {
        const waitMs = Math.ceil(retryAfter * 1000) + 1200;
        console.log(`Rate limited. Waiting ${waitMs}ms before retry...`);
        await sleep(waitMs);
        continue;
      }

      console.error("Publish failed:", payload || `HTTP ${response.status}`);
      return false;
    } catch (error) {
      if (error?.name === "AbortError" && attempt < maxAttempts) {
        const waitMs = Math.min(3500 * attempt, 20000);
        console.log(`Publish request timed out. Waiting ${waitMs}ms before retry...`);
        await sleep(waitMs);
        continue;
      }
      console.error("Publish failed:", error?.rawError || error?.message || error);
      return false;
    }
  }

  return false;
}

async function main() {
  if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    throw new Error("Missing TOKEN, CLIENT_ID, or GUILD_ID.");
  }

  const commandsPath = path.join(__dirname, "..", "src", "commands");
  const commandFiles = readCommandFiles(commandsPath);
  const allCommands = [];

  for (const filePath of commandFiles) {
    const command = require(filePath);
    if (!command?.data?.toJSON || !command?.execute) {
      continue;
    }
    allCommands.push(command.data.toJSON());
  }
  const commandPolicy = getCommandPublishPolicy();
  const commands = filterCommandsForGuild(allCommands, process.env.GUILD_ID, commandPolicy);

  console.log(`Loaded ${commands.length} commands for publish.`);
  const ok = await publishGuildCommands(commands);
  if (!ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal publish error:", error?.message || error);
  process.exit(1);
});
