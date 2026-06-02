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
  statusEl.textContent = data ? `${message}\n${JSON.stringify(data, null, 2)}` : message;
}

function cleanBaseUrl(value) {
  return String(value || DEFAULT_API).trim().replace(/\/+$/, "");
}

function idsToText(value) {
  return Array.isArray(value) ? value.join(" ") : String(value || "");
}

function parseIds(value) {
  return [...new Set(String(value || "").match(/\d{10,25}/g) || [])];
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
}

async function api(path, options = {}) {
  const base = cleanBaseUrl($("#apiBase").value);
  const token = $("#apiToken").value.trim();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
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
    .map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    .join("");
}

function renderTickets(tickets = {}) {
  const host = $("#tickets");
  host.innerHTML = "";
  for (const key of ticketOrder) {
    const entry = tickets[key] || {};
    const card = document.createElement("div");
    card.className = "ticket-card";
    card.dataset.ticket = key;
    card.innerHTML = `
      <div class="ticket-title">
        <strong>${ticketNames[key]}</strong>
        <label class="check"><input type="checkbox" data-ticket-field="enabled"> Enabled</label>
      </div>
      <div class="grid">
        <label><span>Panel Channel</span><input data-ticket-field="panelChannelId" placeholder="channel id"></label>
        <label><span>Category</span><input data-ticket-field="categoryId" placeholder="category id"></label>
        <label><span>Team Role IDs</span><textarea data-ticket-field="teamRoleIds" placeholder="role ids separated by spaces"></textarea></label>
        <label><span>Button Label</span><input data-ticket-field="buttonLabel" placeholder="button text"></label>
        <label><span>Open Message</span><textarea data-ticket-field="introMessage" placeholder="{user}, message..."></textarea></label>
      </div>`;
    $("[data-ticket-field='enabled']", card).checked = entry.enabled !== false;
    $("[data-ticket-field='panelChannelId']", card).value = entry.panelChannelId || "";
    $("[data-ticket-field='categoryId']", card).value = entry.categoryId || "";
    $("[data-ticket-field='teamRoleIds']", card).value = idsToText(entry.teamRoleIds);
    $("[data-ticket-field='buttonLabel']", card).value = entry.buttonLabel || "";
    $("[data-ticket-field='introMessage']", card).value = entry.introMessage || "";
    host.appendChild(card);
  }
}

function renderTriggers(rules = []) {
  $("#triggers").value = rules
    .map((rule) => `${idsToText(rule.triggerRoleIds)} => ${idsToText(rule.assignRoleIds)}`)
    .join("\n");
}

function parseTriggers() {
  return $("#triggers").value
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

function fillConfig(data) {
  renderLinks(data.links);
  const settings = data.settings || {};
  $$('[data-setting]').forEach((input) => {
    input.value = settings[input.dataset.setting] || "";
  });
  $$('[data-setting-list]').forEach((input) => {
    input.value = idsToText(settings[input.dataset.settingList]);
  });
  renderTickets(data.tickets || {});
  renderTriggers(settings.roleTriggerRules || []);
}

async function loadLinksOnly() {
  try {
    const data = await api("/api/dashboard/links", { headers: { Authorization: "" } });
    renderLinks(data.links);
  } catch {
    renderLinks({
      termsUrl: `${cleanBaseUrl($("#apiBase").value)}/terms`,
      privacyUrl: `${cleanBaseUrl($("#apiBase").value)}/privacy`,
      appealUrl: `${cleanBaseUrl($("#apiBase").value)}/appeal`
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

function collectPatch() {
  const settings = {};
  $$('[data-setting]').forEach((input) => {
    settings[input.dataset.setting] = input.value.trim();
  });
  $$('[data-setting-list]').forEach((input) => {
    settings[input.dataset.settingList] = parseIds(input.value);
  });
  settings.roleTriggerRules = parseTriggers();

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

  return {
    guildId: $("#guildId").value.trim(),
    settings,
    tickets
  };
}

async function saveConfig() {
  saveLocal();
  const body = collectPatch();
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

loadLocal();
renderTickets({});
loadLinksOnly();
$("#saveLocal").addEventListener("click", saveLocal);
$("#loadConfig").addEventListener("click", () => loadConfig().catch((error) => setStatus(`Load failed: ${error.message}`)));
$("#reloadConfig").addEventListener("click", () => loadConfig().catch((error) => setStatus(`Reload failed: ${error.message}`)));
$("#saveConfig").addEventListener("click", () => saveConfig().catch((error) => setStatus(`Save failed: ${error.message}`)));
