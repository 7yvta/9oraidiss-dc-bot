const express = require('express');
const config = require('./config');

function createHealthCheck() {
  const app = express();
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: require('../package.json').version
    });
  });

  // Ready check endpoint
  app.get('/ready', (req, res) => {
    const isReady = config.token && config.clientId;
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      token: !!config.token,
      clientId: !!config.clientId
    });
  });

  return app;
}

module.exports = { createHealthCheck };
