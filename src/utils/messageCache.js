const MAX_CACHE_SIZE = 5000;

function getStore(client) {
  if (!client._messageContentCache) {
    client._messageContentCache = new Map();
  }
  return client._messageContentCache;
}

function saveMessage(message) {
  if (!message?.client || !message?.id) {
    return;
  }

  const store = getStore(message.client);
  store.set(message.id, {
    content: message.content || message.cleanContent || "",
    authorTag: message.author?.tag || null,
    authorId: message.author?.id || null,
    channelId: message.channel?.id || null,
    attachments: message.attachments?.size || 0,
    updatedAt: Date.now()
  });

  if (store.size > MAX_CACHE_SIZE) {
    const firstKey = store.keys().next().value;
    if (firstKey) {
      store.delete(firstKey);
    }
  }
}

function getCachedMessage(client, messageId) {
  if (!client || !messageId) {
    return null;
  }
  const store = getStore(client);
  return store.get(messageId) || null;
}

function deleteCachedMessage(client, messageId) {
  if (!client || !messageId) {
    return;
  }
  const store = getStore(client);
  store.delete(messageId);
}

module.exports = {
  deleteCachedMessage,
  getCachedMessage,
  saveMessage
};
