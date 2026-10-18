# Security

## Reporting a vulnerability

Please report privately through GitHub: **Security > Report a vulnerability** on
https://github.com/harshaldevvv/deploybell. Do not open a public issue for it. You should get a reply within a week.

## Design notes

- The only network requests go to `api.cloudflare.com` over HTTPS with your token. DeployBell opens no ports.
- The token is stored in plain text in `~/.cf-pages-notifier.json`. Use a **Pages: Read** token so a leaked file
  can't change anything in your account.
- The window runs with context isolation on and Node integration off; the page talks to the app only through
  `preload.js`.
- Release builds are produced by GitHub Actions from the tagged source.
