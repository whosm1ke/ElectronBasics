// build/generate-icon.js — generates build/icon.ico (gitignored, a build
// artifact regenerated on every packaging run) at multiple standard Windows
// icon sizes, for electron-builder's `build.win.icon`/`build.icon` config —
// the .exe's own file icon, the taskbar icon, and the NSIS installer icon
// all come from this, and none of them can use a NativeImage the way
// src/main/icon.ts's tray/window icon can; electron-builder needs a real
// .ico file on disk at pack time. Kept as a plain Node script (not
// TypeScript — same reasoning as build/afterPack.js: electron-builder loads
// build hooks directly, outside the Vite/tsc pipeline) that draws the exact
// same accent-color circle badge src/main/icon.ts draws at runtime, so the
// packaged .exe's icon matches the tray/window icon instead of falling back
// to Electron's own default — see the `beforePack` wiring in package.json.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Same two-tone circle badge as src/main/icon.ts's buildIconPng(), plus a
// one-pixel antialiased edge — src/main/icon.ts's hard edge is fine at the
// small tray-icon size it's actually used at, but the same math blown up to
// a 256×256 installer/taskbar icon made the aliasing genuinely visible, so
// this version softens both the outer and inner circle edges via a linear
// falloff over ~1 source pixel (scaled with `size`) before either is used.
function buildIconPng(size) {
  const outer = [110, 139, 255]; // accent
  const inner = [186, 200, 255]; // lighter core
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rInner = rOuter * 0.55;
  const feather = Math.max(0.75, size / 64);

  function coverage(dist, r) {
    if (dist <= r - feather) return 1;
    if (dist >= r + feather) return 0;
    return (r + feather - dist) / (2 * feather);
  }

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = rowStart + 1 + x * 4;
      const outerCov = coverage(dist, rOuter);
      const innerCov = coverage(dist, rInner);
      // Blend inner-over-outer-over-transparent by coverage, matching the
      // original's inner-circle-wins-inside-outer-circle layering.
      const a = outerCov;
      const rC = inner[0] * innerCov + outer[0] * (1 - innerCov);
      const gC = inner[1] * innerCov + outer[1] * (1 - innerCov);
      const bC = inner[2] * innerCov + outer[2] * (1 - innerCov);
      raw[idx] = Math.round(rC);
      raw[idx + 1] = Math.round(gC);
      raw[idx + 2] = Math.round(bC);
      raw[idx + 3] = Math.round(a * 255);
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// Windows .ico container: a 6-byte ICONDIR header, one 16-byte
// ICONDIRENTRY per image, then each image's raw file bytes concatenated.
// Embedding full PNG files directly (rather than legacy BMP/DIB data) is
// valid for ICO since Windows Vista and is what every modern icon tool
// does — far simpler than hand-rolling BMP encoding too.
function buildIco(sizes) {
  const images = sizes.map((size) => ({ size, png: buildIconPng(size) }));
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // 0 means 256 per the ICO spec
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // color palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([dir, ...entries, ...images.map((i) => i.png)]);
}

function generate() {
  const outPath = path.join(__dirname, 'icon.ico');
  const ico = buildIco([16, 32, 48, 256]);
  fs.writeFileSync(outPath, ico);
  console.log(`generate-icon: wrote ${outPath} (${ico.length} bytes)`);
  return outPath;
}

module.exports = { generate, buildIconPng, buildIco };

// Support `node build/generate-icon.js` directly (manual regeneration/
// verification) in addition to being required as electron-builder's
// beforePack hook (see package.json's `build.beforePack`).
if (require.main === module) {
  generate();
}
