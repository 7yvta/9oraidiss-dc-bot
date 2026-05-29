require("dotenv").config();
console.log("🚀 STARTING BOT IMMEDIATELY\n");

// Quick system check
const fs = require('fs');
const path = require('path');

console.log("📋 System Check:");
const requiredFiles = [
  'package.json',
  'src/index.js',
  '.env'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

if (!allFilesExist) {
  console.log("\n❌ Missing required files. Cannot start bot.");
  process.exit(1);
}

// Check environment variables
const requiredEnvVars = ['TOKEN', 'CLIENT_ID'];
let envOk = true;
console.log("\n🔧 Environment Check:");
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  const exists = !!value;
  console.log(`  ${exists ? '✅' : '❌'} ${envVar}: ${exists ? 'SET' : 'MISSING'}`);
  if (!exists) envOk = false;
});

if (!envOk) {
  console.log("\n❌ Missing environment variables. Cannot start bot.");
  process.exit(1);
}

console.log("\n✅ All checks passed. Starting bot...");

// Start the bot
try {
  require('./src/index.js');
} catch (error) {
  console.error("❌ Failed to start bot:", error.message);
  process.exit(1);
}
