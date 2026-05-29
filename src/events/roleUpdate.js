const { Events } = require("discord.js");
const { buildLogEmbed, sendServerUpdate } = require("../utils/logger");

module.exports = {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    const fields = [];

    if (oldRole.name !== newRole.name) {
      fields.push({ name: "Name", value: `${oldRole.name} -> ${newRole.name}` });
    }

    if (oldRole.hexColor !== newRole.hexColor) {
      fields.push({ name: "Color", value: `${oldRole.hexColor} -> ${newRole.hexColor}` });
    }

    if (oldRole.hoist !== newRole.hoist) {
      fields.push({ name: "Displayed Separately", value: `${oldRole.hoist} -> ${newRole.hoist}` });
    }

    if (oldRole.mentionable !== newRole.mentionable) {
      fields.push({ name: "Mentionable", value: `${oldRole.mentionable} -> ${newRole.mentionable}` });
    }

    if (fields.length === 0) {
      return;
    }

    const embed = buildLogEmbed({
      title: "Role Updated",
      color: 0xfaa61a,
      fields: [{ name: "Role", value: `${newRole}` }, ...fields]
    });

    await sendServerUpdate(newRole.guild, embed);
  }
};

