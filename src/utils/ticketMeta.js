const { getTicketCategoryMap } = require("./tickets")

function parseTicketTopic(topic) {
  const text = String(topic || "").trim()
  if (!text.includes("ticket-")) {
    return null
  }

  const ownerMatch = text.match(/ticket-owner:([^;]+)/)
  const typeMatch = text.match(/ticket-type:([a-z_]+)/i)
  const claimMatch = text.match(/ticket-claimed:(\d+)/)

  const ownerRaw = ownerMatch ? ownerMatch[1].trim() : null
  const ticketType = typeMatch ? typeMatch[1].toLowerCase() : null
  const claimedBy = claimMatch ? claimMatch[1] : null

  if (!ownerRaw && !ticketType && !claimedBy) {
    return null
  }

  return {
    ownerId: ownerRaw && /^\d+$/.test(ownerRaw) ? ownerRaw : null,
    ticketType,
    claimedBy
  }
}

function inferTicketTypeFromName(channelName) {
  const name = String(channelName || "").toLowerCase()
  if (name.startsWith("support-") || name.startsWith("help-")) {
    return "support"
  }
  if (
    name.startsWith("middleman-") ||
    name.startsWith("mm-") ||
    name.startsWith("mid-")
  ) {
    return "middleman"
  }
  if (name.startsWith("service-") || name.startsWith("srv-")) {
    return "service"
  }
  if (name.startsWith("index-") || name.startsWith("idx-")) {
    return "index"
  }
  if (name.startsWith("role-")) {
    return "role"
  }
  if (name.startsWith("report-")) {
    return "report"
  }
  if (
    name.startsWith("host-") ||
    name.startsWith("giveaway-host-") ||
    name.startsWith("hostgiveaway-")
  ) {
    return "host"
  }
  return null
}

function inferTicketTypeFromCategory(channel) {
  if (!channel?.guild?.id || !channel?.parentId) {
    return null
  }

  const categoryToType = getTicketCategoryMap(channel.guild.id)

  const resolved = categoryToType.get(String(channel.parentId))
  if (!resolved || resolved === "__ambiguous__") {
    return null
  }
  return resolved
}

function resolveTicketContext(channel) {
  if (!channel) {
    return null
  }

  const topicMeta = parseTicketTopic(channel.topic || "")
  if (topicMeta?.ticketType) {
    return {
      ownerId: topicMeta.ownerId || null,
      ticketType: topicMeta.ticketType,
      claimedBy: topicMeta.claimedBy || null,
      source: "topic"
    }
  }

  const byName = inferTicketTypeFromName(channel.name)
  if (byName) {
    return {
      ownerId: topicMeta?.ownerId || null,
      ticketType: byName,
      claimedBy: topicMeta?.claimedBy || null,
      source: "name"
    }
  }

  const byCategory = inferTicketTypeFromCategory(channel)
  if (byCategory) {
    return {
      ownerId: topicMeta?.ownerId || null,
      ticketType: byCategory,
      claimedBy: topicMeta?.claimedBy || null,
      source: "category"
    }
  }

  return null
}

function getTicketMetaFromChannel(channel) {
  if (!channel) {
    return null
  }
  return parseTicketTopic(channel.topic || "")
}

function buildTicketTopic({ ownerId, ticketType, claimedBy }) {
  const parts = []
  if (ownerId) {
    parts.push(`ticket-owner:${ownerId}`)
  }
  if (ticketType) {
    parts.push(`ticket-type:${ticketType}`)
  }
  if (claimedBy) {
    parts.push(`ticket-claimed:${claimedBy}`)
  }
  return parts.join(";")
}

module.exports = {
  parseTicketTopic,
  inferTicketTypeFromName,
  inferTicketTypeFromCategory,
  resolveTicketContext,
  getTicketMetaFromChannel,
  buildTicketTopic
}

