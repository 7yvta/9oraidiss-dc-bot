require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const {
  shouldIncludeCommandForGuild,
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
  if (!process.env.TOKEN || !process.env.CLIENT_ID) {
    throw new Error("Missing TOKEN or CLIENT_ID.");
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
  const commands = allCommands.filter((command) =>
    shouldIncludeCommandForGuild(command?.name, null, commandPolicy)
  );

  const url = `https://discord.com/api/v10/applications/${process.env.CLIENT_ID}/commands`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${process.env.TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Global publish failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  console.log(`Global publish complete. Commands: ${Array.isArray(payload) ? payload.length : 0}`);
}

main().catch((error) => {
  console.error("Global publish error:", error?.message || error);
  process.exit(1);
});
