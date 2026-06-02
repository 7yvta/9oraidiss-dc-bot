const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

function pill(command) {
  return `\`/${command}\``;
}

function line(commands) {
  return commands.map(pill).join(" ");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("commands")
    .setDescription("Show all public bot commands")
    .setDMPermission(false),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("?? Bot Commands")
      .addFields(
        {
          name: "?? Utility",
          value: line([
            "ping",
            "help",
            "commands",
            "member",
            "rank",
            "leaderboard",
            "invites",
            "fixinvites",
            "rules",
            "terms",
            "tos",
            "ticketstats",
            "botinfo",
            "channelinfo",
            "snipe",
            "middleman",
            "confirmation",
            "poll",
            "say",
            "massdm"
          ])
        },
        {
          name: "?? Moderation",
          value: line([
            "warn",
            "warnings",
            "clearwarnings",
            "kick",
            "ban",
            "unban",
            "timeout",
            "unmute",
            "purge",
            "managerole",
            "roleall",
            "rolefilter",
            "setlevel"
          ])
        },
        {
          name: "?? Tickets",
          value: line([
            "add",
            "remove",
            "transfer",
            "unclaim",
            "forceclaim",
            "ticketstats"
          ])
        },
        {
          name: "?? Applications",
          value: line(["apply", "applypanel", "roleapply", "reviewapps"])
        },
        {
          name: "?? Economy",
          value: line([
            "balance",
            "daily",
            "work",
            "pay",
            "deposit",
            "withdraw",
            "rob",
            "coinflip",
            "economylb",
            "givemoney",
            "setmoney",
            "afk"
          ])
        },
        {
          name: "?? Crypto Prices",
          value: line(["btcprice", "ethprice", "solprice", "xmrprice", "crypto"])
        },
        {
          name: "? Vouches",
          value: line([
            "vouchpanel",
            "autovouchnow",
            "vouch_add",
            "vouchcount",
            "vouchlb",
            "remove_vouches"
          ])
        },
        {
          name: "?? Fun / Misc",
          value: line(["8ball"])
        },
        {
          name: "?? Owner / Setup",
          value: line(["backup create", "teamroles", "ticketconfig", "ticketpanel", "panel1"])
        }
      )
      .setFooter({ text: "Powered by 9oraidiss Ticket System" })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
  }
};

