const { Events } = require("discord.js");
const { buildLogEmbed, sendServerUpdate } = require("../utils/logger");
const { monitorAntiNuke } = require("../utils/antiNuke");

module.exports = {
  name: Events.GuildRoleDelete,
  async execute(role) {
    const embed = buildLogEmbed({
      title: "Role Deleted",
      color: 0xed4245,
      fields: [
        { name: "Name", value: role.name || "Unknown" },
        { name: "ID", value: role.id }
      ]
    });

    await sendServerUpdate(role.guild, embed);
    await monitorAntiNuke({
      guild: role.guild,
      actionType: "role_delete",
      targetId: role.id,
      label: "Role Delete"
    }).catch(() => null);
  }
};

