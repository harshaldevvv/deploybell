import { statusLabel } from "./lib/cloudflare.js";

const content = document.getElementById("content");
const updatedEl = document.getElementById("updated");
const refreshBtn = document.getElementById("refresh");

function timeAgo(ts) {
  if (!ts) return "";
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  return config || {};
}

async function getState() {
  const { state } = await chrome.storage.local.get("state");
  return state || { deployments: {} };
}

function renderEmpty(message, cta) {
  content.innerHTML = "";
  const div = document.createElement("div");
  div.className = "empty";
  div.innerHTML = `<p>${message}</p>`;
  if (cta) {
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = cta;
    btn.addEventListener("click", () => chrome.runtime.openOptionsPage());
    div.appendChild(btn);
  }
  content.appendChild(div);
}

function renderProjects(config, state) {
  content.innerHTML = "";
  for (const project of config.projects) {
    const dep = state.deployments[project] || {};
    const status = dep.error ? "error" : dep.status || "queued";

    const row = document.createElement("div");
    row.className = "project";

    const dot = document.createElement("span");
    dot.className = `dot ${status}`;
    row.appendChild(dot);

    const body = document.createElement("div");
    body.className = "project-body";

    const name = document.createElement("div");
    name.className = "project-name";
    name.textContent = project;
    body.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "project-meta";
    if (dep.error) {
      meta.textContent = dep.error;
    } else if (dep.status) {
      const env = dep.environment ? `${dep.environment} · ` : "";
      meta.textContent = `${env}${statusLabel(dep.status)} · ${timeAgo(
        dep.created_on ? Date.parse(dep.created_on) : dep.checkedAt
      )}`;
    } else {
      meta.textContent = "No deployments yet";
    }
    body.appendChild(meta);
    row.appendChild(body);

    if (dep.url) {
      const open = document.createElement("button");
      open.className = "open-btn";
      open.textContent = "Open";
      open.addEventListener("click", () =>
        chrome.tabs.create({ url: dep.url })
      );
      row.appendChild(open);
    }

    content.appendChild(row);
  }
}

async function render() {
  const config = await getConfig();
  if (!config.token || !config.accountId) {
    renderEmpty("Connect your Cloudflare account to start.", "Open settings");
    updatedEl.textContent = "";
    return;
  }
  if (!Array.isArray(config.projects) || config.projects.length === 0) {
    renderEmpty("No projects selected to monitor.", "Choose projects");
    updatedEl.textContent = "";
    return;
  }
  const state = await getState();
  renderProjects(config, state);

  const times = config.projects
    .map((p) => state.deployments[p]?.checkedAt)
    .filter(Boolean);
  const last = times.length ? Math.max(...times) : null;
  updatedEl.textContent = last ? `Updated ${timeAgo(last)}` : "";
}

refreshBtn.addEventListener("click", async () => {
  refreshBtn.classList.add("spin");
  try {
    await chrome.runtime.sendMessage({ type: "poll-now" });
  } finally {
    await render();
    refreshBtn.classList.remove("spin");
  }
});

document
  .getElementById("options")
  .addEventListener("click", () => chrome.runtime.openOptionsPage());

// Live-update the popup if the background writes new state while it's open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.state || changes.config)) render();
});

render();
