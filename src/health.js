const express = require('express');
const config = require('./config');
const {
  getGuildOverridesSync,
  getGuildSettingsSync,
  patchGuildOverrides
} = require('./utils/guildSettings');
const { getTicketTypeConfig } = require('./utils/tickets');

const BOT_NAME = process.env.PUBLIC_BOT_NAME || 'Vault';
const SERVICE_NAME = process.env.PUBLIC_SERVICE_NAME || 'Vault Marketplace';
const CONTACT_TEXT =
  process.env.PUBLIC_CONTACT_TEXT ||
  'Contact the server owner or bot operator in the Discord server where this bot is installed.';
const LAST_UPDATED = 'June 2, 2026';

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveServerUrl() {
  return trimUrl(
    process.env.PUBLIC_SERVER_URL ||
      process.env.DISCORD_SERVER_URL ||
      process.env.SERVER_INVITE_URL ||
      ''
  );
}

function resolveContactProfileUrl() {
  const explicit = trimUrl(
    process.env.PUBLIC_CONTACT_PROFILE_URL ||
      process.env.DISCORD_PROFILE_URL ||
      process.env.CONTACT_PROFILE_URL ||
      ''
  );
  if (explicit) {
    return explicit;
  }

  const ownerId = String(process.env.BOT_OWNER_ID || config.botOwnerId || '').trim();
  return ownerId ? `https://discord.com/users/${ownerId}` : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function legalPage({ title, subtitle, sections }) {
  const serverUrl = resolveServerUrl();
  const contactProfileUrl = resolveContactProfileUrl();
  const sectionHtml = sections
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section.title)}</h2>
          ${section.body
            .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
            .join('\n')}
        </section>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
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
        <h1>${escapeHtml(title)}</h1>
        <p class="sub">${escapeHtml(subtitle)}</p>
        <div class="updated">Last updated: ${LAST_UPDATED}</div>
        <nav>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          ${serverUrl ? `<a href="${escapeHtml(serverUrl)}" rel="noopener noreferrer">Join Server</a>` : ''}
          ${contactProfileUrl ? `<a href="${escapeHtml(contactProfileUrl)}" rel="noopener noreferrer">Contact Profile</a>` : ''}
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
          `By inviting, configuring, or using ${BOT_NAME}, you agree to these Terms of Service.`,
          'You also agree to follow Discord Terms of Service, Discord Community Guidelines, and the rules of the Discord server where the bot is installed.',
          'If you do not agree with these terms, do not use the bot commands, panels, tickets, applications, appeals, vouches, or related features.'
        ]
      },
      {
        title: '2. Bot Purpose',
        body: [
          `${BOT_NAME} is built for Discord community management. It may provide ticket panels, ticket claim and close tools, transcript logs, applications, appeal review tools, moderation commands, role management, role triggers, welcome and leave logs, vouches, levels, economy commands, diagnostics, and utility commands.`,
          'Features may be changed, disabled, renamed, or removed when needed for safety, performance, abuse prevention, or server configuration cleanup.',
          'The bot is not a payment processor, marketplace, escrow service, legal service, or official Discord service.'
        ]
      },
      {
        title: '3. Server Authority',
        body: [
          'Each server owner or authorized administrator is responsible for deciding which staff roles can use bot commands and which channels receive logs.',
          'Server staff may use the bot to moderate members, manage tickets, review applications, review appeals, manage warnings, manage roles, and enforce server rules.',
          'The bot operator can restrict or disable features if a server uses the bot in a way that creates risk, abuse, spam, or violation of Discord rules.'
        ]
      },
      {
        title: '4. Command Access And Permissions',
        body: [
          'Some commands are public. Some commands are staff-only, owner-only, or limited to configured roles. The bot may deny a command even if Discord shows it in the command list.',
          'Role management is limited by Discord role hierarchy. The bot cannot manage roles above its own highest role, and staff cannot manage protected roles unless the server configuration allows it.',
          'Do not try to bypass command permissions, exploit button interactions, abuse ticket panels, or impersonate staff actions.'
        ]
      },
      {
        title: '5. Tickets, Transcripts, And Panels',
        body: [
          'Ticket panels may create private channels for support, middleman, index, role request, report, host giveaway, or other configured ticket types.',
          'Ticket staff may claim, unclaim, add users, remove users, transfer, close, or review tickets when they have permission.',
          'When a ticket closes, the bot may create a transcript or summary containing the ticket creator, claimed staff, closing staff, timestamps, and ticket messages where available.',
          'Members should not open spam tickets, fake reports, scam reports without context, or tickets unrelated to the panel purpose.'
        ]
      },
      {
        title: '6. Moderation Actions',
        body: [
          'Moderation commands may include warning, clearing warnings, timeout, untimeout, mute, unmute, kick, ban, unban, role add, role remove, and similar actions.',
          'Moderators are expected to provide valid reasons when required by the bot. Reasons may be logged and may be sent to the affected user by direct message when possible.',
          'The bot may fail to DM a user if the user has DMs closed, has blocked the bot, or Discord prevents the delivery.'
        ]
      },
      {
        title: '7. Applications And Appeals',
        body: [
          'Application and appeal systems may collect answers submitted by users. Staff may approve, reject, note, or review these submissions.',
          'Approved applications may grant roles. Rejected applications may be logged with the decision reason.',
          'Appeal approval or rejection may trigger a DM to the user and may update moderation state, such as unbanning a user when the server configuration allows it.'
        ]
      },
      {
        title: '8. Vouches And Reputation',
        body: [
          'Vouch features are used for community reputation and feedback. Vouches may include the vouched user, author, reason, type, count, timestamps, and optional scam-vouch classification.',
          'Fake vouches, spam vouches, harassment, impersonation, or manipulated reputation activity may be removed or moderated by staff.',
          'The bot may post automated vouches or vouch-style records only when enabled by the server configuration.'
        ]
      },
      {
        title: '9. Economy, Levels, And Fun Commands',
        body: [
          'Economy and level commands are virtual Discord server features. Coins, wallet balance, bank balance, rank, XP, work rewards, daily rewards, rob outcomes, and coinflip results have no real-world cash value.',
          'The server may reset, change, or remove virtual balances, cooldowns, rewards, and leaderboards at any time.',
          'Abusing cooldowns, alt accounts, bot accounts, automation, or exploits may lead to moderation or data reset.'
        ]
      },
      {
        title: '10. Prohibited Use',
        body: [
          'You may not use the bot for scams, phishing, malware, token collection, credential theft, spam, raids, harassment, doxxing, hate, illegal content, or evasion of Discord enforcement.',
          'You may not use the bot to impersonate another person, forge staff decisions, fake evidence, or pressure users into unsafe trades.',
          'You may not intentionally overload the bot, abuse command cooldowns, spam panels, or trigger repeated duplicate events.'
        ]
      },
      {
        title: '11. Logs And Audit Trail',
        body: [
          'The bot may create logs for moderation actions, deleted or edited messages, role changes, member joins or leaves, ticket actions, command usage, configuration changes, appeals, applications, and security events.',
          'Logs help server staff investigate abuse, restore context, and prove who performed an action.',
          'Some logs may be protected from deletion or may be restored if the server configuration enables that behavior.'
        ]
      },
      {
        title: '12. Availability And Reliability',
        body: [
          'The bot is provided as-is. It may be offline, restarted, rate-limited, updated, moved to another host, or unavailable because of Discord API issues, hosting problems, internet outages, or maintenance.',
          'The operator does not guarantee uninterrupted service, permanent message storage, permanent command availability, or perfect transcript capture.',
          'Server owners should keep backups of important configuration and not rely on the bot as the only record for high-risk moderation decisions.'
        ]
      },
      {
        title: '13. Third-Party Services',
        body: [
          'The bot uses Discord APIs and may run on third-party hosting infrastructure. Discord and hosting providers may process technical data needed for the bot to function.',
          'Links posted by the bot, such as Terms, Privacy, appeal pages, or server pages, may be hosted by third-party services.',
          'The bot is not affiliated with Discord unless explicitly stated by Discord.'
        ]
      },
      {
        title: '14. Limitation Of Liability',
        body: [
          'To the maximum extent allowed by law, the bot operator is not responsible for indirect loss, lost trades, lost virtual items, lost messages, lost reputation, server configuration mistakes, user disputes, Discord outages, or hosting failures.',
          'Server staff and users are responsible for verifying trades, evidence, permissions, and decisions before taking action.'
        ]
      },
      {
        title: '15. Removal Or Termination',
        body: [
          'A server owner can remove the bot from a server at any time.',
          'The bot operator may block a server, leave a server, or disable access if the bot is abused, used unsafely, or used against Discord rules.',
          'Removing the bot may not immediately delete every log or backup record if those records are needed for safety, abuse prevention, or technical recovery.'
        ]
      },
      {
        title: '16. Updates To These Terms',
        body: [
          'These terms may be updated when features, hosting, security practices, or server requirements change.',
          `The Last updated date at the top of this page shows when this page was last changed. Continued use of ${BOT_NAME} after changes means you accept the updated terms.`
        ]
      },
      {
        title: '17. Contact',
        body: [
          CONTACT_TEXT,
          resolveServerUrl()
            ? `Server link: ${resolveServerUrl()}`
            : 'Server link: not configured yet.',
          resolveContactProfileUrl()
            ? `Contact profile: ${resolveContactProfileUrl()}`
            : 'Contact profile: not configured yet.'
        ]
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
        title: '1. Overview',
        body: [
          `This Privacy Policy explains what information ${BOT_NAME} may process when it is installed in a Discord server or when a user interacts with its commands, buttons, menus, modals, panels, tickets, logs, or web pages.`,
          'The bot is designed for server operations. Most data is Discord server data needed to provide moderation, tickets, applications, vouches, logs, levels, economy, and configuration features.',
          'The bot does not ask for Discord passwords, Discord user tokens, payment card details, or private account login credentials.'
        ]
      },
      {
        title: '2. Data The Bot May Process',
        body: [
          'The bot may store Discord user IDs, guild IDs, channel IDs, role IDs, message IDs, command usage records, moderation records, warning records, ticket metadata, ticket transcripts, vouch records, application answers, appeal records, invite counts, level/economy balances, and configuration settings.',
          'The bot may also process usernames, display names, nicknames, avatars, role names, channel names, timestamps, command options, reasons entered by staff, and message content connected to a bot feature.',
          'Some data is stored in configuration files, databases, backups, or logs depending on how the server is hosted and configured.'
        ]
      },
      {
        title: '3. Message Content And Commands',
        body: [
          'The bot may read message content when needed for prefix commands, moderation filters, AFK replies, deleted-message logs, edited-message logs, ticket transcripts, vouch detection, anti-spam, or other enabled features.',
          'Slash command options, prefix command arguments, button presses, select menu choices, and modal submissions may be stored or logged to perform the requested action.',
          'Messages unrelated to enabled bot features are not intentionally collected for resale or advertising.'
        ]
      },
      {
        title: '4. Tickets, Applications, And Appeals',
        body: [
          'Ticket systems may store the ticket opener, ticket type, channel ID, claimed staff, added users, removed users, transfer actions, close actions, transcript summaries, and timestamps.',
          'Application systems may store user answers, application type, reviewer, approval or rejection result, and review notes.',
          'Appeal systems may store the appealing user, reason, extra details, reviewer, approval or rejection result, staff notes, and unban audit details where applicable.'
        ]
      },
      {
        title: '5. Moderation And Safety Logs',
        body: [
          'Moderation logs may store warnings, cleared warnings, timeouts, mutes, kicks, bans, unbans, role changes, protected-role events, audit-log actor details, reasons, timestamps, and affected users.',
          'Safety logs may store deleted message information, edited message information, member join or leave events, suspicious role changes, protected log-channel deletion attempts, and bot diagnostic events.',
          'These logs are used so staff can understand what happened and prevent abuse.'
        ]
      },
      {
        title: '6. Role, Invite, Level, And Economy Data',
        body: [
          'Role trigger features may store role IDs, trigger rules, auto-added roles, protected roles, and member role state needed to keep server roles consistent.',
          'Invite features may store invite codes, inviter IDs, invite counts, and join tracking when configured.',
          'Level and economy features may store XP, level, wallet balance, bank balance, cooldown timestamps, command outcomes, leaderboard data, and reward history.'
        ]
      },
      {
        title: '7. Why Data Is Used',
        body: [
          'Data is used to run moderation, tickets, logs, role automation, applications, appeals, vouches, economy commands, levels, anti-spam, diagnostics, and server configuration.',
          'Data is also used to prevent abuse, deduplicate repeated events, restore configuration, enforce cooldowns, maintain permission checks, and keep an audit trail for staff actions.',
          'The bot may use stored data to show command results, leaderboards, warning lists, transcript summaries, vouch counts, ticket status, and diagnostics.'
        ]
      },
      {
        title: '8. Visibility And Sharing',
        body: [
          'Data is not sold. Data may be visible to server staff through logs, tickets, transcripts, command replies, or staff-only channels.',
          'Some command replies may be public in the channel where the command is used. Some replies may be ephemeral and visible only to the command user.',
          'Data may be processed by Discord and the hosting provider because the bot runs through Discord APIs and hosted infrastructure.',
          'Data may be shared with server owners or authorized staff when needed for moderation, safety, appeal review, abuse prevention, or technical support.'
        ]
      },
      {
        title: '9. Third-Party Infrastructure',
        body: [
          'The bot depends on Discord APIs. Discord controls Discord account data, guild data, message delivery, command registration, and API availability.',
          'The bot may run on hosting services such as Railway, Viirless, Quaxly, or another provider selected by the operator. Those providers may process technical logs, IP-level infrastructure data, runtime logs, and deployment data.',
          'If a web page is hosted for Terms, Privacy, health checks, or forms, the host may process normal web request information.'
        ]
      },
      {
        title: '10. Retention',
        body: [
          'Data may be kept while the bot is installed in a server or while it is needed for moderation, audit logs, appeals, ticket history, vouch history, economy state, level state, invite tracking, or configuration backups.',
          'Some operational data may be deleted automatically, while other records may stay until a server owner or bot operator removes them.',
          'Ticket transcripts, moderation records, and safety logs may be retained longer because they are used to resolve disputes, investigate abuse, and protect the server.'
        ]
      },
      {
        title: '11. Backups',
        body: [
          'The bot may create backups of configuration or data to recover from crashes, bad updates, accidental deletion, or corrupt files.',
          'Backups may include server configuration, ticket settings, role trigger settings, warning records, vouch records, level or economy data, and other operational data.',
          'Backups are not intended for public access.'
        ]
      },
      {
        title: '12. User Choices',
        body: [
          'Users can avoid using optional commands. Users who want a ticket, appeal, application, warning, or vouch record reviewed should contact the server staff.',
          'Users can ask server staff to review records connected to them, such as warnings, vouches, tickets, or applications.',
          'Because many logs are used for server safety, some records may be retained even if a user leaves the server.'
        ]
      },
      {
        title: '13. Server Owner Controls',
        body: [
          'Server owners can remove the bot from their server, change log channels, disable features, change role permissions, clear settings, or request deletion of server-specific bot data where technically possible.',
          'Some data may remain in Discord messages already sent to server channels unless server staff delete those messages.',
          'If a server owner changes configuration, the bot may keep older backup versions for recovery until those backups are cleaned.'
        ]
      },
      {
        title: '14. Security',
        body: [
          'The bot uses reasonable technical controls for a community Discord bot, such as permission checks, role checks, owner checks, cooldowns, and protected logs where configured.',
          'No system is perfectly secure. Server owners should not store passwords, tokens, private keys, payment information, or sensitive personal information in bot commands or tickets.',
          'If you believe bot data is exposed or abused, contact the server owner or bot operator quickly.'
        ]
      },
      {
        title: '15. Minors And Sensitive Information',
        body: [
          'The bot is intended for Discord servers and should be used according to Discord age and safety rules.',
          'Users should not submit sensitive personal information through tickets, applications, appeals, or commands.',
          'Server staff should remove sensitive personal information if users accidentally submit it.'
        ]
      },
      {
        title: '16. Data Removal Requests',
        body: [
          'A user who wants data reviewed or removed should contact the staff of the Discord server where the data was created.',
          'A server owner can contact the bot operator to request removal of server-specific bot data where technically possible.',
          'Some records may be retained if needed for abuse prevention, moderation history, security, legal compliance, or technical integrity.'
        ]
      },
      {
        title: '17. Changes To This Policy',
        body: [
          'This policy may be updated when the bot changes features, hosting, database design, logging behavior, security controls, or legal requirements.',
          `The Last updated date at the top of this page shows when this page was last changed. Continued use of ${BOT_NAME} after changes means the updated policy applies.`
        ]
      },
      {
        title: '18. Contact',
        body: [
          CONTACT_TEXT,
          resolveServerUrl()
            ? `Server link: ${resolveServerUrl()}`
            : 'Server link: not configured yet.',
          resolveContactProfileUrl()
            ? `Contact profile: ${resolveContactProfileUrl()}`
            : 'Contact profile: not configured yet.'
        ]
      }
    ]
  });
}

