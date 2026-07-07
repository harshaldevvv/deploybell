# Cloudflare Pages Build Notifier (Native Daemon)

A lightweight background daemon and CLI dashboard for Windows that monitors your Cloudflare Pages deployments dynamically via the official Cloudflare API. It triggers **loud system audio sounds** and **native Windows desktop toast notifications** the second a build completes.

No need to keep browser tabs open. It runs silently in the background 24/7.

---

## Features

* 🔊 **Loud Audio Alerts**: Plays custom `.wav` sounds for Success, Failure, and Cancelled builds.
* 🖥️ **Native Desktop Notifications**: Shows native Windows toast notifications that open the deployment URL when clicked.
* 📊 **Live Console Dashboard**: A beautiful, real-time command-line dashboard showing active builds, deployment IDs, environment scopes, and recent transition logs.
* ⚙️ **Interactive Setup Wizard**: Prompts you for your API credentials on first run, fetches all available projects under your account, and lets you select which ones to monitor.
* 📦 **Standalone Executable (`.exe`)**: Package the app into a single executable so it runs anywhere without needing Node.js or `npm` installed.

---

## Getting Started

### 1. Pre-requisites
To watch your builds, you need:
1. A **Cloudflare API Token** with **Pages:Read** permissions.
   * You can create one in your Cloudflare Profile under **API Tokens** -> **Create Token** -> **Read Pages** template.
2. Your **Cloudflare Account ID** (found in your Cloudflare dashboard URL or on the Workers/Pages overview page).

### 2. Running the Standalone Executable
We package the app into a single binary (`dist/cf-pages-notifier.exe`):
1. Double-click the `cf-pages-notifier.exe` file or run it from the Command Prompt/PowerShell.
2. If running for the first time, the **Setup Wizard** will launch:
   * Paste your Cloudflare API Token.
   * Paste your Account ID.
   * Select the Pages projects you want to monitor (use **Spacebar** to check/uncheck projects, and press **Enter** to confirm).
   * Confirm if you want sound alerts and desktop notifications enabled.
3. The live monitor dashboard will start automatically!

---

## CLI Flags & Commands

If running from source (`npm start`) or via the executable, you can use these flags:

* `--test`: Fires test notifications for Success, Failure, and Cancelled statuses immediately to check system audio volume and toast alerts.
* `--config`: Rerun the interactive setup wizard to change API tokens, accounts, or the monitored projects list.

**Examples (using Node):**
```bash
# Run the live monitor
npm start

# Run the setup wizard to change settings
npm run configure

# Test audio and desktop alerts
npm run test-notify
```

**Examples (using Executable):**
```bash
# Run setup wizard
.\cf-pages-notifier.exe --config

# Run tests
.\cf-pages-notifier.exe --test
```

---

## Running 24/7 silently in the Background on Windows

To ensure you are always notified without keeping a terminal window open, use one of the following methods:

### Option A: Run via PM2 (Recommended)
PM2 is a robust Node.js process manager that runs scripts as silent background services.
1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```
2. Start the notifier using Node:
   ```bash
   pm2 start index.js --name "cf-notifier"
   ```
3. To make PM2 start automatically when Windows boots:
   * Install the Windows startup utility:
     ```bash
     npm install -g pm2-windows-startup
     pm2-startup install
     ```
   * Save the current process list:
     ```bash
     pm2 save
     ```

### Option B: Run Hidden via VBScript (Zero-Dependency)
You can launch the executable or script completely hidden (no console window) using a simple VBScript:

1. Create a file named `run-hidden.vbs` in the same directory:
   ```vbs
   CreateObject("Wscript.Shell").Run "cf-pages-notifier.exe", 0, True
   ```
   *(If running from source, replace `"cf-pages-notifier.exe"` with `"node index.js"`).*
2. Double-clicking `run-hidden.vbs` will launch the monitor silently.
3. **To run on startup**: Press `Win + R`, type `shell:startup`, and press Enter. Move a shortcut of `run-hidden.vbs` into this folder. It will now run silently in the background every time your PC boots.
4. **To stop the hidden process**: Open Windows Task Manager, find `Node.js JavaScript Runtime` (or `cf-pages-notifier`), and end the task.

---

## Audio Customization

The sound files are located in the `sounds/` directory:
* `success.wav` - Played on a successful deploy.
* `failure.wav` - Played on a failed build (buzzer sound).
* `cancelled.wav` - Played on a cancelled build.

To customize the sounds, simply replace these files with your own custom `.wav` files (ensure they use the same filenames). If using the compiled `.exe` version, it extracts and plays sounds from `%TEMP%/cf-pages-notifier/sounds/`, so update them in the workspace before compiling.

---

## Compilation / Building the `.exe`
If you make changes to the source code and want to compile a new `.exe`:
```bash
npm run build
```
The binary will be generated under the `dist/` directory.
