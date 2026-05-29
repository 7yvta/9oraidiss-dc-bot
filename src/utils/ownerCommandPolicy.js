const ownerHiddenCommandNames = new Set([
  "fixinvites",
  "roleall",
  "rolefilter"
]);

function isOwnerHiddenCommand(commandName) {
  return ownerHiddenCommandNames.has(String(commandName || "").trim().toLowerCase());
}

module.exports = {
  ownerHiddenCommandNames,
  isOwnerHiddenCommand
};