function buildAppealPage() {
  const serverUrl = resolveServerUrl();
  return legalPage({
    title: `${BOT_NAME} Ban Appeal`,
    subtitle: `Use this page if you received a ban DM from ${BOT_NAME} and need to submit an appeal for ${SERVICE_NAME}.`,
    sections: [
      {
        title: 'How To Submit',
        body: [
          serverUrl
            ? 'Join the Discord server from the button above, then use the /appeal command with your reason.'
            : 'Contact server staff or the bot owner, then use the /appeal command in a server where the bot is available.',
          'Include clear context, proof if needed, and the reason you believe the ban should be reviewed.'
        ]
      },
      {
        title: 'What Happens Next',
        body: [
          'Staff review submitted appeals in the configured applications and appeals channel.',
          'If approved, the bot can unban you and send a DM with the result. If rejected, you may submit another appeal later if staff allow it.'
        ]
      },
      {
        title: 'Important',
        body: [
          'Do not spam appeals, submit fake proof, or harass staff. Abuse can make the appeal process slower or cause staff to ignore repeat requests.',
          CONTACT_TEXT
        ]
      }
    ]
  });
}

function getDashboardLinks(req) {
  const baseUrl = trimUrl(
    config.publicBaseUrl ||
      process.env.PUBLIC_BASE_URL ||
      `${req.protocol}://${req.get('host')}`
  );
  return {
    botName: BOT_NAME,
    serviceName: SERVICE_NAME,
    baseUrl,
    termsUrl: `${baseUrl}/terms`,
    privacyUrl: `${baseUrl}/privacy`,
    appealUrl: `${baseUrl}/appeal`,
    serverUrl: resolveServerUrl(),
    contactProfileUrl: resolveContactProfileUrl()
  };
}

