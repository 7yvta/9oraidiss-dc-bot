const fs = require("node:fs");
const path = require("node:path");
const { getCommandPublishPolicy } = require("../utils/commandPublishPolicy");

function getCommandFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getCommandFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

function loadCommands(client) {
  const commandsPath = path.join(__dirname, "..", "commands");
  const commandFiles = getCommandFiles(commandsPath);
  const commandPolicy = getCommandPublishPolicy();

  for (const filePath of commandFiles) {
    const command = require(filePath);
    if (!command.data || !command.execute) {
      console.warn(`Skipping invalid command at ${filePath}`);
      continue;
    }

    const commandName = String(command.data.name || "").trim().toLowerCase();
    if (commandName === "giveaway" || commandName.startsWith("giveaway_")) {
      continue;
    }
    if (commandPolicy.excludedCommands.has(commandName)) {
      continue;
    }

    command.meta = {
      ...(command.meta || {}),
      category: path.basename(path.dirname(filePath))
    };
    client.commands.set(command.data.name, command);
  }

  console.log(`Loaded ${client.commands.size} commands`);
}

module.exports = {
  loadCommands
};
