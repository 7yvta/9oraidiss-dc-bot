const { Events } = require("discord.js");
const { buildLogEmbed, sendServerUpdate } = require("../utils/logger");

module.exports = {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    if (!newChannel?.guild) {
      return;
    }

    const fields = [];

    if (oldChannel.name !== newChannel.name) {
      fields.push({ name: "Name", value: `${oldChannel.name} -> ${newChannel.name}` });
    }

    if (oldChannel.parentId !== newChannel.parentId) {
      fields.push({
        name: "Category",
        value: `${oldChannel.parentId ? `<#${oldChannel.parentId}>` : "None"} -> ${newChannel.parentId ? `<#${newChannel.parentId}>` : "None"}`
      });
    }

    if ("topic" in oldChannel && oldChannel.topic !== newChannel.topic) {
      fields.push({
        name: "Topic",
        value: `${oldChannel.topic || "None"} -> ${newChannel.topic || "None"}`
      });
    }

    if ("rateLimitPerUser" in oldChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
      fields.push({
        name: "Slowmode",
        value: `${oldChannel.rateLimitPerUser || 0}s -> ${newChannel.rateLimitPerUser || 0}s`
      });
    }

    if (fields.length === 0) {
      return;
    }

    const embed = buildLogEmbed({
      title: "Channel Updated",
      color: 0xfaa61a,
      fields: [{ name: "Channel", value: `${newChannel}` }, ...fields]
    });

    await sendServerUpdate(newChannel.guild, embed);
  }
};

