#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const prompts = require('prompts');
const chalk = require('chalk');

const CONFIG_PATH = path.join(os.homedir(), '.cf-pages-notifier.json');

// Default global config fallback for test mode
let config = {
  apiToken: '',
  accountId: '',
  projects: [],
  pollInterval: 10,
  soundEnabled: true,
  notifyEnabled: true
};

const projectStates = {};
const eventLogs = [];

// Determine sounds directory and handle pkg virtual file system extraction
let soundsDir = path.join(__dirname, 'sounds');

if (process.pkg) {
  const tempSoundsDir = path.join(os.tmpdir(), 'cf-pages-notifier', 'sounds');
  if (!fs.existsSync(tempSoundsDir)) {
    fs.mkdirSync(tempSoundsDir, { recursive: true });
  }
  
  const soundFiles = ['alert.wav', 'cancelled.wav', 'chime.wav', 'ding.wav', 'failure.wav', 'success.wav'];
  for (const file of soundFiles) {
    const srcPath = path.join(__dirname, 'sounds', file);
    const destPath = path.join(tempSoundsDir, file);
    if (!fs.existsSync(destPath)) {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        console.error(`Failed to extract sound asset ${file}:`, err);
      }
    }
  }
  soundsDir = tempSoundsDir;
}

// Helper to play sound using Windows PowerShell SoundPlayer
function playSound(soundName) {
  const soundFile = `${soundName}.wav`;
  const soundPath = path.join(soundsDir, soundFile);
  
  if (!fs.existsSync(soundPath)) {
    console.error(`Sound file not found: ${soundPath}`);
    return;
  }
  
  // Asynchronous playback by spawning PowerShell
  const command = `powershell -c "(New-Object System.Media.SoundPlayer('${soundPath}')).PlaySync()"`;
  exec(command, (err) => {
    if (err) {
      // Fallback audible beep if powershell playback fails
      process.stdout.write('\x07');
    }
  });
}

