// Packages the extension into a distributable .zip (for the Chrome Web Store or
// manual sharing), including only the files the extension needs at runtime.
// Run: `npm run zip`.
//
// Uses a tiny self-contained ZIP writer built on Node's zlib — no `zip` CLI and
// no dependencies, so it works identically on Windows, macOS, and Linux.

import { deflateRawSync } from "node:zlib";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  statSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

// Runtime files/folders to ship (excludes scripts/, docs, node_modules, dist).
const INCLUDE = [
  "manifest.json",
  "background.js",
  "content.js",
  "offscreen.html",
  "offscreen.js",
  "popup.html",
  "popup.js",
  "popup.css",
  "options.html",
  "options.js",
  "options.css",
  "utils",
  "icons",
  "sounds",
];

// --- CRC32 ----------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- Collect files --------------------------------------------------------

function collect(entry, files) {
  const abs = join(root, entry);
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const child of readdirSync(abs)) collect(join(entry, child), files);
  } else {
    files.push(entry);
  }
}

// --- Minimal ZIP writer ---------------------------------------------------

// Fixed DOS timestamp (2021-01-01 00:00) for reproducible archives.
const DOS_TIME = 0;
const DOS_DATE = ((2021 - 1980) << 9) | (1 << 5) | 1;

function buildZip(files) {
  const localParts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameInZip = file.split(sep).join("/"); // ZIP uses forward slashes
    const nameBytes = Buffer.from(nameInZip, "utf8");
    const data = readFileSync(join(root, file));
    const crc = crc32(data);
    const compressed = deflateRawSync(data, { level: 9 });

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localParts.push(local, nameBytes, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(8, 10); // method
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30); // extra length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk number start
    cd.writeUInt16LE(0, 36); // internal attributes
    cd.writeUInt32LE(0, 38); // external attributes
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(cd, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(central);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(files.length, 8); // entries on this disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralBuf.length, 12); // central directory size
  eocd.writeUInt32LE(localBuf.length, 16); // central directory offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// --- Run ------------------------------------------------------------------

const files = [];
for (const entry of INCLUDE) collect(entry, files);

const distDir = join(root, "dist");
mkdirSync(distDir, { recursive: true });
const out = join(distDir, `cf-pages-notifier-v${version}.zip`);
rmSync(out, { force: true });
writeFileSync(out, buildZip(files));

console.log(`Packed ${files.length} files -> ${out}`);
