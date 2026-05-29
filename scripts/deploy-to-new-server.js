require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const {
  filterCommandsForGuild,
  getCommandPublishPolicy
} = require("../src/utils/commandPublishPolicy");

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

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

const allCommands = [];
const commandsPath = path.join(__dirname, "..", "src", "commands");
const commandFiles = readCommandFiles(commandsPath);

for (const filePath of commandFiles) {
  const command = require(filePath);
  if (!command.data || !command.execute) {
    console.warn(`Skipping invalid command file: ${filePath}`);
    continue;
  }
  allCommands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(token);

async function deployToNewServer(newGuildId) {
  if (!newGuildId) {
    console.error("Please provide the new server ID");
    console.log("Usage: node scripts/deploy-to-new-server.js YOUR_NEW_SERVER_ID");
    console.log("\nHow to get server ID:");
    console.log("1. Enable Developer Mode in Discord (User Settings > Advanced)");
    console.log("2. Right-click your server icon and select 'Copy Server ID'");
    process.exit(1);
  }

  try {
    const commandPolicy = getCommandPublishPolicy();
    const commands = filterCommandsForGuild(allCommands, newGuildId, commandPolicy);
    console.log(`Deploying ${commands.length} slash command(s) to new server ${newGuildId}...`);

    // Deploy to the new server
    await rest.put(Routes.applicationGuildCommands(clientId, newGuildId), {
      body: commands
    });
    console.log(`✅ Commands deployed to new server: ${newGuildId}`);

    // Also update the .env file with the new guild ID
    const envPath = path.join(__dirname, "..", ".env");
    let envContent = "";
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    // Update or add GUILD_ID and ALLOWED_GUILD_IDS
    const lines = envContent.split('\n');
    let guildIdUpdated = false;
    let allowedGuildsUpdated = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('GUILD_ID=')) {
        lines[i] = `GUILD_ID=${newGuildId}`;
        guildIdUpdated = true;
      } else if (lines[i].startsWith('ALLOWED_GUILD_IDS=')) {
        const existingGuilds = lines[i].substring('ALLOWED_GUILD_IDS='.length).split(',').filter(id => id.trim());
        if (!existingGuilds.includes(newGuildId)) {
          existingGuilds.push(newGuildId);
        }
        lines[i] = `ALLOWED_GUILD_IDS=${existingGuilds.join(',')}`;
        allowedGuildsUpdated = true;
      }
    }

    if (!guildIdUpdated) {
      lines.push(`GUILD_ID=${newGuildId}`);
    }
    if (!allowedGuildsUpdated) {
      lines.push(`ALLOWED_GUILD_IDS=${newGuildId}`);
    }

    fs.writeFileSync(envPath, lines.join('\n'));
    console.log(`✅ Updated .env file with new server ID: ${newGuildId}`);

  } catch (error) {
    console.error("Failed to deploy commands:", error);
    process.exit(1);
  }
}

// Get the new server ID from command line argument
const newGuildId = process.argv[2];
deployToNewServer(newGuildId);