// Native Windows Toast Notification using PowerShell WinRT API
function showWindowsNotification(title, message) {
  const psScript = `
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $Template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $RawXml = $Template.GetXml()
    ($RawXml.toast.visual.binding.text | Where-Object { $_.id -eq "1" }).AppendChild($RawXml.CreateTextNode('${title.replace(/'/g, "''")}')) | Out-Null
    ($RawXml.toast.visual.binding.text | Where-Object { $_.id -eq "2" }).AppendChild($RawXml.CreateTextNode('${message.replace(/'/g, "''")}')) | Out-Null
    $SerializedXml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $SerializedXml.LoadXml($RawXml.OuterXml)
    $Toast = [Windows.UI.Notifications.ToastNotification]::new($SerializedXml)
    $Notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Cloudflare Pages Notifier')
    $Notifier.Show($Toast)
  `.trim();

  // Convert script to UTF-16LE and Base64 encode for EncodedCommand
  const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');
  exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (err) => {
    if (err) {
      // Fallback: trigger balloon tip using Windows Forms if WinRT fails
      const fallbackScript = `
        [void] [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
        $objNotification = New-Object System.Windows.Forms.NotifyIcon
        $objNotification.Icon = [System.Drawing.SystemIcons]::Information
        $objNotification.BalloonTipIcon = 'Info'
        $objNotification.BalloonTipTitle = '${title.replace(/'/g, "''")}'
        $objNotification.BalloonTipText = '${message.replace(/'/g, "''")}'
        $objNotification.Visible = $True
        $objNotification.ShowBalloonTip(5000)
      `.trim();
      const fallbackBase64 = Buffer.from(fallbackScript, 'utf16le').toString('base64');
      exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${fallbackBase64}`);
    }
  });
}

// Desktop Notifications
function notifyDeployment(projectName, status, deployment) {
  const shortId = deployment.short_id || deployment.id.slice(0, 8);
  const env = deployment.environment || 'production';
  
  let title = '';
  let message = `Project: ${projectName} | Env: ${env} | ID: ${shortId}`;
  let soundName = 'success';
  
  if (status === 'success' || status === 'succeeded') {
    title = `✅ Pages Build Succeeded!`;
    soundName = 'success';
  } else if (['failure', 'failed', 'error'].includes(status)) {
    title = `❌ Pages Build Failed!`;
    soundName = 'failure';
  } else if (['canceled', 'cancelled', 'aborted'].includes(status)) {
    title = `⚠️ Pages Build Cancelled`;
    soundName = 'cancelled';
  } else {
    return;
  }
  
  if (config.notifyEnabled) {
    showWindowsNotification(title, message);
  }
  
  if (config.soundEnabled) {
    playSound(soundName);
  }
}

// CLI Log history
function addLog(text) {
  const timeStr = new Date().toLocaleTimeString();
  eventLogs.push(`[${timeStr}] ${text}`);
  if (eventLogs.length > 8) {
    eventLogs.shift();
  }
}

// Time formatter
function formatTimeAgo(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  const remainingSec = diffSec % 60;
  return `${diffMin}m ${remainingSec}s ago`;
}

// Draw Dashboard GUI
function drawDashboard() {
  console.clear();
  console.log(chalk.bold.cyan('╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║             CLOUDFLARE PAGES BUILD MONITOR               ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════╝'));
  console.log(chalk.gray(`  Account: ${config.accountId} | Poll Cadence: ${config.pollInterval}s`));
  console.log(chalk.gray(`  Last Checked: ${new Date().toLocaleTimeString()} (Daemon Active 24/7)`));
  console.log(chalk.bold.cyan('────────────────────────────────────────────────────────────'));
  
  console.log(
    chalk.bold.white(
      `${'Project'.padEnd(20)} ${'Env'.padEnd(12)} ${'Deploy ID'.padEnd(11)} ${'Status'.padEnd(15)} ${'Updated'}`
    )
  );
  console.log(chalk.gray('────────────────────────────────────────────────────────────'));
  
  for (const name of config.projects) {
    const state = projectStates[name];
    if (!state) {
      console.log(chalk.gray(`${name.padEnd(20)} Fetching status...`));
      continue;
    }
    
    let statusStr = '';
    if (['success', 'succeeded'].includes(state.lastStatus)) {
      statusStr = chalk.bold.green('Success');
    } else if (['failure', 'failed', 'error'].includes(state.lastStatus)) {
      statusStr = chalk.bold.red('Failed');
    } else if (['canceled', 'cancelled', 'aborted'].includes(state.lastStatus)) {
      statusStr = chalk.bold.yellow('Cancelled');
    } else if (state.lastStatus) {
      statusStr = chalk.bold.yellowBright('Building...');
    } else {
      statusStr = chalk.gray('Unknown');
    }
    
    const timeAgo = formatTimeAgo(state.lastTransitionTime);
    
    console.log(
      `${name.padEnd(20)} ` +
      `${state.environment.padEnd(12)} ` +
      `${state.shortId.padEnd(11)} ` +
      `${statusStr.padEnd(25)} ` + 
      `${timeAgo}`
    );
  }
  
  console.log(chalk.bold.cyan('────────────────────────────────────────────────────────────'));
  console.log(chalk.bold.white('Recent Activity:'));
  if (eventLogs.length === 0) {
    console.log(chalk.gray('  Waiting for build events...'));
  } else {
    for (const log of eventLogs) {
      console.log(`  ${log}`);
    }
  }
  console.log(chalk.bold.cyan('────────────────────────────────────────────────────────────'));
  console.log(chalk.gray('  Press Ctrl+C to stop monitor, or minimize this window.'));
}

// Extractor of status field from complex deployment JSON response
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

// Core API fetch and status engine
async function checkProjects() {
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
        addLog(`Started watching ${chalk.bold.yellow(name)} (current status: ${status || 'unknown'})`);
      } else if (deploymentId !== state.lastDeploymentId) {
        // New deployment ID observed
        addLog(`${chalk.bold.yellow(name)}: New build triggered (ID: ${shortId})`);
        
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
          addLog(`${chalk.bold.yellow(name)}: Build completed with status ${chalk.bold(status)}`);
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
          addLog(`${chalk.bold.yellow(name)}: Build completed with status ${chalk.bold(status)}`);
        } else if (!isFinal && wasBuilding) {
          addLog(`${chalk.bold.yellow(name)}: Build status changed to ${status}`);
        }
      }
    } catch (err) {
      addLog(`${chalk.bold.red(name)} error: ${err.message}`);
    }
  });
  
  await Promise.all(promises);
  drawDashboard();
}

// Config prompt Wizard
async function runWizard() {
  console.clear();
  console.log(chalk.bold.cyan('========================================'));
  console.log(chalk.bold.cyan('  Cloudflare Pages Notifier Setup Wizard '));
  console.log(chalk.bold.cyan('========================================\n'));

  console.log(chalk.bold.yellow('Step 1: How to get your Cloudflare API Token:'));
  console.log(chalk.white('  1. Go to your Cloudflare Dashboard (https://dash.cloudflare.com)'));
  console.log(chalk.white('  2. Click on your profile icon in the top right -> "My Profile".'));
  console.log(chalk.white('  3. Select "API Tokens" from the left menu.'));
  console.log(chalk.white('  4. Click "Create Token".'));
  console.log(chalk.white('  5. Find the "Read Cloudflare Pages" template (or click "Create Custom Token"):'));
  console.log(chalk.gray('     - Permissions: Account -> Cloudflare Pages -> Read'));
  console.log(chalk.gray('     - Resources: Include -> All accounts'));
  console.log(chalk.white('  6. Copy and save your generated API Token.'));
  console.log('');
  console.log(chalk.bold.yellow('Step 2: How to get your Cloudflare Account ID:'));
  console.log(chalk.white('  1. Log into your Cloudflare Dashboard.'));
  console.log(chalk.white('  2. Click "Workers & Pages" in the left sidebar.'));
  console.log(chalk.white('  3. Look at the right-hand panel under "Account details": your Account ID is listed there.'));
  console.log(chalk.gray('     (Alternatively, it is the 32-character hex string in your dashboard URL)'));
  console.log(chalk.cyan('------------------------------------------------------------\n'));
  
  let existing = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (_) {}
  }
  
  const credentials = await prompts([
    {
      type: 'text',
      name: 'apiToken',
      message: 'Enter your Cloudflare API Token (requires Pages:Read):',
      initial: existing.apiToken || '',
      validate: val => val ? true : 'API Token is required'
    },
    {
      type: 'text',
      name: 'accountId',
      message: 'Enter your Cloudflare Account ID:',
      initial: existing.accountId || '',
      validate: val => val ? true : 'Account ID is required'
    }
  ]);
  
  if (!credentials.apiToken || !credentials.accountId) {
    console.log(chalk.red('\nSetup cancelled. Credentials are required.'));
    process.exit(1);
  }
  
  console.log(chalk.yellow('\nConnecting to Cloudflare API to fetch your projects...'));
  
  let projects = [];
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/pages/projects`, {
      headers: {
        'Authorization': `Bearer ${credentials.apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'Failed to authenticate');
    }
    
    projects = data.result || [];
  } catch (err) {
    console.error(chalk.red(`\nError fetching projects: ${err.message}`));
    console.log(chalk.yellow('Please check your API Token and Account ID and try again.\n'));
    
    const retry = await prompts({
      type: 'confirm',
      name: 'value',
      message: 'Retry setup?',
      initial: true
    });
    if (retry.value) {
      return runWizard();
    } else {
      process.exit(1);
    }
  }
  
  if (projects.length === 0) {
    console.log(chalk.yellow('\nNo Pages projects found under this account.'));
    console.log('Create a Pages project on Cloudflare first, then configure.');
    process.exit(0);
  }
  
  const projectChoices = projects.map(p => ({
    title: p.name,
    value: p.name,
    selected: existing.projects?.includes(p.name) || false
  }));
  
  const selection = await prompts({
    type: 'multiselect',
    name: 'selectedProjects',
    message: 'Select the Pages projects you want to monitor (Space to select, Enter to confirm):',
    choices: projectChoices,
    hint: '- Space to select. Return to submit',
    min: 1
  });
  
  if (!selection.selectedProjects || selection.selectedProjects.length === 0) {
    console.log(chalk.red('\nSetup cancelled. You must select at least one project.'));
    process.exit(1);
  }
  
  const soundPref = await prompts([
    {
      type: 'confirm',
      name: 'soundEnabled',
      message: 'Enable loud audio sound alerts on build completion?',
      initial: true
    },
    {
      type: 'confirm',
      name: 'notifyEnabled',
      message: 'Enable native desktop notifications?',
      initial: true
    },
    {
      type: 'number',
      name: 'pollInterval',
      message: 'Polling interval (seconds):',
      initial: existing.pollInterval || 10,
      min: 5,
      max: 60
    }
  ]);
  
  const finalConfig = {
    apiToken: credentials.apiToken,
    accountId: credentials.accountId,
    projects: selection.selectedProjects,
    soundEnabled: soundPref.soundEnabled,
    notifyEnabled: soundPref.notifyEnabled,
    pollInterval: soundPref.pollInterval || 10
  };
  
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(finalConfig, null, 2), 'utf8');
  
  console.log(chalk.bold.green('\nConfiguration saved successfully!'));
  console.log(chalk.cyan(`Config file saved at: ${CONFIG_PATH}`));
  console.log('\nStarting notifier daemon in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));
}

// CLI Execution Entry Point
async function main() {
  // Test Command
  if (process.argv.includes('--test')) {
    console.log('Testing sounds and desktop notifications...');
    notifyDeployment('test-project', 'success', { id: 'test-1234', short_id: 'test-123', environment: 'production', url: 'https://dash.cloudflare.com' });
    setTimeout(() => {
      notifyDeployment('test-project', 'failure', { id: 'test-1234', short_id: 'test-123', environment: 'production', url: 'https://dash.cloudflare.com' });
    }, 2500);
    setTimeout(() => {
      notifyDeployment('test-project', 'cancelled', { id: 'test-1234', short_id: 'test-123', environment: 'production', url: 'https://dash.cloudflare.com' });
      console.log('Test completed.');
      process.exit(0);
    }, 5000);
    return;
  }
  
  // Re-run configuration wizard explicitly
  if (process.argv.includes('--config') || !fs.existsSync(CONFIG_PATH)) {
    await runWizard();
  }
  
  // Load configuration
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error(chalk.red(`Failed to parse configuration: ${err.message}`));
    await runWizard();
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  
  // Start Daemon monitoring
  console.log(chalk.green('Initializing Cloudflare Pages Monitor...'));
  
  await checkProjects();
  
  // Keep running live polling loop
  setInterval(checkProjects, config.pollInterval * 1000);
}

main().catch(err => {
  console.error(chalk.red('Fatal error occurred:'), err);
  process.exit(1);
});
