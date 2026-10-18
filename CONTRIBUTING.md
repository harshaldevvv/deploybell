# Contributing

Thanks for helping. Bug reports and pull requests are welcome.

## Getting started

```bash
npm install
npm start          # run the desktop app
npm run dist       # build installers for your OS into dist/
```

## Where things are

- `main.js`: the Electron main process. Polling the Cloudflare API, state changes, notifications, sounds, tray,
  settings file.
- `preload.js`: the small bridge the window is allowed to call.
- `index.html`, `renderer.js`, `style.css`: the dashboard, settings and activity log.
- `index.js`: the command line mode (`npm run cli`).
- `sounds/`, `assets/`: the alert sounds and icons.
- `.github/workflows/release.yml`: builds Windows, macOS and Linux installers when a `v*` tag is pushed.

## Pull requests

- Keep each one focused on a single change and say how you tested it, on which OS.
- Sounds must work on all three systems: playback lives in `playSound()` in `main.js`.
- If you add a network request or store something new, update [PRIVACY.md](PRIVACY.md).

By contributing you agree that your work is released under the [MIT License](LICENSE).
