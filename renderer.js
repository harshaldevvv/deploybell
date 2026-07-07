// Global Application State cached locally in renderer
let localConfig = null;
let currentProjectsList = []; // Cached array of project objects fetched from API

// Tab switching helper
function switchTab(targetTabId) {
  // Update sidebar navigation active item
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-target') === targetTabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab.id === `tab-${targetTabId}`) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

// Format relative date string
function formatTimeAgo(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  const remainingSec = diffSec % 60;
  return `${diffMin}m ${remainingSec}s ago`;
}

// Render dynamic project cards in grid
function renderProjectGrid(projectStates, configProjects) {
  const gridContainer = document.getElementById('project-grid');
  
  if (!configProjects || configProjects.length === 0) {
    gridContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <h3>No Monitored Projects</h3>
        <p>Go to Settings to configure your Cloudflare API and select projects.</p>
        <button class="btn btn-primary" onclick="switchTab('settings')">Configure Settings</button>
      </div>
    `;
    return;
  }

  let htmlContent = '';
  
  for (const name of configProjects) {
    const state = projectStates[name];
    
    if (!state) {
      // Fetching state
      htmlContent += `
        <div class="project-card status-building">
          <div class="project-header">
            <span class="project-name" title="${name}">${name}</span>
            <span class="env-badge preview">Active</span>
          </div>
          <div class="project-details">
            <div class="detail-row">
              <span>Status</span>
              <span class="detail-val">Pending Sync</span>
            </div>
          </div>
          <div class="status-row">
            <span class="status-badge">
              <span class="status-dot"></span>
              Synchronizing...
            </span>
          </div>
        </div>
      `;
      continue;
    }

    const isSuccess = ['success', 'succeeded'].includes(state.lastStatus);
    const isFailed = ['failure', 'failed', 'error'].includes(state.lastStatus);
    const isCancelled = ['canceled', 'cancelled', 'aborted'].includes(state.lastStatus);
    
    let statusClass = 'status-building';
    let statusText = 'Building';
    
    if (isSuccess) {
      statusClass = 'status-success';
      statusText = 'Success';
    } else if (isFailed) {
      statusClass = 'status-failed';
      statusText = 'Failed';
    } else if (isCancelled) {
      statusClass = 'status-cancelled';
      statusText = 'Cancelled';
    }

    const timeAgo = formatTimeAgo(state.lastTransitionTime);
    const shortId = state.shortId || 'N/A';
    const env = state.environment || 'production';
    const buildUrl = state.url || '#';

    htmlContent += `
      <div class="project-card ${statusClass}">
        <div class="project-header">
          <span class="project-name" title="${name}">${name}</span>
          <span class="env-badge ${env.toLowerCase()}">${env}</span>
        </div>
        <div class="project-details">
          <div class="detail-row">
            <span>Deploy ID</span>
            <span class="detail-val">${shortId}</span>
          </div>
          <div class="detail-row">
            <span>Last Updated</span>
            <span class="detail-val" title="${new Date(state.createdOn || Date.now()).toLocaleString()}">${timeAgo}</span>
          </div>
        </div>
        <div class="status-row">
          <span class="status-badge">
            <span class="status-dot"></span>
            ${statusText}
          </span>
          ${state.url ? `
            <button class="btn-card-link" onclick="window.api.openExternal('${buildUrl}')">
              View Deployment
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  gridContainer.innerHTML = htmlContent;
}

// Render logging console lines
function renderLogs(eventLogs) {
  const terminal = document.getElementById('logs-terminal-view');
  if (eventLogs.length === 0) {
    terminal.innerHTML = '<div class="log-line system">[SYSTEM] Waiting for build events...</div>';
    return;
  }

  let htmlContent = '';
  for (const log of eventLogs) {
    let lineClass = 'system';
    if (log.includes('succeeded') || log.includes('Succeeded') || log.includes('Success')) {
      lineClass = 'success';
    } else if (log.includes('failed') || log.includes('Failed') || log.includes('Error') || log.includes('error')) {
      lineClass = 'error';
    } else if (log.includes('cancelled') || log.includes('Cancelled') || log.includes('warning')) {
      lineClass = 'warning';
    } else if (log.includes('triggered') || log.includes('building')) {
      lineClass = 'building';
    }
    
    htmlContent += `<div class="log-line ${lineClass}">${escapeHTML(log)}</div>`;
  }

  const shouldScroll = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 40;
  terminal.innerHTML = htmlContent;
  
  if (shouldScroll) {
    terminal.scrollTop = terminal.scrollHeight;
  }
}

// Simple HTML escaping helper
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Fetch and render checklist of Cloudflare Pages projects in Settings
async function loadProjectsChecklist(apiToken, accountId) {
  const container = document.getElementById('project-checklist-container');
  const searchInput = document.getElementById('project-search');
  
  container.innerHTML = `
    <div class="checklist-placeholder">
      <span class="spinner-inline"></span>
      Fetching projects list from Cloudflare...
    </div>
  `;
  searchInput.disabled = true;

  const result = await window.api.fetchProjects(apiToken, accountId);
  
  if (!result.success) {
    container.innerHTML = `<div class="checklist-placeholder" style="color: var(--failed)">Error: ${result.error}</div>`;
    return false;
  }

  currentProjectsList = result.projects || [];
  
  if (currentProjectsList.length === 0) {
    container.innerHTML = '<div class="checklist-placeholder">No Pages projects found under this account.</div>';
    return true;
  }

  renderChecklistElements('');
  searchInput.disabled = false;
  return true;
}

// Filter and render checklist UI items
function renderChecklistElements(filterText) {
  const container = document.getElementById('project-checklist-container');
  const query = filterText.toLowerCase();
  
  let html = '';
  let count = 0;
  
  for (const project of currentProjectsList) {
    if (query && !project.name.toLowerCase().includes(query)) {
      continue;
    }
    
    const isChecked = localConfig && localConfig.projects && localConfig.projects.includes(project.name);
    
    html += `
      <label class="checklist-item">
        <input type="checkbox" name="monitored-project-checkbox" value="${project.name}" ${isChecked ? 'checked' : ''}>
        <span>${project.name}</span>
      </label>
    `;
    count++;
  }

  if (count === 0) {
    container.innerHTML = '<div class="checklist-placeholder">No projects matching query.</div>';
  } else {
    container.innerHTML = html;
  }
}

// Update the main statistics widgets
function updateStatWidgets(projectStates, configProjects) {
  if (!configProjects || configProjects.length === 0) {
    document.getElementById('stat-total-projects').innerText = '0';
    document.getElementById('stat-building-projects').innerText = '0';
    document.getElementById('stat-success-projects').innerText = '0';
    document.getElementById('stat-failed-projects').innerText = '0';
    return;
  }

  let total = configProjects.length;
  let building = 0;
  let succeeded = 0;
  let failed = 0;

  for (const name of configProjects) {
    const state = projectStates[name];
    if (state) {
      const status = state.lastStatus;
      if (['active', 'queued', 'building', 'deploying', 'initializing', 'uploading'].includes(status)) {
        building++;
      } else if (['success', 'succeeded'].includes(status)) {
        succeeded++;
      } else if (['failure', 'failed', 'error'].includes(status)) {
        failed++;
      }
    }
  }

  document.getElementById('stat-total-projects').innerText = total;
  document.getElementById('stat-building-projects').innerText = building;
  document.getElementById('stat-success-projects').innerText = succeeded;
  document.getElementById('stat-failed-projects').innerText = failed;
}

// Save Settings Event Handler
async function saveAllSettings() {
  const saveBtn = document.getElementById('btn-save-settings');
  const saveStatus = document.getElementById('save-status');
  
  const apiToken = document.getElementById('api-token').value.trim();
  const accountId = document.getElementById('account-id').value.trim();
  const notifyEnabled = document.getElementById('notify-enabled').checked;
  const soundEnabled = document.getElementById('sound-enabled').checked;
  const startupEnabled = document.getElementById('startup-enabled').checked;
  const startMinimized = document.getElementById('start-minimized').checked;
  const closeToTray = document.getElementById('close-to-tray').checked;
  const pollInterval = parseInt(document.getElementById('poll-interval').value);

  // Collect checked projects
  const selectedProjects = [];
  document.querySelectorAll('input[name="monitored-project-checkbox"]:checked').forEach(checkbox => {
    selectedProjects.push(checkbox.value);
  });

  const successSelect = document.getElementById('success-sound-select').value;
  const successSound = successSelect === 'custom' ? document.getElementById('success-custom-path').value.trim() : successSelect;

  const failureSelect = document.getElementById('failure-sound-select').value;
  const failureSound = failureSelect === 'custom' ? document.getElementById('failure-custom-path').value.trim() : failureSelect;

  const cancelledSelect = document.getElementById('cancelled-sound-select').value;
  const cancelledSound = cancelledSelect === 'custom' ? document.getElementById('cancelled-custom-path').value.trim() : cancelledSelect;

  if (!apiToken || !accountId) {
    saveStatus.className = 'save-status-msg error';
    saveStatus.innerText = 'Credentials cannot be empty.';
    return;
  }

  if (selectedProjects.length === 0) {
    saveStatus.className = 'save-status-msg error';
    saveStatus.innerText = 'Select at least one project to watch.';
    return;
  }

  if (successSelect === 'custom' && !successSound) {
    saveStatus.className = 'save-status-msg error';
    saveStatus.innerText = 'Please select a custom audio path for Success builds.';
    return;
  }
  if (failureSelect === 'custom' && !failureSound) {
    saveStatus.className = 'save-status-msg error';
    saveStatus.innerText = 'Please select a custom audio path for Failure builds.';
    return;
  }
  if (cancelledSelect === 'custom' && !cancelledSound) {
    saveStatus.className = 'save-status-msg error';
    saveStatus.innerText = 'Please select a custom audio path for Cancelled builds.';
    return;
  }

  saveBtn.disabled = true;
  saveStatus.className = 'save-status-msg';
  saveStatus.innerText = 'Saving preferences...';

  try {
    // Write registry startup path
    await window.api.setStartupStatus(startupEnabled);
    
    // Save to configuration JSON
    const updatedConfig = await window.api.saveConfig({
      apiToken,
      accountId,
      projects: selectedProjects,
      pollInterval,
      soundEnabled,
      notifyEnabled,
      startMinimized,
      closeToTray,
      successSound,
      failureSound,
      cancelledSound
    });

    localConfig = updatedConfig;
    
    saveStatus.className = 'save-status-msg success';
    saveStatus.innerText = 'Settings saved successfully!';
  } catch (err) {
    saveStatus.className = 'save-status-msg error';
    saveStatus.innerText = `Save failed: ${err.message}`;
  } finally {
    saveBtn.disabled = false;
  }
}

// Load configurations from main process on startup
async function initApp() {
  // Navigation tabs bind
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-target'));
    });
  });

  // Frameless Window controls
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.api.windowMinimize();
  });
  document.getElementById('btn-close').addEventListener('click', () => {
    window.api.windowClose();
  });

  // Manual Trigger Synchronizer
  const syncBtn = document.getElementById('btn-manual-sync');
  syncBtn.addEventListener('click', async () => {
    syncBtn.classList.add('spinning');
    // Refresh background state
    const state = await window.api.getState();
    updateUI(state);
    setTimeout(() => {
      syncBtn.classList.remove('spinning');
    }, 1000);
  });

  // Clear feed logs button
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('logs-terminal-view').innerHTML = '<div class="log-line system">[SYSTEM] Activity feed cleared. Listening...</div>';
  });

  // Token visibility button
  const tokenInput = document.getElementById('api-token');
  const toggleTokenBtn = document.getElementById('btn-toggle-token');
  toggleTokenBtn.addEventListener('click', () => {
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
      toggleTokenBtn.innerText = '🙈';
    } else {
      tokenInput.type = 'password';
      toggleTokenBtn.innerText = '👁️';
    }
  });

  // Polling Slider value binder
  const slider = document.getElementById('poll-interval');
  const sliderVal = document.getElementById('poll-interval-val');
  slider.addEventListener('input', () => {
    sliderVal.innerText = `${slider.value}s`;
  });

  // Project checklist search query filter
  const searchInput = document.getElementById('project-search');
  searchInput.addEventListener('input', () => {
    renderChecklistElements(searchInput.value);
  });

  // Verify and Load Projects checklist
  document.getElementById('btn-fetch-projects').addEventListener('click', async () => {
    const fetchSpinner = document.getElementById('fetch-spinner');
    const msgDiv = document.getElementById('credentials-status');
    const apiToken = document.getElementById('api-token').value.trim();
    const accountId = document.getElementById('account-id').value.trim();

    if (!apiToken || !accountId) {
      msgDiv.className = 'status-msg error';
      msgDiv.innerText = 'Please fill out both credentials.';
      return;
    }

    fetchSpinner.classList.remove('hidden');
    msgDiv.innerText = '';
    
    const success = await loadProjectsChecklist(apiToken, accountId);
    fetchSpinner.classList.add('hidden');

    if (success) {
      msgDiv.className = 'status-msg success';
      msgDiv.innerText = 'Credentials verified! Projects loaded below.';
    } else {
      msgDiv.className = 'status-msg error';
      msgDiv.innerText = 'Failed to verify. Check token permissions and Account ID.';
    }
  });

  // Bind Save Settings
  document.getElementById('btn-save-settings').addEventListener('click', saveAllSettings);

  // Load initial settings parameters
  try {
    localConfig = await window.api.getConfig();
    const startupStatus = await window.api.getStartupStatus();

    // Set configuration DOM inputs
    document.getElementById('api-token').value = localConfig.apiToken || '';
    document.getElementById('account-id').value = localConfig.accountId || '';
    document.getElementById('notify-enabled').checked = localConfig.notifyEnabled !== false;
    document.getElementById('sound-enabled').checked = localConfig.soundEnabled !== false;
    document.getElementById('startup-enabled').checked = startupStatus;
    document.getElementById('start-minimized').checked = localConfig.startMinimized || false;
    document.getElementById('close-to-tray').checked = localConfig.closeToTray !== false;
    document.getElementById('poll-interval').value = localConfig.pollInterval || 10;
    sliderVal.innerText = `${localConfig.pollInterval || 10}s`;

    // If config contains credentials, trigger project fetch immediately in settings
    if (localConfig.apiToken && localConfig.accountId) {
      loadProjectsChecklist(localConfig.apiToken, localConfig.accountId);
    }

    // Bind custom sounds config rows
    setupSoundRow('success', 'success');
    setupSoundRow('failure', 'failure');
    setupSoundRow('cancelled', 'cancelled');

  } catch (err) {
    console.error('Initialization loading configs failed:', err);
  }

  // Setup sound row element helper
  function setupSoundRow(prefix, defaultValue) {
    const select = document.getElementById(`${prefix}-sound-select`);
    const pathGroup = document.getElementById(`${prefix}-custom-path-group`);
    const pathInput = document.getElementById(`${prefix}-custom-path`);
    const browseBtn = document.getElementById(`btn-browse-${prefix}`);
    const testBtn = document.getElementById(`btn-test-${prefix}-sound`);
    
    // Set initial state
    const currentVal = localConfig[`${prefix}Sound`] || defaultValue;
    const isCustom = currentVal && (currentVal.includes('\\') || currentVal.includes('/') || currentVal.includes(':'));
    
    if (isCustom) {
      select.value = 'custom';
      pathGroup.classList.remove('hidden');
      pathInput.value = currentVal;
    } else {
      select.value = currentVal || defaultValue;
      pathGroup.classList.add('hidden');
      pathInput.value = '';
    }
    
    // Toggle input visibility
    select.addEventListener('change', () => {
      if (select.value === 'custom') {
        pathGroup.classList.remove('hidden');
      } else {
        pathGroup.classList.add('hidden');
      }
    });
    
    // Browse native file dialogue
    browseBtn.addEventListener('click', async () => {
      const file = await window.api.selectAudioFile();
      if (file) {
        pathInput.value = file;
      }
    });
    
    // Play test trigger
    testBtn.addEventListener('click', () => {
      const val = select.value === 'custom' ? pathInput.value.trim() : select.value;
      if (val) {
        window.api.playSound(val);
      }
    });
  }

  // Load active project states and event logs
  const appState = await window.api.getState();
  updateUI(appState);

  // Poll appState updates from background process
  window.api.onStateUpdate((state) => {
    updateUI(state);
  });

  // Re-poll every 2 seconds to update the dynamic relative time badges on the grid
  setInterval(async () => {
    if (document.getElementById('tab-dashboard').classList.contains('active')) {
      const state = await window.api.getState();
      updateUI(projectCardTimesOnly(state));
    }
  }, 2000);
}

// Refresh project card UI details
function updateUI(state) {
  if (!state) return;
  
  const timeBadge = document.getElementById('last-updated-time');
  timeBadge.innerText = `Checked: ${new Date().toLocaleTimeString()}`;

  updateStatWidgets(state.projectStates, state.config.projects);
  renderProjectGrid(state.projectStates, state.config.projects);
  renderLogs(state.eventLogs);
}

// Sub-component helper to refresh time stamps without rebuilding the elements entirely if performance is needed.
// For now, simple re-render is fast since lists are usually small (< 100 projects).
function projectCardTimesOnly(state) {
  return state;
}

// Kickstart App Initializer
document.addEventListener('DOMContentLoaded', initApp);
