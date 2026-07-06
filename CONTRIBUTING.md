# Contributing

Thanks for your interest in improving the Cloudflare Pages Deploy Notifier!

## Getting started

This is a plain Manifest V3 extension — **no build step, no dependencies**.

1. Fork and clone the repo.
2. Load it unpacked in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
3. Make your changes.
4. Reload the extension from `chrome://extensions` to pick them up.
   - Changes to the service worker: click the reload ↻ icon on the extension card.
   - Changes to popup/options pages: just reopen the page.

## Development notes

- Everything is ES modules (`import`/`export`), including the service worker
  (`"type": "module"` in the manifest).
- Keep the API client in `src/lib/cloudflare.js` **read-only**. The extension
  should never need write permissions to a user's Cloudflare account.
- Icons are generated from code (`npm run icons`) — don't hand-edit the PNGs;
  edit `scripts/gen-icons.js` instead and regenerate.

## Testing your changes

There's no automated test suite yet (contributions welcome!). Manually verify:

- Verifying a token loads accounts and projects.
- Saving settings starts polling and the popup shows project statuses.
- A real deployment fires start/success (or failure) notifications.
- Toggling each notification preference is respected.

If you add non-trivial logic, please consider adding tests.

## Pull requests

- Keep PRs focused and describe the user-facing change.
- Match the existing code style (2-space indent, no semicolons omitted).
- Update the README if you change behavior or setup.

## Reporting bugs

Open an issue with:

- Browser + version
- What you expected vs. what happened
- Any errors from the extension's service worker console
  (`chrome://extensions` → *Inspect views: service worker*)

Please **never** paste your API token into an issue.
