const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const {
  createApplication,
  getApplications,
  updateApplication,
  readApplicationSettings
} = require("../../utils/applicationStore");
const { sendDM } = require("../../utils/dmHelper");
const { syncTriggeredRolesForMember } = require("../../utils/roleTriggerSync");

const REVIEW_CHANNEL_ID =
  process.env.APPLICATION_APPEALS_CHANNEL_ID ||
  process.env.REPORT_CHANNEL_ID ||
  "1483282356520620203";
const REVIEWER_ROLE_IDS = new Set([
  "1479263062065152111",
  "1479263536797454489",
  "1483555926492451118",
  "1479263836778532934"
]);

const DM_TIMEOUT_MS = 10 * 60 * 1000;

const APPLICATION_TYPES = [
  {
    id: "middleman",
    label: "Middleman Application",
    emoji: "📋",
    approvedRoleId: "1479264717972308111"
  },
  {
    id: "content_creator",
    label: "Content Creator Application",
    emoji: "🎥",
    approvedRoleId: "1479887231991939203"
  },
  {
    id: "support_team",
    label: "Support Team Application",
    emoji: "🛠",
    approvedRoleId: "1479264429383225520"
  }
];

const QUESTION_SETS = {
  middleman: [
    {
      id: "why",
      input: "text",
      prompt: [
        "### 📋 Middleman Application",
        "1/5. Why do you want this role?"
      ].join("\n")
    },
    {
      id: "experience",
      input: "yes_no_select",
      prompt: [
        "### 📋 Middleman Application",
        "2/5. Do you have middleman experience?",
        "",
        "-# To answer this question, please select Yes or No from the dropdown below."
      ].join("\n")
    },
    {
      id: "vouches",
      input: "yes_no_select",
      prompt: [
        "### 📋 Middleman Application",
        "3/5. Do you have vouches? (minimum 10 required)",
        "",
        "-# To answer this question, please select Yes or No from the dropdown below."
      ].join("\n")
    },
    {
      id: "collateral",
      input: "yes_no_select",
      prompt: [
        "### 📋 Middleman Application",
        "4/5. Can you provide collateral if needed? (No = auto deny)",
        "",
        "-# To answer this question, please select Yes or No from the dropdown below."
      ].join("\n")
    },
    {
      id: "availability",
      input: "text",
      prompt: [
        "### 📋 Middleman Application",
        "5/5. What is your timezone and your daily availability?"
      ].join("\n")
    }
  ],
  content_creator: [
    {
      id: "discord_username",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "1/9.  Discord Username :",
        "",
        "-# To answer this question,",
        "please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "age",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "2/9. Age:",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "timezone",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "3/9. Time zone / Country:",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "platform",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "4/9. What platform do you create content on? (TikTok, YouTube, Twitch, etc.)",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "followers",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "5/9. How many followers or subscribers do you have?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "content_type",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "6/9. What type of content do you create?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "post_frequency",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "7/9. How often do you post content?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "reason",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "8/9. Why do you want to be a Content Creator for this server?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "promotion_plan",
      input: "text",
      prompt: [
        "### 🎥 Content Creator Application",
        "9/9. How will you help promote the server?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    }
  ],
  support_team: [
    {
      id: "discord_username",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "1/10. Discord Username:",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "age",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "2/10. Age:",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "timezone",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "3/10. Time zone / Country:",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "server_duration",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "4/10. How long have you been in the server?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "activity",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "5/10. How active are you each day?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "staff_experience",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "6/10. Do you have previous support or staff experience?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "reason",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "7/10. Why do you want to join the Support Team?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "assistance_approach",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "8/10. How would you help members who need assistance?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "rule_handling",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "9/10. How would you handle a user breaking the rules?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    },
    {
      id: "additional_info",
      input: "text",
      prompt: [
        "### 🛠 Support Team Application",
        "10/10. Anything else we should know about you?",
        "",
        "-# To answer this question, please send a message to the bot with your response."
      ].join("\n")
    }
  ]
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Start your application process")
    .setDMPermission(false),

  async execute(interaction) {
    const settings = await readApplicationSettings();
    if (!settings.enabled) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Applications Disabled",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "Applications are currently disabled."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const pending = await getApplications({
      guildId: interaction.guildId,
      status: "pending"
    });
    const hasPending = pending.some((app) => app.userId === interaction.user.id);
    if (hasPending) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Application Already Pending",
            color: 0xf59e0b,
            fields: [
              {
                name: "Status",
                value: "You already have a pending application."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply(buildApplicationSelectorPayload());
  },

  buildApplicationSelectorPayload,
  startSelectedApplicationFlow,
  handleApplicationReviewDecision
};

function buildApplicationSelectorPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Application Portal")
    .setDescription(
      [
        "Select an application type below to get started.",
        "",
        "Requirements:",
        "- Read all server rules before applying",
        "- Provide truthful and detailed answers",
        "- High-effort applications are prioritized"
      ].join("\n")
    )
    .setFooter({ text: "Application System" });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("apply_select")
      .setPlaceholder("Select an application type")
      .addOptions(
        APPLICATION_TYPES.map((item) => ({
          label: item.label,
          value: item.id,
          description: `Apply for ${item.label.replace(" Application", "")}`,
          emoji: item.emoji
        }))
      )
  );

  return {
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral
  };
}

