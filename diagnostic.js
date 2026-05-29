require("dotenv").config();
console.log("ðŸ” COMPREHENSIVE SYSTEM DIAGNOSTIC\n");

const issues = [];

// Check Node.js version
const nodeVersion = process.version;
console.log(`ðŸ“‹ Node.js Version: ${nodeVersion}`);
if (nodeVersion < 'v18.17.0') {
  issues.push("Node.js version too old. Need v18.17.0 or higher");
}

// Check files exist
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'package.json',
  'src/index.js',
  'src/config.js',
  'src/dashboard.js',
  'src/utils/dmHelper.js',
  '.env'
];

console.log("\nðŸ“ File Check:");
requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`  ${exists ? 'âœ…' : 'âŒ'} ${file}`);
  if (!exists) issues.push(`Missing file: ${file}`);
});

// Check package.json dependencies
console.log("\nðŸ“¦ Dependencies Check:");
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['discord.js', 'express', 'express-session', 'dotenv'];
  
  requiredDeps.forEach(dep => {
    const installed = packageJson.dependencies[dep];
    console.log(`  ${installed ? 'âœ…' : 'âŒ'} ${dep}: ${installed || 'MISSING'}`);
    if (!installed) issues.push(`Missing dependency: ${dep}`);
  });
} catch (error) {
  console.log(`  âŒ Error reading package.json: ${error.message}`);
  issues.push("Cannot read package.json");
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
  if (!exists) issues.push(`Missing environment variable: ${envVar}`);
});

// Test module loading
console.log("\nðŸ§ª Module Loading Test:");
try {
  const config = require('./src/config');
  console.log("  âœ… Config module loaded");
} catch (error) {
  console.log(`  âŒ Config module error: ${error.message}`);
  issues.push(`Config module error: ${error.message}`);
}

try {
  const { Client } = require('discord.js');
  console.log("  âœ… Discord.js loaded");
} catch (error) {
  console.log(`  âŒ Discord.js error: ${error.message}`);
  issues.push(`Discord.js error: ${error.message}`);
}

try {
  const express = require('express');
  console.log("  âœ… Express loaded");
} catch (error) {
  console.log(`  âŒ Express error: ${error.message}`);
  issues.push(`Express error: ${error.message}`);
}

try {
  const { startDashboard } = require('./src/dashboard');
  console.log("  âœ… Dashboard module loaded");
} catch (error) {
  console.log(`  âŒ Dashboard module error: ${error.message}`);
  issues.push(`Dashboard module error: ${error.message}`);
}

try {
  const { sendDM } = require('./src/utils/dmHelper');
  console.log("  âœ… DM helper loaded");
} catch (error) {
  console.log(`  âŒ DM helper error: ${error.message}`);
  issues.push(`DM helper error: ${error.message}`);
}

// Check node_modules
console.log("\nðŸ“‚ Node Modules Check:");
const nodeModulesExists = fs.existsSync('node_modules');
console.log(`  ${nodeModulesExists ? 'âœ…' : 'âŒ'} node_modules directory`);
if (!nodeModulesExists) {
  issues.push("node_modules directory missing - run 'npm install'");
}

// Summary
console.log("\n" + "=".repeat(50));
if (issues.length === 0) {
  console.log("âœ… ALL CHECKS PASSED! System should work.");
  console.log("\nðŸš€ To start the bot:");
  console.log("   node src/index.js");
  console.log("\nðŸŒ Dashboard will be available at:");
  console.log("   https://dc-ticket-bot-production.up.railway.app/login");
  console.log("   Login: admin / e220ca067f6f489b989feb673ac58e41");
} else {
  console.log(`âŒ FOUND ${issues.length} ISSUE(S):`);
  issues.forEach((issue, index) => {
    console.log(`   ${index + 1}. ${issue}`);
  });
  
  console.log("\nðŸ”§ QUICK FIXES:");
  if (issues.some(issue => issue.includes('npm install'))) {
    console.log("   Run: npm install");
  }
  if (issues.some(issue => issue.includes('environment variable'))) {
    console.log("   Check your .env file");
  }
  if (issues.some(issue => issue.includes('Missing file'))) {
    console.log("   Ensure all files are present");
  }
}

console.log("\n" + "=".repeat(50));

