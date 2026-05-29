const fs = require("node:fs");
const path = require("node:path");
const { runEventOnce } = require("../utils/eventIdempotency");
const { sendAlert } = require("../utils/alerts");

function loadEvents(client) {
  const eventsPath = path.join(__dirname, "..", "events");
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((fileName) => fileName.endsWith(".js"));

  for (const fileName of eventFiles) {
    const filePath = path.join(eventsPath, fileName);
    const event = require(filePath);

    if (!event.name || !event.execute) {
      console.warn(`Skipping invalid event at ${filePath}`);
      continue;
    }

    const invokeEvent = async (...args) => {
      try {
        await runEventOnce({
          eventName: event.name,
          args,
          execute: () => event.execute(...args, client)
        });
      } catch (error) {
        console.error(`Event handler failed [${event.name}]`, error);
        await sendAlert(client, {
          level: "error",
          title: "Event Handler Failure",
          message: `Unhandled error in event \`${event.name}\`.`,
          fields: [
            { name: "Event", value: event.name },
            { name: "File", value: fileName }
          ],
          error,
          dedupeKey: `event_failure:${event.name}:${String(error?.message || error).slice(0, 120)}`,
          ttlMs: 60_000
        }).catch(() => null);
      }
    };

    if (event.once) {
      client.once(event.name, (...args) => invokeEvent(...args));
      continue;
    }

    client.on(event.name, (...args) => invokeEvent(...args));
  }

  console.log(`Loaded ${eventFiles.length} event handlers`);
}

module.exports = {
  loadEvents
};
