const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

const CONFIG_PATH = path.join(os.homedir(), '.cf-pages-notifier.json');

// Default global config fallback
let config = {
  apiToken: '',
  accountId: '',
  projects: [],
  pollInterval: 10,
  soundEnabled: true,
  notifyEnabled: true,
  startMinimized: false,
  closeToTray: true,
  successSound: 'success',
  failureSound: 'failure',
  cancelledSound: 'cancelled'
};

let mainWindow = null;
let tray = null;
let pollingIntervalId = null;
let isQuitting = false;

// Project state registry and event logs
const projectStates = {};
const eventLogs = [];

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config = { ...config, ...data };
    } catch (err) {
      console.error('Failed to parse config file:', err);
    }
  }
}

function saveConfig(newConfig) {
  config = { ...config, ...newConfig };
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    // Restart polling with new interval if configuration changed
    restartPolling();
    // Update system tray menu state to reflect changes
    updateTrayMenu();
  } catch (err) {
    console.error('Failed to save config file:', err);
  }
}

function addLog(text) {
  const timeStr = new Date().toLocaleTimeString();
  eventLogs.push(`[${timeStr}] ${text}`);
  if (eventLogs.length > 30) {
    eventLogs.shift();
  }
  // Send update to renderer if window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-update', getAppState());
  }
}

// System tray icon assets.
// Fallback: Use standard build resources or custom icons. We will look for sounds and assets in standard locations.
function getTrayIconPath() {
  // If we have an icon png/ico, return it, otherwise fallback to index.html or empty string (which Electron handles)
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  if (fs.existsSync(iconPath)) return iconPath;
  
  // In development, if tray.png doesn't exist, we can use a blank or standard system icon path
  return path.join(__dirname, 'assets', 'icon.png');
}

