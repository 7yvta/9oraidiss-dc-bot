const DEFAULT_API = "https://shadow-production-be95.up.railway.app";
const ticketOrder = ["support", "middleman", "index", "role", "report", "host"];
const ticketNames = {
  support: "Support",
  middleman: "Middleman",
  index: "Index",
  role: "Role Request",
  report: "Report",
  host: "Host Giveaway"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const statusEl = $("#status");

function setStatus(message, data) {
  $("#statStatus").textContent = message.split("\n")[0] || "Idle";
  statusEl.textContent = data ? `${message}\n${JSON.stringify(data, null, 2)}` : message;
}

function cleanBaseUrl(value) {
  return String(value || DEFAULT_API).trim().replace(/\/+$/, "");
}

function idsToText(value) {
  return Array.isArray(value) ? value.join(" ") : String(value || "");
}

function textListToText(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function parseIds(value) {
  return [...new Set(String(value || "").match(/\d{10,25}/g) || [])];
}

function parseTextList(value) {
  return [...new Set(String(value || "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function saveLocal() {
  localStorage.setItem("vaultDashApiBase", cleanBaseUrl($("#apiBase").value));
  localStorage.setItem("vaultDashToken", $("#apiToken").value.trim());
  localStorage.setItem("vaultDashGuildId", $("#guildId").value.trim());
  setStatus("Saved browser login settings.");
}

function loadLocal() {
  $("#apiBase").value = localStorage.getItem("vaultDashApiBase") || DEFAULT_API;
  $("#apiToken").value = localStorage.getItem("vaultDashToken") || "";
  $("#guildId").value = localStorage.getItem("vaultDashGuildId") || "";
  $("#statGuild").textContent = $("#guildId").value || "-";
}

async function api(path, options = {}) {
  const base = cleanBaseUrl($("#apiBase").value);
  const token = $("#apiToken").value.trim();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.auth !== false) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.reason || `HTTP ${res.status}`);
  }
  return data;
}

function renderLinks(links = {}) {
  const items = [
    ["Terms", links.termsUrl],
    ["Privacy", links.privacyUrl],
    ["Appeal", links.appealUrl],
    ["Join Server", links.serverUrl],
    ["Contact", links.contactProfileUrl]
  ].filter(([, url]) => url);

  $("#quickLinks").innerHTML = items
    .map(([label, url]) => `<a class="link-card" href="${url}" target="_blank" rel="noopener noreferrer"><strong>${label}</strong><span>${url}</span></a>`)
    .join("");

  if (links.botName) {
    $("#statBot").textContent = links.botName;
  }
}

function renderTickets(tickets = {}) {
  const host = $("#ticketCards");
  host.innerHTML = "";
  for (const key of ticketOrder) {
    const entry = tickets[key] || {};
    const card = document.createElement("div");
    card.className = "ticket-card";
    card.dataset.ticket = key;
    card.innerHTML = `
      <div class="ticket-title">
        <div><strong>${ticketNames[key]}</strong><small>${key}</small></div>
        <label class="switch"><input type="checkbox" data-ticket-field="enabled"><span></span>Enabled</label>
      </div>
      <div class="ticket-fields">
        <label><span>Panel Channel</span><input data-ticket-field="panelChannelId" placeholder="channel id"></label>
        <label><span>Category</span><input data-ticket-field="categoryId" placeholder="category id"></label>
        <label><span>Team Role IDs</span><textarea data-ticket-field="teamRoleIds" placeholder="role ids separated by spaces"></textarea></label>
        <label><span>Button Label</span><input data-ticket-field="buttonLabel" placeholder="button text"></label>
        <label class="full"><span>Open Message</span><textarea data-ticket-field="introMessage" placeholder="{user}, message..."></textarea></label>
      </div>`;
    $("[data-ticket-field='enabled']", card).checked = entry.enabled !== false;
    $("[data-ticket-field='panelChannelId']", card).value = entry.panelChannelId || "";
    $("[data-ticket-field='categoryId']", card).value = entry.categoryId || "";
    $("[data-ticket-field='teamRoleIds']", card).value = idsToText(entry.teamRoleIds);
    $("[data-ticket-field='buttonLabel']", card).value = entry.buttonLabel || "";
    $("[data-ticket-field='introMessage']", card).value = entry.introMessage || "";
    host.appendChild(card);
  }
  $("#statTickets").textContent = `${ticketOrder.length} types`;
}

function renderTriggers(rules = []) {
  $("#triggerRules").value = rules
    .map((rule) => `${idsToText(rule.triggerRoleIds)} => ${idsToText(rule.assignRoleIds)}`)
    .join("\n");
}

function parseTriggers() {
  return $("#triggerRules").value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [left, right] = line.split("=>");
      return {
        triggerRoleIds: parseIds(left),
        assignRoleIds: parseIds(right),
        removeWhenMissing: true
      };
    })
    .filter((rule) => rule.triggerRoleIds.length && rule.assignRoleIds.length);
}

