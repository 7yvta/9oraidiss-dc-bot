const { Events } = require("discord.js");
const { buildLogEmbed, sendServerUpdate } = require("../utils/logger");
const { monitorAntiNuke } = require("../utils/antiNuke");

module.exports = {
  name: Events.GuildRoleCreate,
  async execute(role) {
    const embed = buildLogEmbed({
      title: "Role Created",
      color: 0x57f287,
      fields: [
        { name: "Role", value: `${role}` },
        { name: "Name", value: role.name },
        { name: "ID", value: role.id }
      ]
    });

    await sendServerUpdate(role.guild, embed);
    await monitorAntiNuke({
      guild: role.guild,
      actionType: "role_create",
      targetId: role.id,
      label: "Role Create"
    }).catch(() => null);
  }
};

