const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const TICKET_COLORS = {
  support: 0x57f287,
  middleman: 0x3b82f6,
  service: 0x5865f2,
  index: 0x3498db,
  role: 0xf1c40f,
  report: 0xe67e22,
  host: 0x9b59b6,
  default: 0x2b2d31
};

const TICKET_LABELS = {
  support: "Support Ticket",
  middleman: "Middleman Ticket",
  service: "Service Ticket",
  index: "Index Ticket",
  role: "Role Request Ticket",
  report: "Report Ticket",
  host: "Host Giveaway Ticket"
};

function getTicketColor(ticketType) {
  return TICKET_COLORS[ticketType] || TICKET_COLORS.default;
}

function getTicketLabel(ticketType) {
  return TICKET_LABELS[ticketType] || "Ticket";
}

function getTicketOpenTitle(ticketType) {
  switch (String(ticketType || "").toLowerCase()) {
    case "middleman":
      return "\u{1F3AB} Middleman Ticket";
    case "service":
      return "\u{1F3AB} Service Ticket";
    case "support":
      return "\u{1F3AB} Support Ticket";
    case "index":
      return "\u{1F3AB} Index Ticket";
    case "role":
      return "\u{1F3AB} Role Request Ticket";
    case "report":
      return "\u{1F3AB} Report Ticket";
    case "host":
      return "\u{1F3AB} Host Giveaway Ticket";
    default:
      return "\u{1F3AB} Ticket Opened";
  }
}

function getTicketFooterText(ticketType) {
  const normalizedType = String(ticketType || "").toLowerCase();
  if (normalizedType === "middleman") {
    return "Powered by 9oraidiss Middleman Service";
  }
  if (normalizedType === "service") {
    return "Powered by 9oraidiss Service Team";
  }
  return "Powered by 9oraidiss Ticket Service";
}

function applyTicketMessageTemplate(rawText, openerId) {
  const userMention = `<@${openerId}>`;
  return String(rawText || "")
    .replaceAll("{user}", userMention)
    .replaceAll("{userMention}", userMention)
    .replaceAll("@user", userMention)
    .trim();
}

function buildTicketControlsRow({ ticketType, claimed = false } = {}) {
  const normalizedType = String(ticketType || "").toLowerCase();

  if (normalizedType === "middleman" || normalizedType === "service") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel(claimed ? "Claimed" : "Claim")
        .setStyle(ButtonStyle.Success)
        .setDisabled(Boolean(claimed)),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel(claimed ? "Claimed" : "Claim")
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(claimed)),
    new ButtonBuilder()
      .setCustomId("ticket_unclaim")
      .setLabel("Unclaim")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!claimed),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
  );
}

function buildTicketOpenEmbed({ ticketType, openerId, introMessage }) {
  const normalizedType = String(ticketType || "").toLowerCase();
  const customIntro = applyTicketMessageTemplate(introMessage, openerId);

  if (customIntro) {
    const openerMention = `<@${openerId}>`;
    const customIntroWithMention = customIntro.includes(openerMention)
      ? customIntro
      : `${openerMention},\n${customIntro}`;

    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(getTicketOpenTitle(ticketType))
      .setDescription(customIntroWithMention)
      .setFooter({ text: getTicketFooterText(ticketType) })
      .setTimestamp();
  }

  let lines = [];
  if (normalizedType === "middleman") {
    lines = [
      `<@${openerId}>, thank you for using our middleman service.`,
      "",
      "Please wait for a middleman to assist you.",
      "",
      "If you have any questions, please let a staff member know."
    ];
  } else if (normalizedType === "service") {
    lines = [
      `<@${openerId}>, thank you for using our service team.`,
      "",
      "Please wait for a service staff member to assist you.",
      "",
      "If you have any questions, please let a staff member know."
    ];
  } else if (normalizedType === "support") {
    lines = [
      `<@${openerId}>, thank you for contacting support.`,
      "",
      "A support team member will assist you shortly.",
      "",
      "Please explain your issue clearly so we can help faster."
    ];
  } else if (normalizedType === "index") {
    lines = [
      `<@${openerId}>, thank you for using our index service.`,
      "",
      "One of our index team members will help you soon.",
      "",
      "Please share the details you need in this ticket."
    ];
  } else {
    const label = getTicketLabel(ticketType);
    lines = [
      `<@${openerId}> opened a ${label.toLowerCase()}.`,
      "",
      "Please wait for a staff member to assist you."
    ];
  }

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(getTicketOpenTitle(ticketType))
    .setDescription(lines.join("\n"))
    .setFooter({ text: getTicketFooterText(ticketType) })
    .setTimestamp();
}

function buildTicketEventEmbed({ title, description, ticketType, color }) {
  return new EmbedBuilder()
    .setColor(color || getTicketColor(ticketType))
    .setTitle(title)
    .setDescription(String(description || "").trim() || "Ticket update.")
    .setFooter({ text: getTicketFooterText(ticketType) })
    .setTimestamp();
}

async function updateTicketControlMessage(channel, { ticketType, claimed = false } = {}) {
  if (!channel?.messages?.fetch) {
    return false;
  }

  const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!recent) {
    return false;
  }

  const targetMessage = recent.find((message) => {
    if (!message?.author?.id || message.author.id !== channel.client?.user?.id) {
      return false;
    }
    return message.components?.some((row) =>
      row.components?.some((component) =>
        ["ticket_claim", "ticket_unclaim", "ticket_close"].includes(component.customId)
      )
    );
  });

  if (!targetMessage) {
    return false;
  }

  const inferredType =
    ticketType ||
    (String(channel?.topic || "").includes("ticket-type:middleman")
      ? "middleman"
      : String(channel?.topic || "").includes("ticket-type:service")
        ? "service"
      : undefined);

  await targetMessage
    .edit({
      components: [buildTicketControlsRow({ ticketType: inferredType, claimed })]
    })
    .catch(() => null);

  return true;
}

module.exports = {
  getTicketLabel,
  getTicketColor,
  buildTicketControlsRow,
  buildTicketOpenEmbed,
  buildTicketEventEmbed,
  updateTicketControlMessage
};

