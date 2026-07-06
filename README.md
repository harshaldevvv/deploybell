# Cloudflare Pages Deployment Notifier

A Chrome extension (Manifest V3) that quietly watches the **Cloudflare Pages
dashboard** and alerts you with a **loud sound** and a **desktop notification**
the moment a deployment **succeeds**, **fails**, or is **cancelled** — so you
never have to sit and refresh the page waiting for a build.

<p align="center">
  <img src="icons/icon128.png" width="88" alt="Extension icon" />
</p>

- **No Cloudflare API. No tokens. No backend. No external services.**
- Detection is done entirely by observing the dashboard page in your browser.
- Different, loud sounds for success / failure / cancelled.
- Toolbar badge, status popup with a live elapsed timer, and a settings page.

---

## Table of contents

- [How it works](#how-it-works)
- [Install (beginner-friendly guide)](#install-beginner-friendly-guide)
- [Usage](#usage)
- [Testing](#testing)
- [Settings](#settings)
- [Architecture](#architecture)
- [How deployment detection works](#how-deployment-detection-works)
- [Permissions and why each is needed](#permissions-and-why-each-is-needed)
- [Customizing](#customizing)
  - [Change the notification sounds](#change-the-notification-sounds)
  - [Change the polling interval](#change-the-polling-interval)
- [Building a ZIP for distribution](#building-a-zip-for-distribution)
- [Debugging with Chrome DevTools](#debugging-with-chrome-devtools)
- [Updating after code changes](#updating-after-code-changes)
- [Enabling / disabling / removing](#enabling--disabling--removing)
- [Troubleshooting](#troubleshooting)
- [Limitations & future improvements](#limitations--future-improvements)
- [Contributing](#contributing)
- [License](#license)

---

## How it works

1. You open a Cloudflare Pages **deployment page** (or a project's deployments
   list) and trigger a deploy as usual.
2. A content script running on `dash.cloudflare.com` watches that page and
   detects when a deployment is **building**.
3. When the status changes to a **final** state, the background service worker
   immediately plays a sound and shows a desktop notification such as:

   ```
   ✅ Deployment Complete
   Project:
   ballengine

   Status:
   Success
   ```

The extension only alerts you for a deployment it actually watched go from
*running* to *finished*, so simply opening an old, already-finished page won't
trigger a false alarm.

---

## Install (beginner-friendly guide)

> This assumes you have never installed a Chrome extension before. It takes
> about two minutes.

### 1. Get the folder

Download or clone this repository so you have a folder named
`cloudflare-pages-deploy-notifier` on your computer. The folder should contain
`manifest.json` at its top level.

**Folder structure you should see:**

```
cloudflare-pages-deploy-notifier/
├── manifest.json        ← Chrome reads this first
├── background.js        ← service worker (state + notifications)
├── content.js           ← watches the dashboard page
├── offscreen.html/.js   ← plays audio (MV3 requirement)
├── popup.html/.js/.css  ← toolbar popup
├── options.html/.js/.css← settings page
├── utils/               ← shared constants & helpers
├── icons/               ← extension icons (PNG)
├── sounds/              ← notification sounds (WAV)
├── scripts/             ← asset generators & zip packer
└── README.md
```

Everything needed is already generated and committed — **there is no build
step**.

### 2. Open the extensions page

In Chrome, go to the address bar and enter:

```
chrome://extensions
```

(Or: **⋮ menu → Extensions → Manage Extensions**.) Works the same in Edge,
Brave, and Arc.

### 3. Enable Developer Mode

Turn on the **Developer mode** toggle in the **top-right** corner.

### 4. Load the extension

Click **Load unpacked** (top-left) and select the
`cloudflare-pages-deploy-notifier` folder (the one containing `manifest.json`).

### 5. Verify it installed correctly

- A card titled **“Cloudflare Pages Deployment Notifier”** appears with no
  errors.
- Its icon (an orange tile) shows in the toolbar. If hidden, click the puzzle-
  piece **Extensions** button and **pin** it.
- Click the icon — the popup opens and shows **Monitoring: Yes** (auto-start is
  on by default).

### 6. Permissions

Chrome may note the permissions it uses (storage, notifications). There is no
sign-in and no token to enter. The first desktop notification may prompt your
operating system to allow notifications from Chrome — click **Allow**.

### 7. Test it

Open the popup and click **Test Notification**. You should hear a sound and see
a desktop notification. If you don't, see [Troubleshooting](#troubleshooting).

You're done — leave a Pages deployment page open and you'll be alerted when it
finishes.

---

## Usage

1. Make sure **Monitoring** is on (popup shows *Monitoring: Yes*, or click
   **Start Monitoring**).
2. Go to your project on the Cloudflare dashboard and open the deployment you
   want to watch (or the project's **Deployments** tab).
3. Trigger / wait for the deployment. Keep the tab open (it can be in the
   background).
4. When it finishes you get a sound + notification. Clicking the notification
   opens the Workers & Pages dashboard.

**Popup shows:** whether monitoring is on, the current status, the project
name, and a live **elapsed time** for the running deployment.

**Buttons:** Start/Stop Monitoring, Test Notification, Open Cloudflare Pages,
and Settings.

**Toolbar badge:**

| Badge | Meaning |
| --- | --- |
| _(none, gray)_ | Idle — monitoring off |
| `•` blue | Watching, no active deployment |
| `•` orange | Deployment building |
| `✓` green | Last deployment succeeded |
| `!` red | Last deployment failed |
| `⚠` amber | Last deployment cancelled |

---

## Testing

- **Instant test:** popup → **Test Notification** (plays the success sound and
  shows a notification without needing a real deployment).
- **Preview each sound:** Settings page → ▶ next to each sound.
- **Real test:** trigger a deployment in Cloudflare Pages with a watched tab
  open and confirm you're alerted when it finishes.

---

## Settings

Open via the popup's **Settings** link, or `chrome://extensions` → this
extension → **Details → Extension options**.

- **Poll interval** — 5 / 10 / 15 / 30 seconds (DOM re-check cadence).
- **Auto-start monitoring** — begin watching automatically when Chrome opens.
- **Desktop notifications** — on/off.
- **Notification sound** — on/off, plus a **volume** slider.
- **Toolbar badge updates** — on/off.
- **Sounds** — pick a different sound per outcome (success / failure /
  cancelled) from the built-in library.

Click **Save settings**. Changes apply immediately to the running monitor.

---

## Architecture

```
┌────────────────────┐   status messages    ┌──────────────────────┐
│   content.js       │ ───────────────────► │   background.js      │
│ (dash.cloudflare)  │                      │  (service worker)    │
│ MutationObserver + │                      │  • state machine     │
│ polling → reads    │                      │  • dedup logic       │
│ status badge text  │                      │  • badge / title     │
└────────────────────┘                      │  • notifications     │
                                            │  • sound (offscreen) │
                                            └───────┬──────────────┘
                        chrome.storage.local        │ play
                     (settings + runtime state)     ▼
        ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
        │  popup.*     │   │  options.*   │   │ offscreen.*  │
        │ status + UI  │   │  settings    │   │  Audio API   │
        └──────────────┘   └──────────────┘   └──────────────┘
```

- **content.js** observes the page and reports status changes. It runs per tab
  and is intentionally "dumb" — all decisions live in the worker.
- **background.js** is the single source of truth: it tracks whether the current
  deployment was seen running, decides when to notify (once), and drives the
  badge, notifications, and sound.
- **offscreen.html/js** exists solely because MV3 service workers can't play
  audio; the worker spins it up on demand.
- **utils/** holds shared constants (`constants.js`), status classification
  (`status.js`), and storage helpers (`storage.js`), loaded as plain scripts in
  every context so there's no bundler.
- **chrome.storage.local** persists settings and state, so monitoring survives
  the service worker being suspended.

Modularity note: the content script, service worker, and extension pages all
share the same `utils/*.js` files (via the content-scripts array, `importScripts`,
and `<script>` tags respectively), so logic isn't duplicated and there is no
build step.

---

## How deployment detection works

The extension does **not** call any API. Instead the content script reads the
dashboard DOM using two complementary mechanisms:

- **MutationObserver** on `document.body` — reacts near-instantly when the
  single-page app updates the status (debounced by 600 ms so bursts of DOM
  changes cause only one scan).
- **Polling** at your configured interval (default 10 s) — a safety net in case
  a mutation is missed.

Each scan:

1. Confirms the URL is a Pages project/deployment page
   (`/pages/view/<project>[/<deploymentId>]`) and extracts the project name.
2. Walks the page's text nodes and keeps only those whose text is an **exact,
   single-word status badge**: `Queued`, `Initializing`, `Building`,
   `Deploying`, `Success`, `Failed`, `Canceled`, etc.
3. Picks the **top-most** such badge — that's the header/latest-row badge
   representing the deployment's overall status.
4. Normalizes it to `running` / `success` / `failed` / `cancelled` and, if it
   changed, sends it to the service worker.

**Why exact single words?** Build-log *stage labels* are phrases like
"Building application" or "Deploying to Cloudflare's global network". Matching
only exact single-word badges ignores those phrases, so the detector doesn't
get confused by stage text and doesn't depend on brittle CSS class names.

**Avoiding false / duplicate alerts:** the service worker only fires a
notification when it has actually observed the deployment in a *running* state
first, and it records a per-deployment key so the same finish never notifies
twice — even across page refreshes or multiple open tabs.

---

## Permissions and why each is needed

| Permission | Why it's required |
| --- | --- |
| `storage` | Save your settings and the last-seen deployment state locally. |
| `notifications` | Show the desktop notification when a deployment finishes. |
| `offscreen` | Create the offscreen document that plays the sound (MV3 service workers cannot use the Audio API). |
| Content-script host `https://dash.cloudflare.com/*` | Inject the observer script **only** on the Cloudflare dashboard so it can read deployment status. No other sites are accessed. |

There are **no** host permissions for any API, and no `tabs` permission —
opening the dashboard uses `chrome.tabs.create`, which doesn't require it.

---

## Customizing

### Change the notification sounds

Two ways:

**A. Pick a different built-in sound** — Settings page → **Sounds** → choose per
outcome → **Save**. Preview with ▶.

**B. Add your own sound**

1. Put an audio file (`.wav`, `.mp3`, or `.ogg`) in the `sounds/` folder, e.g.
   `sounds/my-alert.mp3`.
2. Add it to the library list in `utils/constants.js`:
   ```js
   const CFPN_SOUND_LIBRARY = [
     // …existing entries…
     { file: "my-alert.mp3", label: "My Alert" },
   ];
   ```
3. Reload the extension (see [Updating](#updating-after-code-changes)), open
   Settings, select it, and Save.

The built-in sounds are generated by `scripts/gen-sounds.js`. To tweak them
(pitch, length, loudness), edit that file and run `npm run sounds`.

### Change the polling interval

- **Easiest:** Settings page → **Check every** → 5/10/15/30 s → **Save**.
- **Change the default** in `utils/constants.js`:
  ```js
  const CFPN_DEFAULT_SETTINGS = { pollInterval: 10, /* … */ };
  ```
  Remember the MutationObserver already catches most updates instantly; polling
  is just a fallback, so there's rarely a need to go below 10 s.

---

## Building a ZIP for distribution

To produce a zip suitable for sharing or uploading to the Chrome Web Store:

```bash
npm run zip
```

This writes `dist/cf-pages-notifier-v<version>.zip` containing only the runtime
files (no `scripts/`, `node_modules`, or docs). The packer is pure Node (built
on `zlib`) — it needs **no external `zip` tool** and works the same on Windows,
macOS, and Linux. Alternatively just select all the runtime files/folders in
your file manager and "Compress" them — the zip must have `manifest.json` at its
root.

---

## Debugging with Chrome DevTools

- **Service worker (background):** `chrome://extensions` → this extension →
  **Inspect views: service worker**. Console logs from `background.js`
  (prefixed `[CFPN]`) appear here. If it says *inactive*, click it to wake it.
- **Content script:** open the Cloudflare dashboard tab → **F12** → **Console**.
  Content-script errors show here. Use the **Sources** panel to set breakpoints
  in `content.js`.
- **Popup:** right-click the popup → **Inspect**.
- **Options page:** open it, then **F12**.
- **Storage:** in any of the above DevTools, run
  `chrome.storage.local.get(console.log)` to see current `settings`, `state`,
  and `notified` data.
- **Notifications not appearing?** Check your OS notification settings for
  Chrome, and Chrome's **Focus Assist / Do Not Disturb**.

---

## Updating after code changes

1. Edit the files.
2. Go to `chrome://extensions`.
3. Click the **reload ↻** icon on this extension's card.
   - Changes to `background.js`, `content.js`, `manifest.json`, or `utils/`
     require this reload. For content-script changes, also **refresh the
     Cloudflare dashboard tab** so the new script is injected.
   - Changes to `popup.*` / `options.*` take effect the next time you open them.
4. If you changed generated assets, regenerate first: `npm run assets`
   (icons + sounds).

---

## Enabling / disabling / removing

- **Disable temporarily:** `chrome://extensions` → toggle this extension **off**
  (keeps your settings).
- **Re-enable:** toggle it back **on**.
- **Stop monitoring without disabling:** popup → **Stop Monitoring**.
- **Remove completely:** `chrome://extensions` → **Remove**, or right-click the
  toolbar icon → **Remove from Chrome**. This deletes all stored settings.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No sound on Test | Ensure **sound** is enabled and volume > 0 in Settings. Some OSes mute background audio — check the system mixer. Reload the extension. |
| No desktop notification | Allow notifications for Chrome in your OS settings; disable Do Not Disturb. Confirm **desktop notifications** are enabled in Settings. |
| Nothing detected on a real deploy | Confirm the tab URL matches `dash.cloudflare.com/.../pages/view/<project>`. Refresh the dashboard tab so the content script reloads. Make sure **Monitoring: Yes**. |
| Notified for an old deployment | Shouldn't happen — alerts require the deploy to be seen *running* first. If it does, file an issue with the page URL. |
| Popup elapsed time stuck | The timer freezes on finish by design; it resets when a new deployment starts building. |
| Service worker shows "inactive" | Normal in MV3 — it wakes on the next event. Click it in `chrome://extensions` to inspect. |

---

## Limitations & future improvements

Because detection is **DOM-based**, it has inherent trade-offs:

- **The dashboard tab must stay open.** If you close the deployment page, there
  is nothing to observe. (An API-based approach could monitor without a tab.)
- **It depends on Cloudflare's visible status wording.** The detector matches
  status *words* rather than CSS classes to stay robust, but a future dashboard
  redesign that changes the vocabulary (e.g., renames "Success") would need the
  word list in `utils/status.js` updated.
- **Localization.** The word list is English. Non-English dashboards would need
  their status words added.
- **Granularity.** It reports building → final; it doesn't expose per-stage
  progress or build logs.

**Possible future improvements:**

- Optional **Cloudflare API mode** (with a read-only token) to monitor without
  keeping a tab open and to support projects you're not currently viewing. This
  repo's earlier revision contains a working API client that could be offered as
  an alternate backend.
- A small **selector-learning** fallback that adapts if the badge wording
  changes.
- **Per-project rules** and a deployment **history** view in the popup.
- Automated tests for the status classifier and packaging via GitHub Actions.

---

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Privacy details
are in [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © 2026 Harshal Narkhede

---

*Not affiliated with or endorsed by Cloudflare, Inc. "Cloudflare" and
"Cloudflare Pages" are trademarks of Cloudflare, Inc.*
