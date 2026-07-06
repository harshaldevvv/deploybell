// Options page logic: load settings, populate the sound pickers, preview
// sounds, and persist changes.

const el = (id) => document.getElementById(id);
const statusEl = el("status");
const previewAudio = el("preview-audio");

const SOUND_SELECTS = {
  success: el("sound-success"),
  failed: el("sound-failed"),
  cancelled: el("sound-cancelled"),
};

function populateSoundSelects() {
  for (const key of Object.keys(SOUND_SELECTS)) {
    const select = SOUND_SELECTS[key];
    select.innerHTML = "";
    for (const sound of CFPN_SOUND_LIBRARY) {
      const opt = document.createElement("option");
      opt.value = sound.file;
      opt.textContent = sound.label;
      select.appendChild(opt);
    }
  }
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
  if (message) setTimeout(() => setStatus(""), 2500);
}

async function load() {
  const s = await cfpnGetSettings();
  el("pollInterval").value = String(s.pollInterval);
  el("autoStart").checked = s.autoStart !== false;
  el("notifyEnabled").checked = s.notifyEnabled !== false;
  el("soundEnabled").checked = s.soundEnabled !== false;
  el("badgeEnabled").checked = s.badgeEnabled !== false;
  el("volume").value = String(s.volume);
  el("volumeValue").textContent = Math.round(s.volume * 100) + "%";
  SOUND_SELECTS.success.value = s.sounds.success;
  SOUND_SELECTS.failed.value = s.sounds.failed;
  SOUND_SELECTS.cancelled.value = s.sounds.cancelled;
}

async function save() {
  const patch = {
    pollInterval: Number(el("pollInterval").value),
    autoStart: el("autoStart").checked,
    notifyEnabled: el("notifyEnabled").checked,
    soundEnabled: el("soundEnabled").checked,
    badgeEnabled: el("badgeEnabled").checked,
    volume: Number(el("volume").value),
    sounds: {
      success: SOUND_SELECTS.success.value,
      failed: SOUND_SELECTS.failed.value,
      cancelled: SOUND_SELECTS.cancelled.value,
    },
  };
  await cfpnSetSettings(patch);
  // Nudge the worker to reapply badge visibility, etc.
  chrome.runtime.sendMessage(
    { type: "cfpn-settings-changed" },
    () => void chrome.runtime.lastError
  );
  setStatus("Saved.", "ok");
}

el("volume").addEventListener("input", () => {
  el("volumeValue").textContent =
    Math.round(Number(el("volume").value) * 100) + "%";
});

el("save").addEventListener("click", save);

el("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({ settings: { ...CFPN_DEFAULT_SETTINGS } });
  await load();
  setStatus("Reset to defaults.", "ok");
});

// Preview buttons play the currently selected sound at the chosen volume.
document.querySelectorAll(".preview").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.for;
    const file = SOUND_SELECTS[key].value;
    previewAudio.src = chrome.runtime.getURL("sounds/" + file);
    previewAudio.volume = Number(el("volume").value);
    previewAudio.play().catch(() => {});
  });
});

populateSoundSelects();
load();
