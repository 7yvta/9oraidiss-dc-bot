const { EmbedBuilder } = require("discord.js");
const config = require("../config");

async function sendDM(client, user, embedData) {
  let userObj = null;
  try {
    // Try to fetch the user if we only have an ID
    userObj = typeof user === "string" ? await client.users.fetch(user) : user;

    if (!userObj) {
      console.log("Could not fetch user for DM");
      return false;
    }

    const embed = new EmbedBuilder()
      .setTitle(embedData.title)
      .setColor(embedData.color || 0x0099ff)
      .setDescription(embedData.description || "")
      .setTimestamp();

    if (embedData.fields && embedData.fields.length > 0) {
      embed.addFields(embedData.fields);
    }

    await userObj.send({ embeds: [embed] });
    console.log(`DM sent successfully to ${userObj.tag} (${userObj.id})`);
    return true;
  } catch (error) {
    const targetLabel =
      userObj?.tag && userObj?.id
        ? `${userObj.tag} (${userObj.id})`
        : typeof user === "string"
          ? `user ${user}`
          : "unknown user";
    console.error(`Failed to send DM to ${targetLabel}:`, error.message);
    return false;
  }
}

async function sendBanDM(client, user, guildName, reason, moderatorTag) {
  const appealUrl = `${config.publicBaseUrl}/appeal`;
  
  return await sendDM(client, user, {
    title: "You have been banned",
    color: 0xed4245,
    description: `You have been banned from **${guildName}**.`,
    fields: [
      { name: "Reason", value: reason },
      { name: "Moderator", value: moderatorTag },
      { name: "Appeal Your Ban", value: `If you believe this ban was made in error, you can submit an appeal here: ${appealUrl}` }
    ]
  });
}

async function sendKickDM(client, user, guildName, reason, moderatorTag, inviteUrl) {
  const rejoinText = inviteUrl
    ? `If you'd like to rejoin, you can use this invite: ${inviteUrl}`
    : "Ask a staff member for a new server invite to rejoin.";

  return await sendDM(client, user, {
    title: "You have been kicked",
    color: 0xf1c40f,
    description: `You have been kicked from **${guildName}**.`,
    fields: [
      { name: "Reason", value: reason },
      { name: "Moderator", value: moderatorTag },
      { name: "Rejoin Server", value: rejoinText }
    ]
  });
}

async function sendWarnDM(client, user, guildName, reason, moderatorTag, warningId, totalWarnings, consequenceText, clearText) {
  const fields = [
    { name: "Reason", value: reason },
    { name: "Moderator", value: moderatorTag },
    { name: "Warning ID", value: warningId },
    { name: "Total Warnings", value: `${totalWarnings}` }
  ];

  if (consequenceText) {
    fields.push({ name: "Consequence Applied", value: consequenceText });
  }

  if (clearText) {
    fields.push({ name: "Warnings Cleared", value: clearText });
  }

  return await sendDM(client, user, {
    title: "You have been warned",
    color: 0xffae42,
    description: `You have received a warning in **${guildName}**.`,
    fields
  });
}

async function sendTimeoutDM(client, user, guildName, reason, moderatorTag, minutes, until) {
  return await sendDM(client, user, {
    title: "You have been timed out",
    color: 0xf1c40f,
    description: `You have been timed out in **${guildName}**.`,
    fields: [
      { name: "Reason", value: reason },
      { name: "Moderator", value: moderatorTag },
      { name: "Duration", value: `${minutes} minute(s)` },
      { name: "Until", value: `<t:${until}:R>` }
    ]
  });
}

async function sendUnbanDM(client, user, guildName, moderatorTag) {
  return await sendDM(client, user, {
    title: "You have been unbanned",
    color: 0x51cf66,
    description: `You have been unbanned from **${guildName}**.`,
    fields: [
      { name: "Moderator", value: moderatorTag },
      { name: "Action", value: "You can now rejoin the server" }
    ]
  });
}

async function sendClearWarningsDM(client, user, guildName, moderatorTag, clearedCount) {
  return await sendDM(client, user, {
    title: "Warnings Cleared",
    color: 0x51cf66,
    description: `Your warnings have been cleared in **${guildName}**.`,
    fields: [
      { name: "Moderator", value: moderatorTag },
      { name: "Warnings Cleared", value: `${clearedCount} warning(s)` },
      { name: "Status", value: "Your record is now clean" }
    ]
  });
}

async function sendRoleUpdateDM(client, user, guildName, moderatorTag, action, roleName) {
  const color = action === 'added' ? 0x51cf66 : 0xed4245;
  return await sendDM(client, user, {
    title: `Role ${action === 'added' ? 'Added' : 'Removed'}`,
    color: color,
    description: `A role has been ${action} in **${guildName}**.`,
    fields: [
      { name: "Role", value: roleName },
      { name: "Moderator", value: moderatorTag },
      { name: "Action", value: `${action === 'added' ? 'You now have' : 'You no longer have'} the ${roleName} role` }
    ]
  });
}

async function sendPurgeDM(client, user, guildName, moderatorTag, messageCount, channelName) {
  return await sendDM(client, user, {
    title: "Messages Purged",
    color: 0xf1c40f,
    description: `Messages have been purged in **${guildName}**.`,
    fields: [
      { name: "Channel", value: channelName },
      { name: "Messages Deleted", value: `${messageCount} message(s)` },
      { name: "Moderator", value: moderatorTag }
    ]
  });
}

async function sendUnmuteDM(client, user, guildName, moderatorTag) {
  return await sendDM(client, user, {
    title: "You have been unmuted",
    color: 0x51cf66,
    description: `You have been unmuted in **${guildName}**.`,
    fields: [
      { name: "Moderator", value: moderatorTag },
      { name: "Action", value: "You can now send messages and speak in voice channels" }
    ]
  });
}

module.exports = {
  sendDM,
  sendBanDM,
  sendKickDM,
  sendWarnDM,
  sendTimeoutDM,
  sendUnbanDM,
  sendClearWarningsDM,
  sendRoleUpdateDM,
  sendPurgeDM,
  sendUnmuteDM
};
