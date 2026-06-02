const DEFAULT_LINK_COMMAND_BLOCKLIST = [];
const DEFAULT_MAIN_GUILD_ONLY_COMMANDS = [];
const DEFAULT_ALWAYS_EXCLUDED_COMMANDS = [
  "automodall",
  "automode",
  "automodsync",
  "autosend",
  "backup",
  "badge",
  "diag",
  "fixinvites",
  "health",
  "roleall",
  "rolefilter",
  "ticketsla",
  "triggerdiag",
  "syncperms",
  "template",
  "templete"
];

function readCsvListFromEnv(envVarName) {
  return String(process.env[envVarName] || "")
    .split(",")
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);
}

function readCsvSetFromEnv(envVarName, fallbackValues) {
  const fromEnv = readCsvListFromEnv(envVarName);

  if (fromEnv.length > 0) {
    return new Set(fromEnv);
  }

  return new Set(fallbackValues);
}

function getCommandPublishPolicy() {
  const blocked = new Set([
    ...DEFAULT_LINK_COMMAND_BLOCKLIST,
    ...DEFAULT_ALWAYS_EXCLUDED_COMMANDS
  ]);
  for (const name of readCsvListFromEnv("EXTRA_EXCLUDED_COMMANDS")) {
    blocked.add(name);
  }

  return {
    excludedCommands: blocked,
    mainGuildOnlyCommands: readCsvSetFromEnv(
      "MAIN_GUILD_ONLY_COMMANDS",
      DEFAULT_MAIN_GUILD_ONLY_COMMANDS
    ),
    mainGuildId: String(process.env.GUILD_ID || "").trim()
  };
}

function shouldIncludeCommandForGuild(commandName, targetGuildId, policy = getCommandPublishPolicy()) {
  const normalizedCommand = String(commandName || "").trim().toLowerCase();
  if (!normalizedCommand) {
    return false;
  }

  if (policy.excludedCommands.has(normalizedCommand)) {
    return false;
  }

  if (!policy.mainGuildOnlyCommands.has(normalizedCommand)) {
    return true;
  }

  const targetId = String(targetGuildId || "").trim();
  if (!targetId) {
    // Global/unknown target -> never publish main-guild-only commands.
    return false;
  }

  if (!policy.mainGuildId) {
    return false;
  }

  return targetId === policy.mainGuildId;
}

function filterCommandsForGuild(commands, targetGuildId, policy = getCommandPublishPolicy()) {
  return commands.filter((command) =>
    shouldIncludeCommandForGuild(command?.name, targetGuildId, policy)
  );
}

module.exports = {
  getCommandPublishPolicy,
  shouldIncludeCommandForGuild,
  filterCommandsForGuild
};

