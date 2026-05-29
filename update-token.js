const fs = require("fs");

const newToken = process.argv[2] || process.env.NEW_TOKEN;
if (!newToken) {
  console.error("Usage: node update-token.js <your-bot-token>");
  console.error("Or set NEW_TOKEN environment variable.");
  process.exit(1);
}

let envContent = "";
try {
  envContent = fs.readFileSync(".env", "utf8");
} catch {
  console.error("Could not read .env file");
  process.exit(1);
}

if (envContent.includes("TOKEN=")) {
  envContent = envContent.replace(/TOKEN=.*/g, `TOKEN=${newToken}`);
} else {
  envContent += `\nTOKEN=${newToken}`;
}

fs.writeFileSync(".env", envContent);
console.log("TOKEN updated in .env");