function fillSettings(settings = {}) {
  $$('[data-setting-id]').forEach((input) => {
    input.value = settings[input.dataset.settingId] || "";
  });
  $$('[data-setting-bool]').forEach((input) => {
    input.checked = Boolean(settings[input.dataset.settingBool]);
  });
  $$('[data-setting-text]').forEach((input) => {
    input.value = settings[input.dataset.settingText] || "";
  });
  $$('[data-setting-number]').forEach((input) => {
    const value = settings[input.dataset.settingNumber];
    input.value = value === undefined || value === null ? "" : value;
  });
  $$('[data-setting-list]').forEach((input) => {
    input.value = idsToText(settings[input.dataset.settingList]);
  });
  $$('[data-setting-id-list]').forEach((input) => {
    input.value = idsToText(settings[input.dataset.settingIdList]);
  });
  $$('[data-setting-text-list]').forEach((input) => {
    input.value = textListToText(settings[input.dataset.settingTextList]);
  });
  renderTriggers(settings.roleTriggerRules || []);
}

function fillConfig(data) {
  renderLinks(data.links || {});
  fillSettings(data.settings || {});
  renderTickets(data.tickets || {});
  $("#statGuild").textContent = data.guildId || $("#guildId").value || "-";
  $("#lastLoaded").textContent = `Loaded guild ${data.guildId || $("#guildId").value || ""}`;
  $("#apiState").textContent = "Connected";
}

async function loadLinksOnly() {
  try {
    const data = await api("/api/dashboard/links", { auth: false });
    renderLinks(data.links || {});
  } catch {
    const base = cleanBaseUrl($("#apiBase").value);
    renderLinks({
      botName: "Vault",
      termsUrl: `${base}/terms`,
      privacyUrl: `${base}/privacy`,
      appealUrl: `${base}/appeal`
    });
  }
}

async function loadConfig() {
  saveLocal();
  const guildId = $("#guildId").value.trim();
  if (!guildId) {
    setStatus("Add a guild ID first.");
    return;
  }
  setStatus("Loading config...");
  const data = await api(`/api/dashboard/config?guildId=${encodeURIComponent(guildId)}`);
  fillConfig(data);
  setStatus("Loaded config.");
}

function collectSettings() {
  const settings = {};
  $$('[data-setting-id]').forEach((input) => {
    settings[input.dataset.settingId] = input.value.trim();
  });
  $$('[data-setting-bool]').forEach((input) => {
    settings[input.dataset.settingBool] = input.checked;
  });
  $$('[data-setting-text]').forEach((input) => {
    settings[input.dataset.settingText] = input.value.trim();
  });
  $$('[data-setting-number]').forEach((input) => {
    const value = input.value.trim();
    settings[input.dataset.settingNumber] = value === "" ? 0 : Number(value);
  });
  $$('[data-setting-list]').forEach((input) => {
    settings[input.dataset.settingList] = parseIds(input.value);
  });
  $$('[data-setting-id-list]').forEach((input) => {
    settings[input.dataset.settingIdList] = parseIds(input.value);
  });
  $$('[data-setting-text-list]').forEach((input) => {
    settings[input.dataset.settingTextList] = parseTextList(input.value);
  });
  settings.roleTriggerRules = parseTriggers();
  return settings;
}

function collectTickets() {
  const tickets = {};
  $$(".ticket-card").forEach((card) => {
    const key = card.dataset.ticket;
    tickets[key] = {
      enabled: $("[data-ticket-field='enabled']", card).checked,
      panelChannelId: $("[data-ticket-field='panelChannelId']", card).value.trim(),
      categoryId: $("[data-ticket-field='categoryId']", card).value.trim(),
      teamRoleIds: parseIds($("[data-ticket-field='teamRoleIds']", card).value),
      buttonLabel: $("[data-ticket-field='buttonLabel']", card).value.trim(),
      introMessage: $("[data-ticket-field='introMessage']", card).value.trim()
    };
  });
  return tickets;
}

async function saveConfig() {
  saveLocal();
  const body = {
    guildId: $("#guildId").value.trim(),
    settings: collectSettings(),
    tickets: collectTickets()
  };
  if (!body.guildId) {
    setStatus("Add a guild ID first.");
    return;
  }
  setStatus("Saving config...");
  const data = await api("/api/dashboard/config", {
    method: "PATCH",
    body: JSON.stringify(body)
  });
  fillConfig(data);
  setStatus("Saved. Bot config is live now.");
}

function setupNav() {
  const links = $$(".side-nav a");
  const sections = links.map((link) => $(link.getAttribute("href"))).filter(Boolean);
  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((entry) => entry.classList.remove("active"));
      link.classList.add("active");
    });
  });
  window.addEventListener("scroll", () => {
    let active = sections[0]?.id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top < 140) {
        active = section.id;
      }
    }
    links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${active}`));
  }, { passive: true });
}

function bindActions() {
  $("#saveLocal").addEventListener("click", saveLocal);
  $("#loadConfig").addEventListener("click", () => loadConfig().catch((error) => setStatus(`Load failed: ${error.message}`)));
  $("#reloadConfig").addEventListener("click", () => loadConfig().catch((error) => setStatus(`Reload failed: ${error.message}`)));
  $("#bottomReload").addEventListener("click", () => loadConfig().catch((error) => setStatus(`Reload failed: ${error.message}`)));
  $("#saveConfig").addEventListener("click", () => saveConfig().catch((error) => setStatus(`Save failed: ${error.message}`)));
  $("#bottomSave").addEventListener("click", () => saveConfig().catch((error) => setStatus(`Save failed: ${error.message}`)));
  $("#guildId").addEventListener("input", () => {
    $("#statGuild").textContent = $("#guildId").value.trim() || "-";
  });
}

loadLocal();
setupNav();
bindActions();
renderTickets({});
loadLinksOnly();
setStatus("Ready. Add token and load a guild config.");
