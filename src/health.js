const express = require('express');
const config = require('./config');

const BOT_NAME = process.env.PUBLIC_BOT_NAME || 'Shadow';
const SERVICE_NAME = process.env.PUBLIC_SERVICE_NAME || 'Vault Marketplace';
const CONTACT_TEXT =
  process.env.PUBLIC_CONTACT_TEXT ||
  'Contact the server owner or bot operator in the Discord server where this bot is installed.';
const LAST_UPDATED = 'June 2, 2026';

function legalPage({ title, subtitle, sections }) {
  const sectionHtml = sections
    .map(
      (section) => `
        <section>
          <h2>${section.title}</h2>
          ${section.body
            .map((paragraph) => `<p>${paragraph}</p>`)
            .join('\n')}
        </section>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070b12;
      --card: #101827;
      --line: #26364f;
      --text: #eef5ff;
      --muted: #9fb2cc;
      --accent: #35d2ff;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(53, 210, 255, 0.16), transparent 32rem),
        linear-gradient(135deg, #06101d 0%, var(--bg) 58%, #03050a 100%);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.6;
    }
    main {
      width: min(920px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 54px 0;
    }
    .card {
      background: rgba(16, 24, 39, 0.88);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
      overflow: hidden;
    }
    header {
      padding: 34px;
      border-bottom: 1px solid var(--line);
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(2rem, 5vw, 3.3rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }
    .sub {
      color: var(--muted);
      max-width: 62ch;
      margin: 0;
    }
    .updated {
      margin-top: 18px;
      display: inline-flex;
      border: 1px solid rgba(53, 210, 255, 0.28);
      color: var(--accent);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 0.9rem;
    }
    section {
      padding: 26px 34px;
      border-bottom: 1px solid rgba(38, 54, 79, 0.72);
    }
    section:last-child {
      border-bottom: 0;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 1.1rem;
      color: #ffffff;
    }
    p {
      margin: 0 0 12px;
      color: var(--muted);
    }
    p:last-child {
      margin-bottom: 0;
    }
    a {
      color: var(--accent);
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }
    nav a {
      text-decoration: none;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 13px;
      color: var(--text);
      background: rgba(255,255,255,0.04);
    }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <header>
        <h1>${title}</h1>
        <p class="sub">${subtitle}</p>
        <div class="updated">Last updated: ${LAST_UPDATED}</div>
        <nav>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/health">Health</a>
        </nav>
      </header>
      ${sectionHtml}
    </div>
  </main>
</body>
</html>`;
}

function buildTermsPage() {
  return legalPage({
    title: `${BOT_NAME} Terms of Service`,
    subtitle: `Rules for using ${BOT_NAME}, a Discord bot used for tickets, moderation, applications, vouches, economy commands, and server utilities for ${SERVICE_NAME}.`,
    sections: [
      {
        title: '1. Acceptance',
        body: [
          `By adding or using ${BOT_NAME}, you agree to these terms and to Discord's own Terms of Service and Community Guidelines. If you do not agree, do not use the bot.`
        ]
      },
      {
        title: '2. Allowed Use',
        body: [
          'You may use the bot for normal Discord server management, tickets, moderation, applications, vouches, logging, economy/fun commands, and related community tools.',
          'You may not use the bot for harassment, scams, spam, illegal activity, token abuse, impersonation, or attempts to bypass Discord rules.'
        ]
      },
      {
        title: '3. Moderation And Tickets',
        body: [
          'Server staff may use bot commands to warn, timeout, kick, ban, manage roles, open tickets, claim tickets, close tickets, review applications, and review appeals when they have the required permissions.',
          'Ticket transcripts, moderation logs, role logs, and related records may be created to protect the server and provide an audit trail.'
        ]
      },
      {
        title: '4. No Warranty',
        body: [
          'The bot is provided as-is. It may be offline, restarted, changed, rate-limited, or unavailable at any time. The operator is not responsible for lost messages, lost configuration, Discord API outages, or third-party hosting problems.'
        ]
      },
      {
        title: '5. Server Responsibility',
        body: [
          'Server owners and administrators are responsible for configuring permissions correctly, moving the bot role high enough for role actions, and deciding which staff roles may use commands.',
          'The bot operator may disable, update, or remove features when needed for safety, stability, or abuse prevention.'
        ]
      },
      {
        title: '6. Contact',
        body: [CONTACT_TEXT]
      }
    ]
  });
}

function buildPrivacyPage() {
  return legalPage({
    title: `${BOT_NAME} Privacy Policy`,
    subtitle: `This explains what data ${BOT_NAME} may process while providing Discord bot features for ${SERVICE_NAME}.`,
    sections: [
      {
        title: '1. Data The Bot May Store',
        body: [
          'The bot may store Discord user IDs, guild IDs, channel IDs, role IDs, message IDs, command usage records, moderation records, warning records, ticket metadata, ticket transcripts, vouch records, application answers, appeal records, invite counts, level/economy balances, and configuration settings.',
          'The bot does not need or store Discord account passwords, user tokens, payment card data, or private login credentials.'
        ]
      },
      {
        title: '2. Why Data Is Used',
        body: [
          'Data is used to run moderation, tickets, logs, role automation, applications, appeals, vouches, economy commands, levels, anti-spam, diagnostics, and server configuration.',
          'Some data is used to prevent abuse, restore settings, detect duplicate events, and keep an audit trail for staff actions.'
        ]
      },
      {
        title: '3. Sharing',
        body: [
          'Data is not sold. Data may be visible to server staff through logs, tickets, transcripts, command replies, or staff-only channels.',
          'Data may be processed by Discord and the hosting provider because the bot runs through Discord APIs and hosted infrastructure.'
        ]
      },
      {
        title: '4. Retention',
        body: [
          'Data may be kept while the bot is installed in a server or while it is needed for moderation, audit logs, appeals, ticket history, or configuration backups.',
          'A server owner can request deletion of server-specific bot data where technically possible.'
        ]
      },
      {
        title: '5. User Choices',
        body: [
          'Users can avoid using optional commands. Users who want a ticket, appeal, application, warning, or vouch record reviewed should contact the server staff.',
          'Because many logs are used for server safety, some records may be retained even if a user leaves the server.'
        ]
      },
      {
        title: '6. Contact',
        body: [CONTACT_TEXT]
      }
    ]
  });
}

function createHealthCheck() {
  const app = express();

  app.get('/', (req, res) => {
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${BOT_NAME}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #070b12;
      color: #eef5ff;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(680px, calc(100vw - 32px));
      background: #101827;
      border: 1px solid #26364f;
      border-radius: 22px;
      padding: 34px;
    }
    h1 { margin: 0 0 10px; font-size: 2.4rem; }
    p { color: #9fb2cc; }
    a {
      display: inline-flex;
      margin: 8px 8px 0 0;
      color: #35d2ff;
    }
  </style>
</head>
<body>
  <main>
    <h1>${BOT_NAME}</h1>
    <p>Discord bot service page.</p>
    <a href="${baseUrl}/terms">Terms of Service</a>
    <a href="${baseUrl}/privacy">Privacy Policy</a>
    <a href="${baseUrl}/health">Health</a>
  </main>
</body>
</html>`);
  });

  app.get('/terms', (req, res) => {
    res.type('html').send(buildTermsPage());
  });

  app.get('/tos', (req, res) => {
    res.redirect(302, '/terms');
  });

  app.get('/privacy', (req, res) => {
    res.type('html').send(buildPrivacyPage());
  });
  
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
