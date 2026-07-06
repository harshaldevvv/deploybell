// Background service worker: polls Cloudflare on a timer, diffs deployment
// state, and raises desktop notifications on changes.

import { listDeployments, normalizeStatus } from "./lib/cloudflare.js";

const ALARM_NAME = "cf-poll";
const DEFAULT_INTERVAL_MIN = 2;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  return config || {};
}

async function getState() {
  const { state } = await chrome.storage.local.get("state");
  return state || { deployments: {} };
}

async function setState(state) {
  await chrome.storage.local.set({ state });
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

async function scheduleAlarm() {
  const config = await getConfig();
  // chrome.alarms enforces a 1-minute minimum period.
  const period = Math.max(1, Number(config.interval) || DEFAULT_INTERVAL_MIN);
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: period });
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

function updateBadge(overall) {
  const map = {
    building: { text: "•", color: "#F6821F" },
    failure: { text: "!", color: "#E53935" },
    success: { text: "", color: "#43A047" },
    idle: { text: "", color: "#9E9E9E" },
  };
  const b = map[overall] || map.idle;
  chrome.action.setBadgeText({ text: b.text });
  chrome.action.setBadgeBackgroundColor({ color: b.color });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function maybeNotify(project, deployment, status, prev, config) {
  const notify = config.notify || { start: true, success: true, failure: true };
  const env = deployment.environment || "production";
  const wasBuilding =
    prev && (prev.status === "building" || prev.status === "queued");

  let title;
  let message;
  let priority = 0;

  if (status === "success" && notify.success) {
    title = `✅ ${project} deployed`;
    message = `${env} deployment succeeded.`;
  } else if (status === "failure" && notify.failure) {
    title = `❌ ${project} failed`;
    const stage = deployment.latest_stage?.name || "build";
    message = `${env} deployment failed at the "${stage}" stage.`;
    priority = 2;
  } else if (
    (status === "building" || status === "queued") &&
    notify.start &&
    !wasBuilding
  ) {
    title = `🔧 ${project} building`;
    message = `A new ${env} deployment started.`;
  } else {
    return;
  }

  chrome.notifications.create(`cf:${project}:${deployment.id}:${status}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    contextMessage: deployment.url || "",
    priority,
  });
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

async function poll() {
  const config = await getConfig();
  if (
    !config.token ||
    !config.accountId ||
    !Array.isArray(config.projects) ||
    config.projects.length === 0
  ) {
    updateBadge("idle");
    return;
  }

  const state = await getState();
  let anyBuilding = false;
  let anyFailure = false;

  for (const project of config.projects) {
    try {
      const deployments = await listDeployments(
        config.accountId,
        project,
        config.token
      );
      const latest = Array.isArray(deployments) ? deployments[0] : null;
      if (!latest) continue;

      const status = normalizeStatus(latest);
      const prev = state.deployments[project];
      const changed =
        !prev || prev.id !== latest.id || prev.status !== status;

      if (changed) {
        maybeNotify(project, latest, status, prev, config);
      }

      state.deployments[project] = {
        id: latest.id,
        short_id: latest.short_id,
        status,
        environment: latest.environment,
        url: latest.url,
        created_on: latest.created_on,
        stage: latest.latest_stage?.name,
        checkedAt: Date.now(),
      };

      if (status === "building" || status === "queued") anyBuilding = true;
      if (status === "failure") anyFailure = true;
    } catch (err) {
      state.deployments[project] = {
        ...(state.deployments[project] || {}),
        error: err.message,
        checkedAt: Date.now(),
      };
    }
  }

  await setState(state);
  updateBadge(anyFailure ? "failure" : anyBuilding ? "building" : "success");
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  await scheduleAlarm();
  await poll();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
  await poll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) poll();
});

chrome.notifications.onClicked.addListener(async (id) => {
  const parts = id.split(":");
  const project = parts[1];
  const state = await getState();
  const dep = state.deployments[project];
  const url =
    dep?.url ||
    `https://dash.cloudflare.com/?to=/:account/pages/view/${project}`;
  chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "poll-now") {
      await poll();
      sendResponse({ ok: true });
    } else if (msg?.type === "reschedule") {
      await scheduleAlarm();
      await poll();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  })();
  return true; // keep the message channel open for the async response
});
