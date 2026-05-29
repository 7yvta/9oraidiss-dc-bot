const { PermissionFlagsBits } = require("discord.js");
const {
  getAppeal,
  approveAppeal,
  rejectAppeal,
  addAppealNote
} = require("./appealStore");
const { buildResultEmbed, buildLogEmbed, sendLogToChannel } = require("./logger");

const APPEAL_REVIEW_CHANNEL_ID = "1483282356520620203";
const APPEAL_REVIEWER_ROLE_IDS = [
  "1479263062065152111",
  "1483555926492451118",
  "1479263836778532934",
  "1479263536797454489"
];

function hasRole(member, roleId) {
  if (!member || !roleId) {
    return false;
  }

  if (member.roles?.cache?.has) {
    return member.roles.cache.has(roleId);
  }

  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId);
  }

  return false;
}

function hasAnyRole(member, roleIds) {
  if (!member || !Array.isArray(roleIds) || roleIds.length === 0) {
    return false;
  }

  return roleIds.some((roleId) => hasRole(member, roleId));
}

function canReviewAppeal(member) {
  if (!member) {
    return false;
  }

  const isAdmin =
    member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
    member.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
  if (isAdmin) {
    return true;
  }

  return hasAnyRole(member, APPEAL_REVIEWER_ROLE_IDS);
}

function buildAppealReviewComponents(appealId, disabled = false) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Approve",
          custom_id: `appeal_review:approve:${appealId}`,
          disabled
        },
        {
          type: 2,
          style: 4,
          label: "Reject",
          custom_id: `appeal_review:reject:${appealId}`,
          disabled
        }
      ]
    }
  ];
}

async function processAppealDecision({
  client,
  guild,
  action,
  appealId,
  reviewerUser,
  response
}) {
  const normalizedAction =
    action === "approve" || action === "reject" ? action : null;
  if (!normalizedAction) {
    return { ok: false, reason: "invalid_action" };
  }

  const appeal = await getAppeal({
    guildId: "global",
    appealId
  });
  if (!appeal) {
    return { ok: false, reason: "not_found" };
  }

  if (appeal.status !== "pending") {
    return { ok: false, reason: "already_processed", appeal };
  }

  const defaultResponse =
    normalizedAction === "approve"
      ? "Your appeal has been approved. You are now unbanned and can rejoin the server."
      : "Your appeal has been rejected. You may submit another appeal later.";
  const finalResponse = String(response || defaultResponse).trim().slice(0, 1000);

  if (normalizedAction === "approve") {
    await approveAppeal({
      guildId: "global",
      appealId,
      reviewerId: reviewerUser.id,
      response: finalResponse
    });
  } else {
    await rejectAppeal({
      guildId: "global",
      appealId,
      reviewerId: reviewerUser.id,
      response: finalResponse
    });
  }

  let unbanned = false;
  let unbanError = null;
  if (normalizedAction === "approve" && guild) {
    await guild.bans
      .remove(
        appeal.userId,
        `Appeal approved by ${reviewerUser.tag} (${reviewerUser.id})`
      )
      .then(() => {
        unbanned = true;
      })
      .catch((error) => {
        unbanError = String(error?.message || error);
      });
  }

  let dmSent = false;
  const targetUser = await client.users.fetch(appeal.userId).catch(() => null);
  if (targetUser) {
    const decisionTitle =
      normalizedAction === "approve" ? "Ban Appeal Approved" : "Ban Appeal Rejected";
    const decisionColor = normalizedAction === "approve" ? 0x57f287 : 0xed4245;
    const statusValue =
      normalizedAction === "approve"
        ? unbanned
          ? "Approved and unbanned."
          : "Approved, but unban could not be completed automatically. Staff will assist."
        : "Rejected. You may submit another appeal later.";

    await targetUser
      .send({
        embeds: [
          buildResultEmbed({
            title: decisionTitle,
            color: decisionColor,
            fields: [
              { name: "Appeal ID", value: appealId },
              { name: "Status", value: statusValue },
              { name: "Response", value: finalResponse }
            ]
          })
        ]
      })
      .then(() => {
        dmSent = true;
      })
      .catch(() => null);
  }

  if (guild) {
    const decisionLogEmbed = buildLogEmbed({
      title:
        normalizedAction === "approve" ? "Appeal Approved" : "Appeal Rejected",
      color: normalizedAction === "approve" ? 0x57f287 : 0xed4245,
      fields: [
        { name: "Appeal ID", value: appealId },
        { name: "User", value: `${appeal.userId}` },
        {
          name: "Reviewed By",
          value: `${reviewerUser.tag} (${reviewerUser.id})`
        },
        { name: "Response", value: finalResponse.slice(0, 1000) },
        {
          name: "Unban Result",
          value:
            normalizedAction === "approve"
              ? unbanned
                ? "Unbanned successfully"
                : `Unban failed${unbanError ? `: ${unbanError}` : ""}`
              : "Not applicable"
        },
        { name: "DM Sent", value: dmSent ? "Yes" : "No" }
      ],
      footer: "Applications & Appeals"
    });
    await sendLogToChannel(guild, APPEAL_REVIEW_CHANNEL_ID, decisionLogEmbed).catch(
      () => null
    );
  }

  await addAppealNote({
    guildId: "global",
    appealId,
    authorId: reviewerUser.id,
    note:
      normalizedAction === "approve"
        ? `Decision approved. Unban: ${unbanned ? "success" : unbanError || "failed"}`
        : "Decision rejected."
  }).catch(() => null);

  return {
    ok: true,
    appeal,
    action: normalizedAction,
    response: finalResponse,
    unbanned,
    dmSent,
    unbanError
  };
}

module.exports = {
  APPEAL_REVIEW_CHANNEL_ID,
  APPEAL_REVIEWER_ROLE_IDS,
  canReviewAppeal,
  buildAppealReviewComponents,
  processAppealDecision
};
