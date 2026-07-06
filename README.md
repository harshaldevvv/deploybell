# Cloudflare Pages Deploy Notifier

A lightweight Chrome extension (Manifest V3) that watches your **Cloudflare Pages** projects and raises a desktop notification the moment a deployment **starts building**, **succeeds**, or **fails** — so you don't have to keep a dashboard tab open.

<p align="center">
  <img src="icons/icon128.png" width="96" alt="Extension icon" />
</p>

## Features

- 🔔 Desktop notifications for build **start / success / failure** (each toggleable)
- 📋 Toolbar popup listing every monitored project and its latest status
- 🟠 Toolbar badge: a dot while building, `!` on failure
- ⏱️ Configurable poll interval (1–60 minutes)
- 🖱️ Click a notification to jump straight to the deployment
- 🔒 Your API token stays in local browser storage and is sent **only** to `api.cloudflare.com`
- 🪶 Zero build step, zero dependencies, no tracking

## Install (from source)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome (or any Chromium browser: Edge, Brave, Arc…).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select this project folder.
5. Click the extension icon → **Settings** to connect your account.

> The PNG icons are committed, so no build is required. If you edit
> `scripts/gen-icons.js`, regenerate them with `npm run icons`.

## Setup

1. Create a Cloudflare API token at
   [dash.cloudflare.com → API Tokens](https://dash.cloudflare.com/profile/api-tokens).
   - Use a **Custom token** with permission: **Account → Cloudflare Pages → Read**.
   - Scope it to only the account(s) you want to monitor.
2. Open the extension's **Settings** page, paste the token, and click **Verify & load**.
3. Pick the account, tick the projects you want to watch, choose your interval and
   notification preferences, then **Save settings**.

That's it — the extension polls in the background and notifies you on changes.

## How it works

A background [service worker](src/background.js) uses `chrome.alarms` to poll the
[Cloudflare Pages deployments API](https://developers.cloudflare.com/api/operations/pages-deployment-get-deployments)
for each monitored project. It stores the last-seen deployment id/status per
project in `chrome.storage.local`, diffs each poll against it, and fires a
`chrome.notifications` message only when something actually changes.

```
manifest.json          Extension manifest (MV3)
src/
  background.js         Polling loop, diffing, notifications, badge
  lib/cloudflare.js     Tiny read-only Cloudflare API client
  popup.html/.js/.css   Toolbar popup — status at a glance
  options.html/.js/.css Settings — token, account, projects, prefs
scripts/
  gen-icons.js          Generates the PNG icons from code
  pack.js               Zips the extension for distribution
icons/                  Generated PNG icons (16/48/128)
```

## Permissions & privacy

| Permission | Why |
| --- | --- |
| `storage` | Save your settings and last-seen deployment state locally |
| `alarms` | Wake the service worker to poll on your chosen interval |
| `notifications` | Show desktop notifications |
| `host_permissions: api.cloudflare.com` | Read deployment status |

No analytics, no third-party servers, no data leaves your machine except the
API calls you configure to Cloudflare. See [PRIVACY.md](PRIVACY.md).

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Harshal Narkhede

---

*Not affiliated with or endorsed by Cloudflare, Inc. "Cloudflare" and
"Cloudflare Pages" are trademarks of Cloudflare, Inc.*