function playSound(soundNameOrPath) {
  let soundPath;
  if (soundNameOrPath && (fs.existsSync(soundNameOrPath) || path.isAbsolute(soundNameOrPath))) {
    soundPath = soundNameOrPath;
  } else {
    const soundFile = `${soundNameOrPath}.wav`;
    const soundsDir = path.join(__dirname, 'sounds');
    soundPath = path.join(soundsDir, soundFile);
  }
  
  if (!fs.existsSync(soundPath)) {
    console.error(`Sound file not found: ${soundPath}`);
    return;
  }
  
  // Escape single quotes for PowerShell filepath
  const escapedPath = soundPath.replace(/'/g, "''");
  
  // Asynchronous playback by spawning PowerShell SoundPlayer
  const command = `powershell -c "(New-Object System.Media.SoundPlayer('${escapedPath}')).PlaySync()"`;
  exec(command, (err) => {
    if (err) {
      // Fallback audible beep
      process.stdout.write('\x07');
    }
  });
}

function notifyDeployment(projectName, status, deployment) {
  const shortId = deployment.short_id || deployment.id.slice(0, 8);
  const env = deployment.environment || 'production';
  const buildUrl = deployment.url;
  
  let title = '';
  let message = `Project: ${projectName} | Env: ${env} | ID: ${shortId}`;
  let soundName = 'success';
  
  if (status === 'success' || status === 'succeeded') {
    title = `✅ Pages Build Succeeded!`;
    soundName = config.successSound || 'success';
  } else if (['failure', 'failed', 'error'].includes(status)) {
    title = `❌ Pages Build Failed!`;
    soundName = config.failureSound || 'failure';
  } else if (['canceled', 'cancelled', 'aborted'].includes(status)) {
    title = `⚠️ Pages Build Cancelled`;
    soundName = config.cancelledSound || 'cancelled';
  } else {
    return;
  }
  
  if (config.notifyEnabled) {
    const notification = new Notification({
      title: title,
      body: message,
      icon: path.join(__dirname, 'assets', 'icon.png')
    });
    
    notification.on('click', () => {
      if (buildUrl) {
        shell.openExternal(buildUrl);
      }
    });
    
    notification.show();
  }
  
  if (config.soundEnabled) {
    playSound(soundName);
  }
}

function getDeploymentStatus(deployment) {
  if (!deployment) return null;
  if (deployment.latest_stage && deployment.latest_stage.status) {
    return deployment.latest_stage.status;
  }
  if (deployment.status) {
    return deployment.status;
  }
  if (Array.isArray(deployment.stages)) {
    const lastStage = deployment.stages[deployment.stages.length - 1];
    if (lastStage && lastStage.status) {
      return lastStage.status;
    }
  }
  return null;
}

async function checkProjects() {
  if (!config.apiToken || !config.accountId || !config.projects || config.projects.length === 0) {
    return;
  }
  
  const promises = config.projects.map(async (name) => {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/pages/projects/${name}/deployments?per_page=1`,
        {
          headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const data = await response.json();
      if (!data.success || !data.result || data.result.length === 0) {
        return;
      }
      
      const deployment = data.result[0];
      const deploymentId = deployment.id;
      const status = getDeploymentStatus(deployment);
      const shortId = deployment.short_id || deploymentId.slice(0, 8);
      const environment = deployment.environment || 'production';
      const url = deployment.url;
      const createdOn = deployment.created_on;
      
      const state = projectStates[name];
      if (!state) {
        // Initial setup on start
        const isRunning = ['active', 'queued', 'building', 'deploying', 'initializing', 'uploading'].includes(status);
        projectStates[name] = {
          lastDeploymentId: deploymentId,
          lastStatus: status,
          shortId,
          environment,
          url,
          createdOn,
          lastTransitionTime: Date.now(),
          notified: !isRunning
        };
        addLog(`Started watching ${name} (status: ${status || 'unknown'})`);
      } else if (deploymentId !== state.lastDeploymentId) {
        // New deployment ID observed
        addLog(`${name}: New build triggered (ID: ${shortId})`);
        
        const isFinal = ['success', 'succeeded', 'failure', 'failed', 'error', 'canceled', 'cancelled', 'aborted'].includes(status);
        
        state.lastDeploymentId = deploymentId;
        state.lastStatus = status;
        state.shortId = shortId;
        state.environment = environment;
        state.url = url;
        state.createdOn = createdOn;
        state.lastTransitionTime = Date.now();
        state.notified = isFinal;
        
        if (isFinal) {
          notifyDeployment(name, status, deployment);
          addLog(`${name}: Build completed with status: ${status}`);
        }
      } else if (status !== state.lastStatus) {
        // Same deployment ID, status updated
        const wasBuilding = !['success', 'succeeded', 'failure', 'failed', 'error', 'canceled', 'cancelled', 'aborted'].includes(state.lastStatus);
        const isFinal = ['success', 'succeeded', 'failure', 'failed', 'error', 'canceled', 'cancelled', 'aborted'].includes(status);
        
        state.lastStatus = status;
        state.lastTransitionTime = Date.now();
        
        if (isFinal && !state.notified) {
          state.notified = true;
          notifyDeployment(name, status, deployment);
          addLog(`${name}: Build completed with status: ${status}`);
        } else if (!isFinal && wasBuilding) {
          addLog(`${name}: Build status changed to ${status}`);
        }
      }
    } catch (err) {
      addLog(`Error checking ${name}: ${err.message}`);
    }
  });
  
  await Promise.all(promises);
}

function startPolling() {
  stopPolling();
  
  // Run immediate check
  checkProjects();
  
  const intervalSec = Math.max(5, config.pollInterval || 10);
  pollingIntervalId = setInterval(checkProjects, intervalSec * 1000);
}

function stopPolling() {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}

function restartPolling() {
  startPolling();
}

function getAppState() {
  return {
    projectStates,
    eventLogs,
    config
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 880,
    height: 660,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Frameless window for premium design
    transparent: false, // Solid background
    backgroundColor: '#121216', // Slate dark background
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    if (!config.startMinimized) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (event) => {
    if (config.closeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = getTrayIconPath();
  tray = new Tray(iconPath);
  
  tray.setToolTip('Cloudflare Pages Notifier');
  
  tray.on('double-click', () => {
    toggleWindow();
  });
  
  updateTrayMenu();
}

function toggleWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const runOnStartup = app.getLoginItemSettings().openAtLogin;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Cloudflare Pages Notifier',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: 'Check Projects Now',
      click: () => {
        addLog('Manual check triggered from tray.');
        checkProjects();
      }
    },
    { type: 'separator' },
    {
      label: 'Mute Sounds',
      type: 'checkbox',
      checked: !config.soundEnabled,
      click: (item) => {
        saveConfig({ soundEnabled: !item.checked });
      }
    },
    {
      label: 'Disable Notifications',
      type: 'checkbox',
      checked: !config.notifyEnabled,
      click: (item) => {
        saveConfig({ notifyEnabled: !item.checked });
      }
    },
    {
      label: 'Start on Startup',
      type: 'checkbox',
      checked: runOnStartup,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          path: process.execPath
        });
        addLog(`Run on startup ${item.checked ? 'enabled' : 'disabled'}`);
      }
    },
    { type: 'separator' },
    {
      label: 'Exit App',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    loadConfig();
    createTray();
    createMainWindow();
    startPolling();

    // Check if sounds dir exists, copy default ones if needed
    // The sounds directory should exist in local path
    const soundsDir = path.join(__dirname, 'sounds');
    if (!fs.existsSync(soundsDir)) {
      fs.mkdirSync(soundsDir, { recursive: true });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (!config.closeToTray || isQuitting)) {
    app.quit();
  }
});

// IPC Handler Declarations
ipcMain.handle('get-config', () => {
  return config;
});

ipcMain.handle('save-config', (event, newConfig) => {
  saveConfig(newConfig);
  return config;
});

ipcMain.handle('get-state', () => {
  return getAppState();
});

ipcMain.handle('fetch-projects', async (event, apiToken, accountId) => {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'Failed to authenticate');
    }
    return { success: true, projects: data.result || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('play-sound', (event, soundName) => {
  playSound(soundName);
  return true;
});

ipcMain.handle('select-audio-file', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Custom WAV Notification Sound',
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['wav'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-startup-status', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-startup-status', (event, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: process.execPath
  });
  updateTrayMenu();
  return enable;
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    if (config.closeToTray) {
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  }
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});
