# Privacy Policy

_Last updated: 2026-07-06_

**DeployBell** is built to collect nothing. It has no
backend, makes no network requests of its own, and uses no API keys.

## What it does

The extension runs a content script only on `https://dash.cloudflare.com/*`.
There it reads the text already visible on the Cloudflare Pages dashboard to
figure out whether a deployment is building, has succeeded, failed, or was
cancelled. When a deployment finishes, it shows a desktop notification and
plays a sound locally.

## What it stores

Only your own settings and a small amount of runtime state, kept in your
browser's local extension storage (`chrome.storage.local`):

- Your preferences (poll interval, volume, which alerts and sounds are enabled)
- The most recent observed deployment status, project name, and timing (used to
  show the popup and to avoid firing duplicate notifications)

None of this ever leaves your device.

## What it does NOT do

- No servers, no analytics, no telemetry, no tracking
- No API tokens, no Cloudflare API calls, no external network requests
- Does not read any site other than the Cloudflare dashboard
- Does not collect browsing history or personal data

## Removing your data

Uninstalling the extension deletes all locally stored settings and state.

## Contact

Questions? Open an issue on the project's GitHub repository.
