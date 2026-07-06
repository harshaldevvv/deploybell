// Popup logic. Reads state from the service worker, renders it, wires the
// buttons, and keeps the elapsed timer ticking while the popup is open.

const el = (id) => document.getElementById(id);
const monitoringEl = el("monitoring");
const statusEl = el("status");
const projectEl = el("project");
const elapsedEl = el("elapsed");
const toggleBtn = el("toggle");

let currentState = null;
let tick = null;

function formatElapsed(ms) {
  if (ms == null || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function render(state) {
  currentState = state;
  const monitoring = !!state.monitoringEnabled;

  monitoringEl.textContent = monitoring ? "Yes" : "No";

  const statusKey = state.status || "idle";
  const label = CFPN_STATUS_LABEL[statusKey] || statusKey;
  statusEl.innerHTML = "";
  const dot = document.createElement("span");
  dot.className = "dot " + statusKey;
  statusEl.appendChild(dot);
  statusEl.appendChild(document.createTextNode(label));

  projectEl.textContent = state.project || "—";
  updateElapsed();

  toggleBtn.textContent = monitoring ? "Stop Monitoring" : "Start Monitoring";
  toggleBtn.classList.toggle("stop", monitoring);
}

function updateElapsed() {
  if (!currentState) return;
  const { status, startTime, finishedAt } = currentState;
  if (!startTime) {
    elapsedEl.textContent = "—";
    return;
  }
  // Freeze the timer once the deployment has finished.
  const end = status === "running" ? Date.now() : finishedAt || Date.now();
  elapsedEl.textContent = formatElapsed(end - startTime);
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "cfpn-get-state" });
  if (state) render(state);
}

toggleBtn.addEventListener("click", async () => {
  const monitoring = currentState && currentState.monitoringEnabled;
  await chrome.runtime.sendMessage({
    type: monitoring ? "cfpn-stop" : "cfpn-start",
  });
  await refresh();
});

el("test").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "cfpn-test", status: "success" });
});

el("open").addEventListener("click", () => {
  chrome.tabs.create({ url: CFPN_PAGES_URL });
});

el("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Live updates while the popup is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.state) render({ ...changes.state.newValue });
});

tick = setInterval(updateElapsed, 1000);
window.addEventListener("unload", () => clearInterval(tick));

refresh();