function getDashboardApiToken() {
  return String(
    process.env.DASHBOARD_API_TOKEN ||
      process.env.DASHBOARD_TOKEN ||
      process.env.ADMIN_DASHBOARD_TOKEN ||
      ''
  ).trim();
}

function readDashboardToken(req) {
  const auth = String(req.get('authorization') || '').trim();
  if (/^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim();
  }
  return String(req.get('x-dashboard-token') || '').trim();
}

function requireDashboardAuth(req, res, next) {
  const expected = getDashboardApiToken();
  if (!expected) {
    res.status(503).json({
      ok: false,
      reason: 'dashboard_api_token_missing',
      message: 'Set DASHBOARD_API_TOKEN on the bot host before saving dashboard changes.'
    });
    return;
  }

  const provided = readDashboardToken(req);
  if (!provided || provided !== expected) {
    res.status(401).json({ ok: false, reason: 'invalid_dashboard_token' });
    return;
  }

  next();
}

function configureDashboardCors(app) {
  app.use('/api/dashboard', (req, res, next) => {
    const origin = req.get('origin');
    const configured = String(process.env.DASHBOARD_ALLOWED_ORIGINS || '*')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const allowAll = configured.includes('*');
    const allowedOrigin = allowAll ? '*' : configured.includes(origin) ? origin : '';

    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type,X-Dashboard-Token'
    );

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });
}

