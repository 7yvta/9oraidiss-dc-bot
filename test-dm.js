require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Replace with a valid test user ID
  const testUserId = process.env.TEST_USER_ID || '1474509136606789715'; 
  
  if (!testUserId) {
    console.error("Please set TEST_USER_ID in .env for testing.");
    process.exit(1);
  }

  try {
    const user = await client.users.fetch(testUserId);
    await user.send("This is a test DM from the bot.");
    console.log("DM sent successfully!");
  } catch (error) {
    console.error("Failed to send DM:", error.message);
  } finally {
    process.exit();
  }
});

client.login(process.env.TOKEN);
