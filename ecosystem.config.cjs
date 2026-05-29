module.exports = {
  apps: [
    {
      name: "dc-ticket-bot",
      script: "src/index.js",
      cwd: "/opt/dc-ticket-bot",
      env: {
        NODE_ENV: "production"
      },
      autorestart: true,
      watch: false,
      max_restarts: 50,
      restart_delay: 5000,
      out_file: "/var/log/dc-ticket-bot/out.log",
      error_file: "/var/log/dc-ticket-bot/error.log",
      time: true
    }
  ]
};

