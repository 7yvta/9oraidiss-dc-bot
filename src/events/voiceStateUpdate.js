const { Events } = require("discord.js");
const { buildLogEmbed, sendModLog } = require("../utils/logger");

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!guild || !member || member.user.bot) {
      return;
    }

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    let title = null;
    const fields = [{ name: "User", value: `${member.user.tag} (${member.id})` }];

    if (!oldChannelId && newChannelId) {
      title = "Voice Joined";
      fields.push({ name: "Channel", value: `<#${newChannelId}>` });
    } else if (oldChannelId && !newChannelId) {
      title = "Voice Left";
      fields.push({ name: "Channel", value: `<#${oldChannelId}>` });
    } else if (oldChannelId !== newChannelId) {
      title = "Voice Moved";
      fields.push({ name: "From", value: `<#${oldChannelId}>` });
      fields.push({ name: "To", value: `<#${newChannelId}>` });
    } else {
      return;
    }

    const embed = buildLogEmbed({
      title,
      color: 0x5865f2,
      fields
    });

    await sendModLog(guild, embed);
  }
};

