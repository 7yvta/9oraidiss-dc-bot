const { Events, REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const {
  getCommandPublishPolicy,
  shouldIncludeCommandForGuild
} = require("../utils/commandPublishPolicy");
const { normalizeCommandPayloads } = require("../utils/commandPayload");
const config = require("../config");


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

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    const applicationId = guild.client.application?.id || config.clientId;
    if (!applicationId) {
      return;
    }

    try {
      console.log(`Auto-deploying commands to new guild: ${guild.name} (${guild.id})`);

      const commands = [];
      const commandsPath = path.join(__dirname, "..", "commands");
      const commandFiles = readCommandFiles(commandsPath);
      const commandPolicy = getCommandPublishPolicy();

      for (const filePath of commandFiles) {
        const command = require(filePath);
        if (!command.data || !command.execute) {
          console.warn(`Skipping invalid command file: ${filePath}`);
          continue;
        }

        const commandJson = command.data.toJSON();
        const commandName = String(commandJson?.name || "").toLowerCase();
        if (!shouldIncludeCommandForGuild(commandName, guild.id, commandPolicy)) {
          continue;
        }

        commands.push(commandJson);
      }

      const rest = new REST({ version: "10" }).setToken(config.token);
      await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), {
        body: normalizeCommandPayloads(commands)
      });

      console.log(`Successfully deployed ${commands.length} commands to ${guild.name} (${guild.id})`);

      const systemChannel = guild.systemChannel;
      if (!systemChannel || !systemChannel.permissionsFor(guild.members.me).has("SendMessages")) {
        return;
      }

      const hasSupportCommand = commands.some((command) => command.name === "support");
      const welcomeEmbed = {
        title: "Bot Successfully Added",
        description: "Thanks for adding me. I am ready to handle moderation, tickets, and automation.",
        color: 0x57f287,
        fields: [
          {
            name: "Commands",
            value: hasSupportCommand
              ? `Loaded **${commands.length}** slash commands. Use \`/help\` and \`/support\` to start.`
              : `Loaded **${commands.length}** slash commands. Use \`/help\` to start.`,
            inline: false
          },
          {
            name: "Quick Start",
            value:
              "• `/ticketpanel`\n• `/panel1`\n• `/applypanel`\n• `/commands`",
            inline: false
          }
        ],
        footer: {
          text: hasSupportCommand
            ? "Use /support for links and setup help."
            : "Use /help for setup help."
        },
        timestamp: new Date().toISOString()
      };

      await systemChannel.send({ embeds: [welcomeEmbed] });
    } catch (error) {
      console.error(`Failed to deploy commands to guild ${guild.id}:`, error);
    }
  }
};


