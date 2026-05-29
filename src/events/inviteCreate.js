const { Events } = require("discord.js");
const { refreshGuildInviteCache } = require("../utils/inviteTracker");

module.exports = {
  name: Events.InviteCreate,
  async execute(invite) {
    if (!invite.guild) {
      return;
    }
    await refreshGuildInviteCache(invite.guild);
  }
};
