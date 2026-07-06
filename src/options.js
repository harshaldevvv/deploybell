import {
  verifyToken,
  listAccounts,
  listProjects,
  CloudflareError,
} from "./lib/cloudflare.js";

const el = (id) => document.getElementById(id);

const tokenInput = el("token");
const verifyBtn = el("verify");
const tokenStatus = el("token-status");
const accountCard = el("account-card");
const accountSelect = el("account");
const projectsCard = el("projects-card");
const projectsBox = el("projects");
const intervalInput = el("interval");
const saveBtn = el("save");
const saveStatus = el("save-status");

// In-memory working copy, hydrated from storage on load.
let selectedProjects = new Set();

function setStatus(node, message, kind) {
  node.textContent = message;
  node.className = `status${kind ? " " + kind : ""}`;
}

async function loadAccounts(token) {
  const accounts = await listAccounts(token);
  accountSelect.innerHTML = "";
  for (const acc of accounts) {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = `${acc.name} (${acc.id})`;
    accountSelect.appendChild(opt);
  }
  accountCard.hidden = accounts.length === 0;
  return accounts;
}

async function loadProjects(accountId, token) {
  projectsBox.innerHTML = "<p class='hint'>Loading projects…</p>";
  projectsCard.hidden = false;
  try {
    const projects = await listProjects(accountId, token);
    projectsBox.innerHTML = "";
    if (!projects || projects.length === 0) {
      projectsBox.innerHTML =
        "<p class='hint'>No Pages projects found in this account.</p>";
      return;
    }
    for (const proj of projects) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = proj.name;
      cb.checked = selectedProjects.has(proj.name);
      cb.addEventListener("change", () => {
        if (cb.checked) selectedProjects.add(proj.name);
        else selectedProjects.delete(proj.name);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + proj.name));
      projectsBox.appendChild(label);
    }
  } catch (err) {
    projectsBox.innerHTML = `<p class='hint'>Could not load projects: ${err.message}</p>`;
  }
}

async function handleVerify() {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus(tokenStatus, "Enter a token first.", "err");
    return;
  }
  verifyBtn.disabled = true;
  setStatus(tokenStatus, "Verifying…");
  try {
    const result = await verifyToken(token);
    if (result && result.status && result.status !== "active") {
      setStatus(tokenStatus, `Token status: ${result.status}`, "err");
      return;
    }
    await loadAccounts(token);
    const accountId = accountSelect.value;
    if (accountId) await loadProjects(accountId, token);
    setStatus(tokenStatus, "Token verified.", "ok");
  } catch (err) {
    const msg =
      err instanceof CloudflareError ? err.message : "Verification failed.";
    setStatus(tokenStatus, msg, "err");
  } finally {
    verifyBtn.disabled = false;
  }
}

accountSelect.addEventListener("change", () => {
  const token = tokenInput.value.trim();
  if (token && accountSelect.value) loadProjects(accountSelect.value, token);
});

verifyBtn.addEventListener("click", handleVerify);

async function handleSave() {
  const token = tokenInput.value.trim();
  const accountId = accountSelect.value;
  if (!token || !accountId) {
    setStatus(saveStatus, "Verify a token and pick an account first.", "err");
    return;
  }
  const config = {
    token,
    accountId,
    projects: [...selectedProjects],
    interval: Math.min(60, Math.max(1, Number(intervalInput.value) || 2)),
    notify: {
      start: el("notify-start").checked,
      success: el("notify-success").checked,
      failure: el("notify-failure").checked,
    },
  };
  await chrome.storage.local.set({ config });
  await chrome.runtime.sendMessage({ type: "reschedule" });
  setStatus(saveStatus, "Saved. Monitoring is active.", "ok");
}

saveBtn.addEventListener("click", handleSave);

async function restore() {
  const { config } = await chrome.storage.local.get("config");
  if (!config) return;

  tokenInput.value = config.token || "";
  intervalInput.value = config.interval || 2;
  selectedProjects = new Set(config.projects || []);

  if (config.notify) {
    el("notify-start").checked = config.notify.start !== false;
    el("notify-success").checked = config.notify.success !== false;
    el("notify-failure").checked = config.notify.failure !== false;
  }

  // Re-hydrate accounts + projects so saved selections are visible.
  if (config.token) {
    try {
      await loadAccounts(config.token);
      if (config.accountId) {
        accountSelect.value = config.accountId;
        await loadProjects(config.accountId, config.token);
      }
      setStatus(tokenStatus, "Token loaded.", "ok");
    } catch {
      setStatus(
        tokenStatus,
        "Saved token could not be verified. Re-verify to refresh.",
        "err"
      );
    }
  }
}

restore();
