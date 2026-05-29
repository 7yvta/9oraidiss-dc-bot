const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getAllAppeals, getAppeal, addAppealNote } = require("../../utils/appealStore");
const { buildResultEmbed } = require("../../utils/logger");
const {
  canReviewAppeal,
  processAppealDecision
} = require("../../utils/appealReview");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reviewappeals")
    .setDescription("Review and manage ban appeals")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all appeals")
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Filter by status")
            .addChoices(
              { name: "Pending", value: "pending" },
              { name: "Approved", value: "approved" },
              { name: "Rejected", value: "rejected" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("approve")
        .setDescription("Approve an appeal")
        .addStringOption((option) =>
          option
            .setName("appeal_id")
            .setDescription("The ID of the appeal to approve")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("Response message for the user")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reject")
        .setDescription("Reject an appeal")
        .addStringOption((option) =>
          option
            .setName("appeal_id")
            .setDescription("The ID of the appeal to reject")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("Response message for the user")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("note")
        .setDescription("Add an internal staff note to an appeal")
        .addStringOption((option) =>
          option
            .setName("appeal_id")
            .setDescription("Appeal ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("note")
            .setDescription("Note content")
            .setRequired(true)
            .setMaxLength(1200)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("history")
        .setDescription("Show appeal history and notes")
        .addStringOption((option) =>
          option
            .setName("appeal_id")
            .setDescription("Appeal ID")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (!canReviewAppeal(interaction.member)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Access Denied",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value:
                  "You do not have permission to review appeals."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      const appeals = await getAllAppeals({
        guildId: "global" // Use global for cross-guild appeals
      });

      switch (subcommand) {
        case "list":
          await handleList(interaction, appeals);
          break;
        case "approve":
          await handleApprove(interaction, appeals);
          break;
        case "reject":
          await handleReject(interaction, appeals);
          break;
        case "note":
          await handleNote(interaction);
          break;
        case "history":
          await handleHistory(interaction);
          break;
      }
    } catch (error) {
      console.error("Appeal review error:", error);
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Error",
            color: 0xff6b6b,
            fields: [
              { name: "Error", value: "Failed to process appeal review" }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

async function handleList(interaction, appeals) {
  const status = interaction.options.getString("status");
  
  let filteredAppeals = appeals;
  if (status) {
    filteredAppeals = appeals.filter(appeal => appeal.status === status);
  }

  if (filteredAppeals.length === 0) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "No Appeals Found",
          color: 0xff6b6b,
          fields: [
            { name: "Info", value: `No ${status || ""} appeals found` }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // Sort by submission date (newest first)
  filteredAppeals.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  const fields = filteredAppeals.slice(0, 10).map(appeal => ({
    name: `Appeal #${appeal.id}`,
    value: `**User:** ${appeal.userId}\n**Status:** ${appeal.status}\n**Submitted:** ${new Date(appeal.submittedAt).toLocaleDateString()}\n**Reason:** ${appeal.reason.substring(0, 100)}${appeal.reason.length > 100 ? "..." : ""}`
  }));

  await interaction.reply({
    embeds: [
      buildResultEmbed({
        title: `Appeals (${filteredAppeals.length} total)`,
        color: 0x4dabf7,
        fields
      })
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function handleApprove(interaction, appeals) {
  const appealId = interaction.options.getString("appeal_id", true);
  const response = interaction.options.getString("response", true);

  const appeal = appeals.find(a => a.id === appealId);
  
  if (!appeal) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Appeal Not Found",
          color: 0xff6b6b,
          fields: [
            { name: "Error", value: `Appeal with ID ${appealId} not found` }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (appeal.status !== "pending") {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Cannot Approve",
          color: 0xff6b6b,
          fields: [
            { name: "Error", value: `Appeal is already ${appeal.status}` }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const decision = await processAppealDecision({
    client: interaction.client,
    guild: interaction.guild,
    action: "approve",
    appealId,
    reviewerUser: interaction.user,
    response
  });

  if (!decision.ok) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Appeal Approve Failed",
          color: 0xff6b6b,
          fields: [
            { name: "Reason", value: decision.reason || "Unknown failure" }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({
    embeds: [
      buildResultEmbed({
        title: "Appeal Approved",
        color: 0x51cf66,
        fields: [
          { name: "Appeal ID", value: appealId },
          { name: "User", value: appeal.userId },
          { name: "Response", value: decision.response },
          {
            name: "Unban Result",
            value: decision.unbanned
              ? "Unbanned successfully"
              : decision.unbanError
                ? `Unban failed: ${decision.unbanError}`
                : "Unban not confirmed"
          },
          { name: "DM Sent", value: decision.dmSent ? "Yes" : "No" }
        ]
      })
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function handleReject(interaction, appeals) {
  const appealId = interaction.options.getString("appeal_id", true);
  const response = interaction.options.getString("response", true);

  const appeal = appeals.find(a => a.id === appealId);
  
  if (!appeal) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Appeal Not Found",
          color: 0xff6b6b,
          fields: [
            { name: "Error", value: `Appeal with ID ${appealId} not found` }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (appeal.status !== "pending") {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Cannot Reject",
          color: 0xff6b6b,
          fields: [
            { name: "Error", value: `Appeal is already ${appeal.status}` }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const decision = await processAppealDecision({
    client: interaction.client,
    guild: interaction.guild,
    action: "reject",
    appealId,
    reviewerUser: interaction.user,
    response
  });

  if (!decision.ok) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Appeal Reject Failed",
          color: 0xff6b6b,
          fields: [
            { name: "Reason", value: decision.reason || "Unknown failure" }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({
    embeds: [
      buildResultEmbed({
        title: "Appeal Rejected",
        color: 0xff6b6b,
        fields: [
          { name: "Appeal ID", value: appealId },
          { name: "User", value: appeal.userId },
          { name: "Response", value: decision.response },
          { name: "DM Sent", value: decision.dmSent ? "Yes" : "No" }
        ]
      })
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function handleNote(interaction) {
  const appealId = interaction.options.getString("appeal_id", true);
  const note = interaction.options.getString("note", true);

  try {
    const entry = await addAppealNote({
      guildId: "global",
      appealId,
      authorId: interaction.user.id,
      note
    });

    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Appeal Note Added",
          color: 0x57f287,
          fields: [
            { name: "Appeal ID", value: appealId },
            { name: "Note ID", value: String(entry?.id || "unknown") },
            { name: "Note", value: String(entry?.note || note).slice(0, 1024) }
          ]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Appeal Note Failed",
          color: 0xed4245,
          fields: [{ name: "Reason", value: String(error?.message || "Appeal not found") }]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleHistory(interaction) {
  const appealId = interaction.options.getString("appeal_id", true);
  const appeal = await getAppeal({
    guildId: "global",
    appealId
  });

  if (!appeal) {
    await interaction.reply({
      embeds: [
        buildResultEmbed({
          title: "Appeal Not Found",
          color: 0xed4245,
          fields: [{ name: "Appeal ID", value: appealId }]
        })
      ],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const historyText =
    Array.isArray(appeal.history) && appeal.history.length > 0
      ? appeal.history
          .slice(-10)
          .map(
            (entry) =>
              `${entry.at || "Unknown time"} | ${entry.type || "update"} | ${
                entry.actorId || "system"
              } | ${entry.note || "-"}`
          )
          .join("\n")
      : "No history.";
  const notesText =
    Array.isArray(appeal.notes) && appeal.notes.length > 0
      ? appeal.notes
          .slice(-5)
          .map(
            (entry) =>
              `${entry.createdAt || "Unknown time"} | ${entry.authorId || "staff"}: ${entry.note || "-"}`
          )
          .join("\n")
      : "No notes.";

  await interaction.reply({
    embeds: [
      buildResultEmbed({
        title: `Appeal History #${appealId}`,
        color: 0x5865f2,
        fields: [
          { name: "Status", value: String(appeal.status || "unknown"), inline: true },
          { name: "User", value: String(appeal.userId || "unknown"), inline: true },
          { name: "Decision", value: String(appeal.decision || "pending"), inline: true },
          { name: "History", value: historyText.slice(0, 1024) },
          { name: "Notes", value: notesText.slice(0, 1024) }
        ]
      })
    ],
    flags: MessageFlags.Ephemeral
  });
}
