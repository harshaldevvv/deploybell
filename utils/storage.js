// Promise wrappers around chrome.storage.local for settings and runtime state.
// Depends on CFPN_DEFAULT_SETTINGS from constants.js (loaded first everywhere).

async function cfpnGetSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || {};
  return {
    ...CFPN_DEFAULT_SETTINGS,
    ...s,
    // Merge nested sound map so a partial saved object never drops defaults.
    sounds: { ...CFPN_DEFAULT_SETTINGS.sounds, ...(s.sounds || {}) },
  };
}

async function cfpnSetSettings(patch) {
  const current = await cfpnGetSettings();
  const next = {
    ...current,
    ...patch,
    sounds: { ...current.sounds, ...(patch.sounds || {}) },
  };
  await chrome.storage.local.set({ settings: next });
  return next;
}

function cfpnDefaultState() {
  return {
    monitoringEnabled: false,
    status: "idle",
    project: null,
    deploymentId: null,
    startTime: null, // when the current deployment was first seen running
    finishedAt: null,
    seenRunning: false, // have we observed this deployment in a running state?
    lastUpdate: 0,
  };
}

async function cfpnGetState() {
  const { state } = await chrome.storage.local.get("state");
  return { ...cfpnDefaultState(), ...(state || {}) };
}

async function cfpnSetState(patch) {
  const current = await cfpnGetState();
  const next = { ...current, ...patch, lastUpdate: Date.now() };
  await chrome.storage.local.set({ state: next });
  return next;
}
