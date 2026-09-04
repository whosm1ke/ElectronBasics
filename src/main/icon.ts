// icon.ts — generates the tray/window icon at runtime as a small two-tone
// circular PNG (hand-rolled encoder: raw RGBA scanlines + zlib + manual PNG
// chunks/CRC32), so the app ships with zero external image assets.
import zlib from 'node:zlib';
import { nativeImage, type NativeImage } from 'electron';

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Builds a small two-tone circular PNG icon buffer (accent color badge). */
export function buildIconPng(size = 32): Buffer {
  const outer = [110, 139, 255, 255]; // accent
  const inner = [186, 200, 255, 255]; // lighter core
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rInner = rOuter * 0.55;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = rowStart + 1 + x * 4;
      let px = [0, 0, 0, 0];
      if (dist <= rInner) px = inner;
      else if (dist <= rOuter) px = outer;
      raw[idx] = px[0];
      raw[idx + 1] = px[1];
      raw[idx + 2] = px[2];
      raw[idx + 3] = px[3];
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

export function buildAppIcon(): NativeImage {
  try {
    return nativeImage.createFromBuffer(buildIconPng(32));
  } catch (err) {
    console.error('Failed to build app icon, falling back to empty image:', err);
    return nativeImage.createEmpty();
  }
}
