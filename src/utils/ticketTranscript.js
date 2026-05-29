const { AttachmentBuilder } = require("discord.js");

function sanitizeTranscriptText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .trim();
}

function formatMessageContent(message) {
  const text = sanitizeTranscriptText(message.content || message.cleanContent || "");
  const attachments = Array.from(message.attachments?.values?.() || [])
    .map((attachment) => attachment.url)
    .filter(Boolean);

  if (!text && attachments.length === 0) {
    return "[no text content]";
  }

  if (attachments.length === 0) {
    return text;
  }

  const attachmentText = attachments.map((url) => `attachment: ${url}`).join(" | ");
  if (!text) {
    return attachmentText;
  }
  return `${text}\n${attachmentText}`;
}

async function fetchAllMessages(channel, maxMessages = 1000) {
  const collected = [];
  let beforeId = null;

  while (collected.length < maxMessages) {
    const remaining = maxMessages - collected.length;
    const batchSize = Math.min(100, remaining);

    const batch = await channel.messages
      .fetch({
        limit: batchSize,
        ...(beforeId ? { before: beforeId } : {})
      })
      .catch(() => null);

    if (!batch || batch.size === 0) {
      break;
    }

    collected.push(...batch.values());
    beforeId = batch.last()?.id;
  }

  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function createTicketTranscriptAttachment(channel, metadata) {
  const messages = await fetchAllMessages(channel, 1500);
  const lines = [];

  lines.push("TICKET TRANSCRIPT");
  lines.push("=================");
  lines.push(`Guild: ${channel.guild?.name || "Unknown"} (${channel.guildId || "Unknown"})`);
  lines.push(`Ticket Channel: #${channel.name} (${channel.id})`);
  lines.push(`Ticket Type: ${metadata.ticketType || "unknown"}`);
  lines.push(`Opened By: ${metadata.ownerId || "unknown"}`);
  lines.push(`Claimed By: ${metadata.claimedBy || "none"}`);
  lines.push(`Closed By: ${metadata.closedById || "unknown"}`);
  lines.push(`Closed At: ${new Date().toISOString()}`);
  lines.push(`Message Count: ${messages.length}`);
  lines.push("");
  lines.push("MESSAGES");
  lines.push("========");

  for (const message of messages) {
    const authorTag = message.author?.tag || "Unknown User";
    const authorId = message.author?.id || "unknown";
    const timestamp = new Date(message.createdTimestamp || Date.now()).toISOString();
    const content = formatMessageContent(message);
    lines.push(`[${timestamp}] ${authorTag} (${authorId})`);
    lines.push(content);
    lines.push("");
  }

  const transcriptText = lines.join("\n");
  const safeName = channel.name.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40) || "ticket";
  const fileName = `${safeName}-transcript-${Date.now()}.txt`;

  return {
    attachment: new AttachmentBuilder(Buffer.from(transcriptText, "utf8"), {
      name: fileName
    }),
    fileName,
    messageCount: messages.length
  };
}

module.exports = {
  createTicketTranscriptAttachment
};
