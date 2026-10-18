# Privacy

DeployBell has no accounts, no telemetry, no analytics and no server of its own.

## What it sends, and where

- It talks to one place only: the official Cloudflare API at `api.cloudflare.com`, using the API token and account
  ID you enter, to list your Pages projects and check their latest deployments.
- Nothing else leaves your computer. Notifications and sounds are local.

## What it stores

- **Settings**, including your Cloudflare API token and account ID, are saved in a plain JSON file in your home
  folder: `~/.cf-pages-notifier.json` (on Windows, `C:\Users\<you>\.cf-pages-notifier.json`). The desktop app and
  the command line mode share it.
- The activity log is kept in memory only and is cleared when the app quits.

Because the token is stored as plain text, give DeployBell a token with **Pages: Read** permission only, scoped to
the one account. That token can read deployment status and nothing else.

## Removing your data

Uninstall DeployBell, delete `~/.cf-pages-notifier.json`, and revoke the token in the Cloudflare dashboard under
**My Profile > API Tokens**.
