# Privacy Policy

_Last updated: 2026-07-06_

**Cloudflare Pages Deploy Notifier** is designed to collect as little as
possible. In short: your data stays on your device.

## What the extension stores

The extension saves the following in your browser's local extension storage
(`chrome.storage.local`), which never leaves your device except as described
below:

- Your Cloudflare API token
- The selected account ID and the project names you chose to monitor
- Your notification preferences and poll interval
- The last-seen deployment id/status for each monitored project (used to detect
  changes)

## What the extension sends, and where

The extension makes HTTPS requests **only** to `https://api.cloudflare.com` to:

- Verify your API token
- List your accounts and Pages projects
- Read deployment status for the projects you selected

Your API token is sent to Cloudflare in the `Authorization` header of these
requests, exactly as Cloudflare's API requires. It is not sent anywhere else.

## What the extension does NOT do

- No analytics, telemetry, or tracking of any kind
- No third-party servers — there is no backend operated by this project
- No selling or sharing of data
- No collection of browsing history or activity on other sites

## Removing your data

Uninstalling the extension deletes all locally stored data, including your API
token. You can also revoke the API token at any time from the
[Cloudflare dashboard](https://dash.cloudflare.com/profile/api-tokens).

## Contact

Questions? Open an issue on the project's GitHub repository.
