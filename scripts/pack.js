// Packages the extension into a distributable zip (for the Chrome Web Store
// or manual sharing), including only the files the extension needs at runtime.
// Run: `npm run zip`. Requires the `zip` CLI (preinstalled on macOS/Linux;
// on Windows use Git Bash, WSL, or 7-Zip).

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const distDir = join(root, "dist");
mkdirSync(distDir, { recursive: true });

const out = join(distDir, `cf-pages-notifier-v${version}.zip`);
rmSync(out, { force: true });

const include = ["manifest.json", "src", "icons"];

execFileSync("zip", ["-r", "-X", out, ...include], {
  cwd: root,
  stdio: "inherit",
});

console.log(`\nPacked ${out}`);
