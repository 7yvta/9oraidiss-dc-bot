require("dotenv").config();
console.log("ðŸ” Testing bot startup...");

try {
  console.log("âœ… Loading config...");
  const config = require("./src/config");
  console.log("âœ… Config loaded");
  
  console.log("âœ… Checking Discord.js...");
  const { Client, GatewayIntentBits } = require("discord.js");
  console.log("âœ… Discord.js loaded");
  
  console.log("âœ… Checking dashboard...");
  const { startDashboard } = require("./src/dashboard");
  console.log("âœ… Dashboard loaded");
  
  console.log("âœ… Checking DM helper...");
  const { sendDM } = require("./src/utils/dmHelper");
  console.log("âœ… DM helper loaded");
  
  console.log("ðŸ”§ Environment check:");
  console.log("  TOKEN exists:", !!process.env.TOKEN);
  console.log("  CLIENT_ID exists:", !!process.env.CLIENT_ID);
  console.log("  DASHBOARD_ENABLED:", process.env.DASHBOARD_ENABLED);
  console.log("  DASHBOARD_USERNAME:", !!process.env.DASHBOARD_USERNAME);
  console.log("  DASHBOARD_PASSWORD:", !!process.env.DASHBOARD_PASSWORD);
  
  if (!process.env.TOKEN) {
    console.log("âŒ Missing TOKEN in .env");
  }
  
  if (!process.env.CLIENT_ID) {
    console.log("âŒ Missing CLIENT_ID in .env");
  }
  
  if (!process.env.DASHBOARD_ENABLED) {
    console.log("âŒ DASHBOARD_ENABLED not set to true");
  }
  
  console.log("âœ… All checks passed!");
  
} catch (error) {
  console.error("âŒ Error:", error.message);
  console.error("Stack:", error.stack);
}

