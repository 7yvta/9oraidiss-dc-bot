const { Events } = require("discord.js");
const { buildLogEmbed, sendServerUpdate } = require("../utils/logger");
const { getCachedMessage, saveMessage } = require("../utils/messageCache");

function trimText(text, max = 900) {
  if (!text) {
    return "*No text content*";
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) {
      return;
    }

    const cached = getCachedMessage(newMessage.client, newMessage.id);
    const before = oldMessage?.content || oldMessage?.cleanContent || cached?.content || "";
    const after = newMessage?.content || newMessage?.cleanContent || "";
    if (!before && !after) {
      return;
    }
    if (before === after) {
      saveMessage(newMessage);
      return;
    }

    const embed = buildLogEmbed({
      title: "Message Edited",
      color: 0xfaa61a,
      fields: [
        {
          name: "User",
          value: `${newMessage.author.tag} (${newMessage.author.id})`
        },
        { name: "Channel", value: `${newMessage.channel}` },
        { name: "Before", value: trimText(before) },
        { name: "After", value: trimText(after) }
      ]
    });

    await sendServerUpdate(newMessage.guild, embed);
    saveMessage(newMessage);
  }
};