const idSettingKeys = new Set([
  'modLogChannelId',
  'reportChannelId',
  'serverUpdateChannelId',
  'ticketTranscriptLogId',
  'welcomeChannelId',
  'levelUpChannelId',
  'rulesChannelId',
  'memberRoleId',
  'autoMessageChannelId',
  'autoVouchChannelId'
]);

const boolSettingKeys = new Set([
  'ownerOnlyMode',
  'welcomeEnabled',
  'autoMemberRoleEnabled',
  'stickyMemberRoleEnabled',
  'automodEnabled',
  'blockInvites',
  'blockLinks',
  'autoresponderEnabled',
  'autoMessageEnabled',
  'autoVouchEnabled'
]);

const textSettingKeys = new Set([
  'welcomeMessageTemplate',
  'autoMessageContent',
  'warnConsequence'
]);

const numberSettingKeys = new Set([
  'messageXpMin',
  'messageXpMax',
  'messageXpCooldownSeconds',
  'levelCurve',
  'levelCurveMultiplier',
  'levelMax',
  'autoMessageIntervalMinutes',
  'autoVouchIntervalDays',
  'autoVouchPerCycle'
]);

const roleListSettingKeys = new Set([
  'botAdminRoleIds',
  'fullCommandRoleIds',
  'timeoutOnlyRoleIds',
  'prefixAnywhereRoleIds',
  'confirmationRoleIds',
  'ticketForceClaimRoleIds',
  'hostGiveawayRoleIds',
  'reportHandlerRoleIds'
]);

