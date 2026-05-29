const { Events } = require("discord.js");
const { buildLogEmbed, sendServerUpdate } = require("../utils/logger");
const { monitorAntiNuke } = require("../utils/antiNuke");

module.exports = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel?.guild) {
      return;
    }

    const embed = buildLogEmbed({
      title: "Channel Created",
      color: 0x57f287,
      fields: [
        { name: "Channel", value: `${channel}` },
        { name: "Type", value: channel.type },
        { name: "ID", value: channel.id }
      ]
    });

    await sendServerUpdate(channel.guild, embed);
    await monitorAntiNuke({
      guild: channel.guild,
      actionType: "channel_create",
      targetId: channel.id,
      label: "Channel Create"
    }).catch(() => null);
  }
};

