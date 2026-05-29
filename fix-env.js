const fs = require('fs');

// Generate a secure session secret
const crypto = require('crypto');
const sessionSecret = crypto.randomBytes(64).toString('hex');

console.log("🔧 Fixing environment variables...");

// Read current .env file
let envContent = '';
try {
  envContent = fs.readFileSync('.env', 'utf8');
  console.log("✅ Read current .env file");
} catch (error) {
  console.log("❌ Could not read .env file");
  process.exit(1);
}

// Check if DASHBOARD_SESSION_SECRET already exists
if (envContent.includes('DASHBOARD_SESSION_SECRET=')) {
  console.log("✅ DASHBOARD_SESSION_SECRET already exists");
} else {
  // Add the missing environment variable
  envContent += `\nDASHBOARD_SESSION_SECRET=${sessionSecret}`;
  
  try {
    fs.writeFileSync('.env', envContent);
    console.log("✅ Added DASHBOARD_SESSION_SECRET to .env");
  } catch (error) {
    console.log("❌ Could not write to .env file");
    process.exit(1);
  }
}

console.log("\n🎯 Environment fixed!");
console.log("🚀 You can now start the bot with:");
console.log("   node src/index.js");
console.log("\n🌐 Dashboard will be available at:");
console.log("   https://dc-ticket-bot-production.up.railway.app/login");
console.log("   Login: admin / e220ca067f6f489b989feb673ac58e41");
