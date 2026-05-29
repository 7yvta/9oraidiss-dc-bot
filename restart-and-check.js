require("dotenv").config();
const fs = require('fs');
const path = require('path');

console.log("ðŸš€ BOT RESTART & COMMAND VERIFICATION\n");

// Check all command files exist
const commandsDir = path.join(__dirname, 'src', 'commands');
const commandFiles = [];

function scanCommands(dir, category = '') {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      scanCommands(filePath, file);
    } else if (file.endsWith('.js')) {
      const commandPath = path.relative(path.join(__dirname, 'src'), filePath);
      commandFiles.push({
        category: category || 'root',
        file: file,
        path: commandPath,
        fullPath: filePath
      });
    }
  });
}

scanCommands(commandsDir);

console.log("ðŸ“‹ COMMAND FILES FOUND:");
commandFiles.forEach(cmd => {
  console.log(`  âœ… ${cmd.category}/${cmd.file}`);
});

console.log(`\nðŸ“Š Total Commands: ${commandFiles.length}`);

// Check specific moderation commands
const moderationCommands = commandFiles.filter(cmd => cmd.category === 'moderation');
console.log(`\nðŸ”¨ Moderation Commands (${moderationCommands.length}):`);
moderationCommands.forEach(cmd => {
  console.log(`  âœ… /${cmd.file.replace('.js', '')}`);
});

// Check DM helper functions
console.log("\nðŸ“¬ DM Helper Functions:");
try {
  const dmHelper = require('./src/utils/dmHelper');
  const dmFunctions = Object.keys(dmHelper).filter(key => key.startsWith('send') && key.endsWith('DM'));
  dmFunctions.forEach(func => {
    console.log(`  âœ… ${func}()`);
  });
  console.log(`\nðŸ“Š Total DM Functions: ${dmFunctions.length}`);
} catch (error) {
  console.log(`  âŒ Error loading DM helper: ${error.message}`);
}

// Check enhanced dashboard
console.log("\nðŸŽ¨ Enhanced Dashboard:");
try {
  const dashboard = require('./src/dashboard');
  console.log("  âœ… Dashboard module loaded");
} catch (error) {
  console.log(`  âŒ Error loading dashboard: ${error.message}`);
}

// Check config
console.log("\nâš™ï¸ Configuration:");
try {
  const config = require('./src/config');
  console.log(`  âœ… Config loaded`);
  console.log(`  âœ… Dashboard enabled: ${config.dashboardEnabled}`);
  console.log(`  âœ… Token set: ${!!config.token}`);
  console.log(`  âœ… Client ID set: ${!!config.clientId}`);
} catch (error) {
  console.log(`  âŒ Error loading config: ${error.message}`);
}

// Test command loading
console.log("\nðŸ§ª Command Loading Test:");
try {
  const { loadCommands } = require('./src/handlers/loadCommands');
  console.log("  âœ… Command handler loaded");
} catch (error) {
  console.log(`  âŒ Error loading command handler: ${error.message}`);
}

// Check environment variables
console.log("\nðŸ”§ Environment Variables:");
const requiredEnvVars = [
  'TOKEN',
  'CLIENT_ID',
  'DASHBOARD_ENABLED',
  'DASHBOARD_USERNAME',
  'DASHBOARD_PASSWORD',
  'DASHBOARD_SESSION_SECRET'
];

requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  const exists = !!value;
  console.log(`  ${exists ? 'âœ…' : 'âŒ'} ${envVar}: ${exists ? 'SET' : 'MISSING'}`);
});

// Summary
console.log("\n" + "=".repeat(50));
console.log("ðŸŽ¯ BOT READINESS CHECK:");

const issues = [];

if (commandFiles.length === 0) issues.push("No command files found");
if (!process.env.TOKEN) issues.push("Missing TOKEN");
if (!process.env.CLIENT_ID) issues.push("Missing CLIENT_ID");
if (!process.env.DASHBOARD_ENABLED) issues.push("Dashboard not enabled");

try {
  require('./src/utils/dmHelper');
} catch (error) {
  issues.push(`DM helper error: ${error.message}`);
}

try {
  require('./src/dashboard');
} catch (error) {
  issues.push(`Dashboard error: ${error.message}`);
}

if (issues.length === 0) {
  console.log("âœ… ALL SYSTEMS READY!");
  console.log("\nðŸš€ To start the bot:");
  console.log("   node src/index.js");
  console.log("\nðŸŒ Dashboard will be available at:");
  console.log("   https://dc-ticket-bot-production.up.railway.app/login");
  console.log("   Login: admin / e220ca067f6f489b989feb673ac58e41");
  console.log("\nðŸ“‹ Commands with DM notifications:");
  console.log("   /ban, /kick, /warn, /timeout, /unban, /clearwarnings, /managerole, /unmute");
} else {
  console.log(`âŒ FOUND ${issues.length} ISSUE(S):`);
  issues.forEach((issue, index) => {
    console.log(`   ${index + 1}. ${issue}`);
  });
}

console.log("\n" + "=".repeat(50));

