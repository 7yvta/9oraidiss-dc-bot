require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const {
  filterCommandsForGuild,
  getCommandPublishPolicy
} = require("../src/utils/commandPublishPolicy");

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

async function main() {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    throw new Error("Missing TOKEN, CLIENT_ID, or GUILD_ID in environment.");
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
  const commands = filterCommandsForGuild(allCommands, guildId, commandPolicy);

  const rest = new REST({ version: "10" }).setToken(token);
  const guildRoute = Routes.applicationGuildCommands(clientId, guildId);

  console.log(`Syncing ${commands.length} commands to guild ${guildId}...`);
  const result = await rest.put(guildRoute, { body: commands });
  console.log(`Guild sync complete. Commands published: ${Array.isArray(result) ? result.length : 0}`);
}

main().catch((error) => {
  console.error("Command sync failed:", error?.message || error);
  process.exit(1);
});