const idListSettingKeys = new Set([
  'autoVouchMemberIds'
]);

const textListSettingKeys = new Set([
  'blockedWords',
  'disabledCommands',
  'autoVouchMmReasons'
]);

const ticketFieldMap = {
  support: {
    panel: 'supportTicketPanelChannelId',
    category: 'supportTicketCategoryId',
    roles: 'supportTeamRoleIds'
  },
  middleman: {
    panel: 'middlemanTicketPanelChannelId',
    category: 'middlemanTicketCategoryId',
    roles: 'middlemanTeamRoleIds'
  },
  index: {
    panel: 'indexTicketPanelChannelId',
    category: 'indexTicketCategoryId',
    roles: 'indexTeamRoleIds'
  },
  role: {
    panel: 'roleRequestTicketPanelChannelId',
    category: 'roleRequestTicketCategoryId',
    roles: 'roleRequestTeamRoleIds'
  },
  report: {
    panel: 'reportTicketPanelChannelId',
    category: 'reportTicketCategoryId',
    roles: 'reportTeamRoleIds'
  },
  host: {
    panel: 'hostGiveawayTicketPanelChannelId',
    category: 'hostGiveawayTicketCategoryId',
    roles: 'hostGiveawayTeamRoleIds'
  }
};

function normalizeId(value) {
  return String(value || '').replace(/[^\d]/g, '').trim();
}

