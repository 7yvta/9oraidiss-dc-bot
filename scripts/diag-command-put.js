require("dotenv").config();

async function main() {
  const appId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  const token = process.env.TOKEN;
  if (!appId || !guildId || !token) {
    throw new Error("Missing CLIENT_ID, GUILD_ID, or TOKEN.");
  }

  const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const body = [{ name: "pingtest", description: "ping test command" }];

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text = await response.text();
    console.log("STATUS", response.status);
    console.log("BODY", text.slice(0, 1000));
  } catch (error) {
    clearTimeout(timeout);
    console.error("ERROR", error?.name, error?.message || error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("FATAL", error?.message || error);
  process.exit(1);
});
