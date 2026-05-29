const snipes = new Map();

function setSnipe(channelId, payload) {
  if (!channelId) {
    return;
  }
  snipes.set(String(channelId), {
    ...payload,
    deletedAt: Date.now()
  });
}

function getSnipe(channelId) {
  return snipes.get(String(channelId)) || null;
}

module.exports = {
  setSnipe,
  getSnipe
};
