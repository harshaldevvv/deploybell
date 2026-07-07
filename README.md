# Cloudflare Pages Build Notifier (Desktop Application)

A premium, production-ready Windows desktop application and background service that monitors your Cloudflare Pages deployments dynamically via the official Cloudflare API. It triggers **native Windows desktop toast notifications** (which open deployment URLs on click) and **audio sound alerts** the instant a build status changes.

The application features a modern dark-themed dashboard with glassmorphic styling, real-time activity feeds, and a system tray (toolbar) residency mode to run silently in the background 24/7.

---

## Key Features

* 🖥️ **Sleek Glassmorphic GUI Dashboard**: Real-time status cards (Success, Failed, Building, Cancelled) showing environment details, short deployment IDs, and relative time tracking.
* ⚙️ **Comprehensive Settings Panel**:
  * **Interactive Project Selection**: Fetch all available pages projects from your Cloudflare account automatically and select which ones to watch using checkboxes.
  * **Volume & Alarm Prefs**: Toggles for sounds/toasts with an interactive sound dropdown selector and "Play Test" triggers.
  * **System Startup Options**: Toggle starting the app automatically on computer boot.
  * **Background Residency**: Toggles for starting minimized directly to the tray and hiding the window to the tray when clicking the close (`X`) button.
  * **Adjustable Polling Cadence**: Slide between 5 seconds (aggressive) and 120 seconds (passive) intervals.
* 📥 **Native System Tray Residency**: Right-click tray menu to open dashboard, trigger manual checks, toggle notification mutes, set startup status, and exit. Double-clicking the tray icon toggles the main window visibility.
* 🔔 **Interactive Notifications**: Desktop toast alerts showing project, environment, and build IDs. Clicking the notification opens the deployment page in your default browser.
* 📦 **Zero-Dependency Portable EXE**: Package the app into a single standalone portable `.exe` executable that runs without requiring Node.js or installer wizard setups.
* 📟 **Legacy CLI Mode**: Keep CLI dashboard monitoring capabilities using `--cli` scripts.

---

## Getting Started

### 1. Requirements
To watch your builds, you need:
1. A **Cloudflare API Token** with **Pages:Read** permissions.
   * Create one in the Cloudflare Dashboard under **My Profile** -> **API Tokens** -> **Create Custom Token**.
   * Set Permission: `Account` -> `Cloudflare Pages` -> `Read`.
   * Set Resources: Include your target account.
2. Your **Cloudflare Account ID** (found under the Pages section in your Cloudflare dashboard URL).

### 2. Installation and Development
To install dependencies and start the app in development:
```bash
# Install dependencies
npm install

# Start the desktop application
npm start
```

### 3. Build Production Executable
You can compile a standalone, portable `.exe` file that works on any Windows x64 computer without Node.js installed:
```bash
npm run dist
```
The packaged executable will be generated under the `dist/` directory as `Cloudflare Pages Notifier.exe`.

---

## App Interface & Settings

### Navigation
The left sidebar lets you switch between:
1. **Dashboard**: Live view of watched projects, counts of active builds, failures, successes, and deployment click-through links.
2. **Settings**: Configuration editor (token validation, project checker, alert toggles, sound tester, startup options, slider intervals).
3. **Activity Logs**: Monospaced logging feed detailing background API check events, network states, and status transitions.

### Background and Startup
- **Run on Boot**: When enabled, the application registers itself in the Windows Registry to load automatically on startup.
- **Start Minimized**: Launches the app directly into the taskbar system tray without drawing the dashboard window.
- **Close to Tray**: Clicking the `X` button will keep the background monitoring loop running in the tray. To fully close the application, right-click the tray icon and select **Exit App**.

---

## Sound Customization
The sound effects are stored inside the `sounds/` directory:
- `success.wav` - Played on a successful deploy.
- `failure.wav` - Played on a failed build.
- `cancelled.wav` - Played on a cancelled build.
- `chime.wav`, `ding.wav`, `alert.wav` - Alternative system sounds.

You can customize the alerts by replacing these files with your own custom `.wav` files (keeping the same filenames) prior to building the distribution executable.

---

## Legacy Command Line Interface (CLI)
If you prefer running the command-line utility:
```bash
# Run CLI monitor
npm run cli

# Run CLI configuration wizard
npm run cli:configure

# Test CLI desktop notifications and audio alerts
npm run cli:test-notify
```
All settings (API token, account, project choices, preferences) are shared between the GUI desktop app and CLI modes via the persistent `~/.cf-pages-notifier.json` file in your home folder.

---

## License
MIT
