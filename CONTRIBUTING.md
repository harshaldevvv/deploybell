# Contributing

Thanks for your interest in improving the DeployBell!

## Getting started

This is a plain Manifest V3 extension — **no build step, no dependencies**.

1. Fork and clone the repo.
2. Load it unpacked in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
3. Make your changes.
4. Reload the extension from `chrome://extensions` to pick them up.
   - Service worker / content script / `utils/` changes: click the reload ↻ icon
     on the extension card. For content-script changes, also refresh the
     Cloudflare dashboard tab.
   - Popup / options changes: just reopen the page.

## Project layout

- `content.js` — observes the dashboard DOM and reports status. Runs per tab;
  keep decision logic out of it.
- `background.js` — the service worker and single source of truth: state
  machine, dedup, badge, notifications, sound.
- `offscreen.html/.js` — plays audio (MV3 workers can't).
- `popup.*`, `options.*` — UI.
- `utils/` — shared `constants.js`, `status.js`, `storage.js`, loaded as plain
  classic scripts in every context (no bundler).
- `scripts/` — `gen-icons.js`, `gen-sounds.js`, `pack.js`.

## Development notes

- No bundler: files in `utils/` are classic scripts that define top-level
  `const`/`function` and are shared across contexts. Don't use `import`/`export`
  there or in `content.js`.
- Keep detection **class-independent**: match on Cloudflare's status *words*
  (see `utils/status.js`), not CSS selectors.
- Icons and sounds are generated from code (`npm run assets`) — don't hand-edit
  the binaries; edit `scripts/gen-icons.js` / `scripts/gen-sounds.js` and
  regenerate.

## Testing your changes

There's no automated test suite yet (contributions welcome!). Manually verify:

- **Test Notification** button plays a sound and shows a notification.
- Toggling each preference in Settings is respected after Save.
- A real deployment fires exactly one success/failure/cancelled alert, and
  opening an already-finished deployment fires **none**.
- Page refresh and SPA navigation don't cause duplicate alerts.

If you add non-trivial logic (especially in `utils/status.js`), please consider
adding tests.

## Pull requests

- Keep PRs focused and describe the user-facing change.
- Match the existing code style (2-space indent).
- Update the README if you change behavior or setup.

## Reporting bugs

Open an issue with:

- Browser + version
- What you expected vs. what happened
- The dashboard URL pattern (you can redact the account/project)
- Any errors from the service worker console
  (`chrome://extensions` → *Inspect views: service worker*)