async function startSelectedApplicationFlow(interaction, selectedTypeId) {
  const selectedType = APPLICATION_TYPES.find((item) => item.id === selectedTypeId);
  if (!selectedType) {
    await interaction.reply({
      content: "Invalid application type.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const questions = QUESTION_SETS[selectedTypeId];
  if (!questions || questions.length === 0) {
    await interaction.reply({
      content: "Application questions are not configured.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({
    content: "Check your DMs. Your application interview is starting now.",
    flags: MessageFlags.Ephemeral
  });

  const dmChannel = await interaction.user.createDM().catch(() => null);
  if (!dmChannel) {
    await interaction.followUp({
      content: "I could not DM you. Enable DMs and try again.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await dmChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(selectedType.label)
        .setDescription(
          [
            `Server: **${interaction.guild.name}**`,
            "Reply to each question in this DM.",
            "For Yes/No questions, use the dropdown menu."
          ].join("\n")
        )
    ]
  });

  const answers = {};
  let autoDenied = false;

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    let answer = null;

    if (question.input === "yes_no_select") {
      answer = await askYesNoQuestion(
        dmChannel,
        interaction.user.id,
        selectedTypeId,
        question,
        index + 1,
        questions.length
      );
    } else {
      answer = await askTextQuestion(
        dmChannel,
        interaction.user.id,
        question,
        index + 1,
        questions.length
      );
    }

    if (answer == null) {
      await dmChannel.send("Application timed out. Use /apply to start again.");
      return;
    }

    answers[question.id] = answer;

    if (
      selectedTypeId === "middleman" &&
      question.id === "collateral" &&
      answer.toLowerCase() === "no"
    ) {
      autoDenied = true;
      break;
    }
  }

  const application = await createApplication({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    answers,
    applicationType: selectedType.id,
    status: autoDenied ? "rejected" : "pending"
  });

  await dmChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(autoDenied ? 0xed4245 : 0x57f287)
        .setTitle(autoDenied ? "Application Rejected" : "Application Submitted")
        .setDescription(
          autoDenied
            ? "Your application has been automatically rejected because Q4 was answered with No."
            : "Your application has been submitted for review."
        )
        .addFields(
          { name: "Application ID", value: `#${application.id}` },
          { name: "Type", value: selectedType.label }
        )
    ]
  });

  const reviewChannel =
    interaction.guild.channels.cache.get(REVIEW_CHANNEL_ID) ||
    (await interaction.guild.channels.fetch(REVIEW_CHANNEL_ID).catch(() => null));
  if (!reviewChannel || !reviewChannel.isTextBased()) {
    return;
  }

  const reviewEmbed = buildApplicationReviewEmbed({
    applicationId: application.id,
    applicationType: selectedType.label,
    applicantId: interaction.user.id,
    answers,
    questions,
    status: autoDenied ? "AUTO-REJECTED" : "PENDING"
  });

  const payload = {
    content:
      REVIEWER_ROLE_IDS.size > 0
        ? Array.from(REVIEWER_ROLE_IDS)
            .map((roleId) => `<@&${roleId}>`)
            .join(" ")
        : null,
    embeds: [reviewEmbed]
  };

  if (!autoDenied) {
    const reviewActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`apply_review:approve:${application.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`apply_review:reject:${application.id}`)
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
    );
    payload.components = [reviewActions];
  }

  await reviewChannel.send(payload);
}

async function handleApplicationReviewDecision(interaction, action, applicationId) {
  const hasReviewerRole =
    interaction.member.roles.cache.some((role) => REVIEWER_ROLE_IDS.has(role.id)) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!hasReviewerRole) {
    await interaction.reply({
      content: "You are not allowed to review applications.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const list = await getApplications({ guildId: interaction.guildId });
  const application = list.find((item) => item.id === applicationId);
  if (!application) {
    await interaction.reply({
      content: "Application not found.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (application.status !== "pending") {
    await interaction.reply({
      content: `This application is already ${application.status}.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const nextStatus = action === "approve" ? "approved" : "rejected";
  const updated = await updateApplication({
    guildId: interaction.guildId,
    applicationId,
    updates: {
      status: nextStatus,
      reviewedBy: interaction.user.id,
      reviewMessage: `Reviewed by ${interaction.user.tag}`
    }
  });

  if (!updated) {
    await interaction.reply({
      content: "Failed to update application.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  let roleGrantResult = null;
  let triggerSyncResult = null;
  if (nextStatus === "approved") {
    const typeConfig = APPLICATION_TYPES.find(
      (item) => item.id === updated.applicationType
    );
    if (typeConfig?.approvedRoleId) {
      const member = await interaction.guild.members.fetch(updated.userId).catch(() => null);
      if (member) {
        if (member.roles.cache.has(typeConfig.approvedRoleId)) {
          roleGrantResult = {
            ok: true,
            roleId: typeConfig.approvedRoleId,
            alreadyHad: true
          };
        } else {
          try {
            await member.roles.add(typeConfig.approvedRoleId, "Application approved");
            roleGrantResult = {
              ok: true,
              roleId: typeConfig.approvedRoleId,
              alreadyHad: false
            };
          } catch (error) {
            roleGrantResult = {
              ok: false,
              roleId: typeConfig.approvedRoleId,
              error: String(error?.message || error)
            };
          }
        }

        if (roleGrantResult?.ok) {
          triggerSyncResult = await syncTriggeredRolesForMember(
            member,
            "Application approved trigger role sync"
          ).catch(() => null);
        }
      } else {
        roleGrantResult = {
          ok: false,
          roleId: typeConfig.approvedRoleId,
          error: "Could not fetch the member to grant the role."
        };
      }
    }
  }

  const applicant = await interaction.client.users.fetch(updated.userId).catch(() => null);
  if (applicant) {
    await sendDM(interaction.client, applicant, {
      title: "Application Result",
      color: nextStatus === "approved" ? 0x57f287 : 0xed4245,
      description:
        nextStatus === "approved"
          ? "Your application has been approved."
          : "Your application has been rejected.",
      fields: [
        { name: "Application ID", value: updated.id },
        { name: "Reviewed By", value: interaction.user.tag }
      ]
    });
  }

  const sourceEmbed = interaction.message.embeds[0]
    ? EmbedBuilder.from(interaction.message.embeds[0])
    : new EmbedBuilder().setTitle("Application Review");
  sourceEmbed
    .setColor(nextStatus === "approved" ? 0x57f287 : 0xed4245)
    .addFields({
      name: "Review Result",
      value: `${nextStatus.toUpperCase()} by ${interaction.user.tag}`
    });

  await interaction.update({
    embeds: [sourceEmbed],
    components: []
  });

  const followupLines = [`Application ${nextStatus.toUpperCase()}.`];
  if (nextStatus === "approved") {
    if (!roleGrantResult) {
      followupLines.push("Role reward: not configured for this application type.");
    } else if (roleGrantResult.ok) {
      followupLines.push(
        roleGrantResult.alreadyHad
          ? `Role reward: member already had <@&${roleGrantResult.roleId}>.`
          : `Role reward: granted <@&${roleGrantResult.roleId}>.`
      );
      if (triggerSyncResult) {
        if (triggerSyncResult.addedRoleIds?.length > 0) {
          followupLines.push(
            `Trigger roles added: ${triggerSyncResult.addedRoleIds
              .map((roleId) => `<@&${roleId}>`)
              .join(", ")}.`
          );
        }
        if (triggerSyncResult.removedRoleIds?.length > 0) {
          followupLines.push(
            `Trigger roles removed: ${triggerSyncResult.removedRoleIds
              .map((roleId) => `<@&${roleId}>`)
              .join(", ")}.`
          );
        }
        if (triggerSyncResult.failedRoleIds?.length > 0) {
          followupLines.push(
            `Trigger roles failed: ${triggerSyncResult.failedRoleIds
              .map((roleId) => `<@&${roleId}>`)
              .join(", ")}.`
          );
        }
      }
    } else {
      followupLines.push(
        `Role reward: failed to grant <@&${roleGrantResult.roleId}>.`
      );
      followupLines.push(
        "Check bot permissions (`Manage Roles`) and make sure the bot's highest role is above the reward role."
      );
    }
  }

  await interaction
    .followUp({
      content: followupLines.join("\n"),
      flags: MessageFlags.Ephemeral
    })
    .catch(() => null);
}

function buildApplicationReviewEmbed({
  applicationId,
  applicationType,
  applicantId,
  answers,
  questions,
  status
}) {
  const details = questions.map((question) => {
    const rawAnswer = String(answers[question.id] || "No answer");
    return `**${question.prompt.split("\n")[1] || question.id}**\n${rawAnswer}`;
  });

  const chunks = [];
  let active = "";
  for (const entry of details) {
    const next = active ? `${active}\n\n${entry}` : entry;
    if (next.length > 1000) {
      if (active) {
        chunks.push(active);
      }
      active = entry.slice(0, 1000);
      continue;
    }
    active = next;
  }
  if (active) {
    chunks.push(active);
  }

  const embed = new EmbedBuilder()
    .setColor(status === "AUTO-REJECTED" ? 0xed4245 : 0x7289da)
    .setTitle(applicationType)
    .addFields(
      { name: "Applicant", value: `<@${applicantId}> (${applicantId})` },
      { name: "Application ID", value: applicationId, inline: true },
      { name: "Status", value: status, inline: true }
    )
    .setTimestamp();

  chunks.slice(0, 8).forEach((chunk, index) => {
    embed.addFields({
      name: `Answers ${index + 1}`,
      value: chunk
    });
  });

  return embed;
}

async function askTextQuestion(dmChannel, userId, question, questionIndex, totalQuestions) {
  await dmChannel.send(
    `Question ${questionIndex}/${totalQuestions}\n${question.prompt}`
  );

  const reply = await waitForReply(dmChannel, userId);
  if (!reply) {
    return null;
  }

  const input = reply.content.trim();
  if (!input) {
    return "No answer";
  }
  return input;
}

async function askYesNoQuestion(
  dmChannel,
  userId,
  applicationTypeId,
  question,
  questionIndex,
  totalQuestions
) {
  const customId = `apply_yesno:${applicationTypeId}:${question.id}:${Date.now().toString(36)}`;
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Select Yes or No")
    .addOptions([
      {
        label: "Yes",
        value: "yes"
      },
      {
        label: "No",
        value: "no"
      }
    ]);

  const row = new ActionRowBuilder().addComponents(select);
  const prompt = await dmChannel.send({
    content: `Question ${questionIndex}/${totalQuestions}\n${question.prompt}`,
    components: [row]
  });

  try {
    const selection = await prompt.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: DM_TIMEOUT_MS,
      filter: (menu) => menu.user.id === userId && menu.customId === customId
    });

    const answer = selection.values[0] || "no";
    await selection.update({
      content: `Question ${questionIndex}/${totalQuestions}\n${question.prompt}\n\nSelected: **${answer.toUpperCase()}**`,
      components: []
    });
    return answer;
  } catch {
    await prompt.edit({ components: [] }).catch(() => null);
    return null;
  }
}

async function waitForReply(dmChannel, userId) {
  try {
    const collected = await dmChannel.awaitMessages({
      filter: (message) => message.author.id === userId,
      max: 1,
      time: DM_TIMEOUT_MS,
      errors: ["time"]
    });
    return collected.first() || null;
  } catch {
    return null;
  }
}


