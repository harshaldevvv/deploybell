// Background service worker (classic worker, uses importScripts). Owns the
// monitoring state machine, deduplicates notifications, drives the toolbar
// badge, shows desktop notifications, and plays sounds via an offscreen
// document (service workers cannot play audio directly).

importScripts("utils/constants.js", "utils/status.js", "utils/storage.js");

// ---------------------------------------------------------------------------
// Offscreen audio
// ---------------------------------------------------------------------------

let offscreenCreating = null;

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }
  offscreenCreating = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play a notification sound when a deployment finishes.",
  });
  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

async function playSound(file, volume) {
  try {
    await ensureOffscreen();
    chrome.runtime.sendMessage(
      {
        target: "offscreen",
        type: "cfpn-play",
        url: chrome.runtime.getURL("sounds/" + file),
        volume,
      },
      () => void chrome.runtime.lastError
    );
  } catch (e) {
    console.warn("[CFPN] Could not play sound:", e);
  }
}

// ---------------------------------------------------------------------------
// Badge / icon state
// ---------------------------------------------------------------------------

async function setBadge(stateName) {
  const settings = await cfpnGetSettings();
  const b = CFPN_BADGE[stateName] || CFPN_BADGE.idle;
  if (settings.badgeEnabled) {
    chrome.action.setBadgeText({ text: b.text });
    chrome.action.setBadgeBackgroundColor({ color: b.color });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
  chrome.action.setTitle({
    title: "Cloudflare Pages Notifier — " + b.title,
  });
}

// ---------------------------------------------------------------------------
// Desktop notifications
// ---------------------------------------------------------------------------

const NOTIFY_TEMPLATES = {
  success: { icon: "✅", heading: "Deployment Complete", statusLine: "Success" },
  failed: { icon: "❌", heading: "Deployment Failed", statusLine: "Failed" },
  cancelled: { icon: "⚠", heading: "Deployment Cancelled", statusLine: "Cancelled" },
};

function showNotification(status, project) {
  const t = NOTIFY_TEMPLATES[status];
  if (!t) return;

  const lines = [];
  if (project) lines.push("Project:\n" + project);
  lines.push("Status:\n" + t.statusLine);
  const message = lines.join("\n\n");

  chrome.notifications.create("cfpn-" + Date.now(), {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: t.icon + " " + t.heading,
    message,
    contextMessage: "Cloudflare Pages",
    eventTime: Date.now(),
    priority: status === "failed" ? 2 : 1,
    requireInteraction: status === "failed",
  });
}

// ---------------------------------------------------------------------------
// Notification dedup bookkeeping
// ---------------------------------------------------------------------------

async function markNotified(key) {
  const { notified } = await chrome.storage.local.get("notified");
  const map = notified || {};
  map[key] = Date.now();
  // Keep the map bounded — retain the 50 most recent keys.
  const keys = Object.keys(map);
  if (keys.length > 50) {
    keys.sort((a, b) => map[a] - map[b]);
    for (const k of keys.slice(0, keys.length - 50)) delete map[k];
  }
  await chrome.storage.local.set({ notified: map });
}

async function wasNotified(key) {
  const { notified } = await chrome.storage.local.get("notified");
  return !!(notified && notified[key]);
}

// ---------------------------------------------------------------------------
// Core status handling (the state machine)
// ---------------------------------------------------------------------------

async function handleStatus(msg) {
  const state = await cfpnGetState();
  if (!state.monitoringEnabled) return;

  const incomingId = msg.deploymentId || null;
  const project = msg.project || state.project || null;

  // A genuinely new deployment id resets the running/started tracking.
  const contextChanged =
    incomingId !== null && (incomingId || "latest") !== (state.deploymentId || "latest");
  let seenRunning = contextChanged ? false : state.seenRunning;
  let startTime = contextChanged ? null : state.startTime;
  const deploymentId = incomingId || state.deploymentId;

  // In-progress: record the start once, keep the badge live.
  if (msg.status === "running") {
    if (!seenRunning) {
      seenRunning = true;
      startTime = Date.now();
    }
    await cfpnSetState({
      project,
      status: "running",
      deploymentId,
      seenRunning,
      startTime,
      finishedAt: null,
    });
    await setBadge("running");
    return;
  }

  // Final states: notify exactly once, and only if we actually saw this
  // deployment running first (prevents alerts when merely opening a page that
  // already shows an old, finished deployment).
  if (cfpnIsFinal(msg.status)) {
    const key =
      (deploymentId || project || "x") + ":" + msg.status + ":" + (startTime || 0);
    const alreadyThisFinal =
      state.status === msg.status && state.deploymentId === deploymentId;

    if (seenRunning && !alreadyThisFinal && !(await wasNotified(key))) {
      await markNotified(key);
      const settings = await cfpnGetSettings();
      if (settings.notifyEnabled) showNotification(msg.status, project);
      if (settings.soundEnabled) {
        const file =
          settings.sounds[msg.status] || CFPN_DEFAULT_SETTINGS.sounds[msg.status];
        playSound(file, settings.volume);
      }
    }

    await cfpnSetState({
      project,
      status: msg.status,
      deploymentId,
      seenRunning: false,
      startTime,
      finishedAt: Date.now(),
    });
    await setBadge(msg.status);
  }
}

// ---------------------------------------------------------------------------
// Test helper (popup / options "Test Notification")
// ---------------------------------------------------------------------------

async function runTest(status) {
  const s = ["success", "failed", "cancelled"].includes(status)
    ? status
    : "success";
  const settings = await cfpnGetSettings();
  showNotification(s, "ballengine");
  const file = settings.sounds[s] || CFPN_DEFAULT_SETTINGS.sounds[s] || "success.wav";
  playSound(file, settings.volume);
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "cfpn-status":
        await handleStatus(msg);
        sendResponse({ ok: true });
        break;
      case "cfpn-get-state":
        sendResponse(await cfpnGetState());
        break;
      case "cfpn-start":
        await cfpnSetState({ monitoringEnabled: true, status: "watching" });
        await setBadge("watching");
        sendResponse({ ok: true });
        break;
      case "cfpn-stop":
        await cfpnSetState({
          monitoringEnabled: false,
          status: "idle",
          seenRunning: false,
        });
        await setBadge("idle");
        sendResponse({ ok: true });
        break;
      case "cfpn-test":
        await runTest(msg.status);
        sendResponse({ ok: true });
        break;
      case "cfpn-settings-changed": {
        const st = await cfpnGetState();
        const badge = !st.monitoringEnabled
          ? "idle"
          : st.status === "idle"
          ? "watching"
          : st.status;
        await setBadge(badge);
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false });
    }
  })();
  return true; // keep the channel open for the async response
});

// Clicking a notification opens the Workers & Pages dashboard.
chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: CFPN_PAGES_URL });
  chrome.notifications.clear(id);
});

// ---------------------------------------------------------------------------
// Startup / install
// ---------------------------------------------------------------------------

async function initState() {
  const settings = await cfpnGetSettings();
  const state = await cfpnGetState();
  const monitoringEnabled =
    state.monitoringEnabled || settings.autoStart !== false;
  const status = !monitoringEnabled
    ? "idle"
    : cfpnIsFinal(state.status)
    ? state.status
    : "watching";
  await cfpnSetState({ monitoringEnabled, status });
  await setBadge(monitoringEnabled ? (cfpnIsFinal(status) ? status : "watching") : "idle");
}

chrome.runtime.onInstalled.addListener(initState);
chrome.runtime.onStartup.addListener(initState);