function normalizeRoleIds(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[,\s]+/)
        .filter(Boolean);
  return [...new Set(source.map(normalizeId).filter(Boolean))];
}

function normalizeBool(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on', 'enabled'].includes(value.toLowerCase());
  }
  return Boolean(value);
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTextList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\n,]+/)
        .filter(Boolean);
  return [...new Set(source.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function pickDashboardSettings(settings) {
  const result = {};
  for (const key of idSettingKeys) {
    if (settings[key] !== undefined) {
      result[key] = settings[key];
    }
  }
  for (const key of boolSettingKeys) {
    result[key] = Boolean(settings[key]);
  }
  for (const key of textSettingKeys) {
    if (settings[key] !== undefined) {
      result[key] = settings[key];
    }
  }
  for (const key of numberSettingKeys) {
    if (settings[key] !== undefined) {
      result[key] = settings[key];
    }
  }
  for (const key of roleListSettingKeys) {
    result[key] = Array.isArray(settings[key]) ? settings[key] : [];
  }
  for (const key of idListSettingKeys) {
    result[key] = Array.isArray(settings[key]) ? settings[key] : [];
  }
  for (const key of textListSettingKeys) {
    result[key] = Array.isArray(settings[key]) ? settings[key] : [];
  }
  result.roleTriggerRules = Array.isArray(settings.roleTriggerRules)
    ? settings.roleTriggerRules
    : [];
  return result;
}

function buildDashboardConfig(guildId, req) {
  const settings = getGuildSettingsSync(guildId);
  return {
    ok: true,
    guildId,
    links: getDashboardLinks(req),
    settings: pickDashboardSettings(settings),
    tickets: getTicketTypeConfig(guildId),
    overrides: getGuildOverridesSync(guildId)
  };
}

function buildDashboardPatch(body) {
  const patch = {};

  if (body.settings && typeof body.settings === 'object') {
    for (const key of idSettingKeys) {
      if (body.settings[key] === undefined) {
        continue;
      }
      patch[key] = normalizeId(body.settings[key]);
    }

    for (const key of boolSettingKeys) {
      if (body.settings[key] !== undefined) {
        patch[key] = normalizeBool(body.settings[key]);
      }
    }

    for (const key of textSettingKeys) {
      if (body.settings[key] !== undefined) {
        patch[key] = String(body.settings[key] || '').slice(0, 1200).trim();
      }
    }

    for (const key of numberSettingKeys) {
      if (body.settings[key] !== undefined) {
        patch[key] = normalizeNumber(body.settings[key]);
      }
    }

    for (const key of roleListSettingKeys) {
      if (body.settings[key] !== undefined) {
        patch[key] = normalizeRoleIds(body.settings[key]);
      }
    }

    for (const key of idListSettingKeys) {
      if (body.settings[key] !== undefined) {
        patch[key] = normalizeRoleIds(body.settings[key]);
      }
    }

    for (const key of textListSettingKeys) {
      if (body.settings[key] !== undefined) {
        patch[key] = normalizeTextList(body.settings[key]);
      }
    }

    if (Array.isArray(body.settings.roleTriggerRules)) {
      patch.roleTriggerRules = body.settings.roleTriggerRules
        .map((rule) => {
          if (!rule || typeof rule !== 'object') {
            return null;
          }
          return {
            triggerRoleIds: normalizeRoleIds(rule.triggerRoleIds),
            assignRoleIds: normalizeRoleIds(rule.assignRoleIds),
            removeWhenMissing: rule.removeWhenMissing !== false
          };
        })
        .filter((rule) => rule && rule.triggerRoleIds.length > 0 && rule.assignRoleIds.length > 0);
    }
  }

  if (body.tickets && typeof body.tickets === 'object') {
    const ticketTypes = {};
    for (const [type, fields] of Object.entries(ticketFieldMap)) {
      const incoming = body.tickets[type];
      if (!incoming || typeof incoming !== 'object') {
        continue;
      }

      if (incoming.panelChannelId !== undefined) {
        patch[fields.panel] = normalizeId(incoming.panelChannelId);
      }
      if (incoming.categoryId !== undefined) {
        patch[fields.category] = normalizeId(incoming.categoryId);
      }
      if (incoming.teamRoleIds !== undefined) {
        patch[fields.roles] = normalizeRoleIds(incoming.teamRoleIds);
      }

      const typePatch = {};
      if (incoming.enabled !== undefined) {
        typePatch.enabled = normalizeBool(incoming.enabled);
      }
      if (incoming.buttonLabel !== undefined) {
        typePatch.buttonLabel = String(incoming.buttonLabel || '').slice(0, 80).trim();
      }
      if (incoming.introMessage !== undefined) {
        typePatch.introMessage = String(incoming.introMessage || '').slice(0, 900).trim();
      }
      if (Object.keys(typePatch).length > 0) {
        ticketTypes[type] = typePatch;
      }
    }

    if (Object.keys(ticketTypes).length > 0) {
      patch.ticketTypes = ticketTypes;
    }
  }

  return patch;
}

function createHealthCheck() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  configureDashboardCors(app);

  app.get('/', (req, res) => {
    const baseUrl = config.publicBaseUrl || process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const safeBaseUrl = escapeHtml(baseUrl);
    const safeBotName = escapeHtml(BOT_NAME);
    const serverUrl = resolveServerUrl();
    const contactProfileUrl = resolveContactProfileUrl();
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeBotName}</title>
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
    <h1>${safeBotName}</h1>
    <p>Discord bot service page.</p>
    <a href="${safeBaseUrl}/terms">Terms of Service</a>
    <a href="${safeBaseUrl}/privacy">Privacy Policy</a>
    ${serverUrl ? `<a href="${escapeHtml(serverUrl)}" rel="noopener noreferrer">Join Server</a>` : ''}
    ${contactProfileUrl ? `<a href="${escapeHtml(contactProfileUrl)}" rel="noopener noreferrer">Contact Profile</a>` : ''}
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

  app.get('/appeal', (req, res) => {
    res.type('html').send(buildAppealPage());
  });

  app.get('/server', (req, res) => {
    const serverUrl = resolveServerUrl();
    if (!serverUrl) {
      res.status(404).type('text').send('Server URL is not configured.');
      return;
    }
    res.redirect(302, serverUrl);
  });

  app.get('/contact', (req, res) => {
    const contactProfileUrl = resolveContactProfileUrl();
    if (!contactProfileUrl) {
      res.status(404).type('text').send('Contact profile URL is not configured.');
      return;
    }
    res.redirect(302, contactProfileUrl);
  });

  app.get('/api/dashboard/links', (req, res) => {
    res.json({ ok: true, links: getDashboardLinks(req) });
  });

  app.get('/api/dashboard/config', requireDashboardAuth, (req, res) => {
    const guildId = normalizeId(req.query.guildId);
    if (!guildId) {
      res.status(400).json({ ok: false, reason: 'missing_guild_id' });
      return;
    }
    res.json(buildDashboardConfig(guildId, req));
  });

  app.patch('/api/dashboard/config', requireDashboardAuth, async (req, res) => {
    const guildId = normalizeId(req.body?.guildId);
    if (!guildId) {
      res.status(400).json({ ok: false, reason: 'missing_guild_id' });
      return;
    }

    const patch = buildDashboardPatch(req.body || {});
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ ok: false, reason: 'empty_patch' });
      return;
    }

    const result = await patchGuildOverrides(guildId, patch);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }

    res.json(buildDashboardConfig(guildId, req));
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
