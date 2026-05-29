const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const {
  getGuildOverridesSync,
  getGuildSettingsSync,
  patchGuildOverrides
} = require("../../utils/guildSettings");
const { isBotAdmin, isOwner } = require("../../utils/ownerOnly");

function uniqueIds(ids) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  ];
}

function extractIds(input) {
  return uniqueIds(String(input || "").match(/\d{15,25}/g) || []);
}

function formatRoles(roleIds) {
  const ids = uniqueIds(roleIds);
  return ids.length ? ids.map((id) => `<@&${id}>`).join("\n") : "None";
}

function parseRoleList(primaryRole, rawList) {
  return uniqueIds([
    primaryRole?.id,
    ...extractIds(rawList)
  ]);
}

function getDynamicTriggerRules(settings) {
  return Array.isArray(settings.roleTriggerRules)
    ? settings.roleTriggerRules
        .map((rule) => ({
          name: String(rule?.name || "").trim(),
          sourceRoleIds: uniqueIds(rule?.sourceRoleIds || []),
          targetRoleIds: uniqueIds(rule?.targetRoleIds || [])
        }))
        .filter((rule) => rule.sourceRoleIds.length > 0 && rule.targetRoleIds.length > 0)
    : [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("botconfig")
    .setDescription("Configure bot admin roles and dynamic role triggers")
    .setDMPermission(false)
    .addSubcommandGroup((group) =>
      group
        .setName("adminrole")
        .setDescription("Owner-only bot admin role setup")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Allow a role to manage bot config")
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("Role to allow")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Remove a bot admin role")
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("Role to remove")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("List bot admin roles")
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("trigger")
        .setDescription("Manage dynamic role trigger rules")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("When source role is present, auto-give target role")
            .addRoleOption((option) =>
              option
                .setName("source_role")
                .setDescription("Main source role")
                .setRequired(true)
            )
            .addRoleOption((option) =>
              option
                .setName("target_role")
                .setDescription("Main role to auto-give")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("extra_source_roles")
                .setDescription("More source role IDs/mentions, separated by space or comma")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("extra_target_roles")
                .setDescription("More target role IDs/mentions, separated by space or comma")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("Short label for this trigger rule")
                .setMaxLength(80)
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Remove a dynamic trigger by number from /botconfig trigger list")
            .addIntegerOption((option) =>
              option
                .setName("number")
                .setDescription("Trigger number")
                .setMinValue(1)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("List dynamic trigger rules")
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("clear")
            .setDescription("Remove all dynamic trigger rules")
        )
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const settings = getGuildSettingsSync(guildId);
    const overrides = getGuildOverridesSync(guildId);

    if (group === "adminrole") {
      if (!isOwner(interaction)) {
        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Owner Only",
              color: 0xed4245,
              description: "Only the server owner or configured bot owner can set bot admin roles."
            })
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const role = interaction.options.getRole("role");
      const current = uniqueIds(settings.botAdminRoleIds || []);

      if (subcommand === "list") {
        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Bot Admin Roles",
              color: 0x5865f2,
              description: formatRoles(current)
            })
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] }
        });
      }

      const next =
        subcommand === "add"
          ? uniqueIds([...current, role.id])
          : current.filter((roleId) => roleId !== role.id);

      await patchGuildOverrides(guildId, { botAdminRoleIds: next });
      return interaction.reply({
        embeds: [
          buildResultEmbed({
            title: subcommand === "add" ? "Bot Admin Role Added" : "Bot Admin Role Removed",
            color: 0x57f287,
            fields: [
              { name: "Role", value: `${role}`, inline: true },
              { name: "Current Bot Admin Roles", value: formatRoles(next), inline: false }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    }

    if (group === "trigger") {
      if (!isBotAdmin(interaction)) {
        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Bot Admin Only",
              color: 0xed4245,
              description: "Only the owner or configured bot admin roles can manage triggers."
            })
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const currentRules = getDynamicTriggerRules({
        ...settings,
        roleTriggerRules: overrides.roleTriggerRules || settings.roleTriggerRules
      });

      if (subcommand === "list") {
        const description = currentRules.length
          ? currentRules
              .map((rule, index) => {
                const name = rule.name ? ` — ${rule.name}` : "";
                return `**${index + 1}.**${name}\nSource:\n${formatRoles(rule.sourceRoleIds)}\nTarget:\n${formatRoles(rule.targetRoleIds)}`;
              })
              .join("\n\n")
              .slice(0, 3800)
          : "No dynamic triggers configured. Built-in triggers still run.";

        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Dynamic Role Triggers",
              color: 0x5865f2,
              description
            })
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] }
        });
      }

      if (subcommand === "clear") {
        await patchGuildOverrides(guildId, { roleTriggerRules: [] });
        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Dynamic Triggers Cleared",
              color: 0x57f287,
              description: "Removed all configurable trigger rules. Built-in triggers still run."
            })
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (subcommand === "remove") {
        const number = interaction.options.getInteger("number", true);
        const index = number - 1;
        if (!currentRules[index]) {
          return interaction.reply({
            embeds: [
              buildResultEmbed({
                title: "Trigger Not Found",
                color: 0xed4245,
                description: `No dynamic trigger exists at number ${number}.`
              })
            ],
            flags: MessageFlags.Ephemeral
          });
        }

        const nextRules = currentRules.filter((_, ruleIndex) => ruleIndex !== index);
        await patchGuildOverrides(guildId, { roleTriggerRules: nextRules });
        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Dynamic Trigger Removed",
              color: 0x57f287,
              description: `Removed trigger number ${number}.`
            })
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (subcommand === "add") {
        const sourceRole = interaction.options.getRole("source_role", true);
        const targetRole = interaction.options.getRole("target_role", true);
        const sourceRoleIds = parseRoleList(
          sourceRole,
          interaction.options.getString("extra_source_roles")
        );
        const targetRoleIds = parseRoleList(
          targetRole,
          interaction.options.getString("extra_target_roles")
        );
        const name = String(interaction.options.getString("name") || "").trim();

        const nextRule = {
          ...(name ? { name } : {}),
          sourceRoleIds,
          targetRoleIds
        };
        const nextRules = [...currentRules, nextRule];
        await patchGuildOverrides(guildId, { roleTriggerRules: nextRules });

        return interaction.reply({
          embeds: [
            buildResultEmbed({
              title: "Dynamic Trigger Added",
              color: 0x57f287,
              fields: [
                { name: "Name", value: name || `Trigger ${nextRules.length}`, inline: true },
                { name: "Source Roles", value: formatRoles(sourceRoleIds), inline: false },
                { name: "Target Roles", value: formatRoles(targetRoleIds), inline: false },
                {
                  name: "Behavior",
                  value: "If a member has any source role, the bot gives all target roles. If no source roles remain, target roles are removed."
                }
              ]
            })
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] }
        });
      }
    }

    return interaction.reply({
      embeds: [buildResultEmbed({ title: "Unknown Bot Config Action", color: 0xed4245 })],
      flags: MessageFlags.Ephemeral
    });
  }
};
