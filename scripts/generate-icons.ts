import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Rgba = readonly [number, number, number, number];

const DARK: Rgba = [24, 37, 34, 255];
const CREAM: Rgba = [244, 239, 227, 255];
const TEAL: Rgba = [33, 75, 67, 255];
const CORAL: Rgba = [224, 107, 82, 255];
const PLUM: Rgba = [111, 65, 101, 255];

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name: string, data: Uint8Array): Buffer {
  const type = Buffer.from(name, 'ascii');
  const body = Buffer.from(data);
  const output = Buffer.alloc(12 + body.length);
  output.writeUInt32BE(body.length, 0);
  type.copy(output, 4);
  body.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([type, body])), 8 + body.length);
  return output;
}

function renderIcon(size: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  const setPixel = (x: number, y: number, color: Rgba): void => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const offset = (y * size + x) * 4;
    pixels.set(color, offset);
  };
  const fillRect = (x: number, y: number, width: number, height: number, color: Rgba): void => {
    for (let py = Math.floor(y * size); py < Math.ceil((y + height) * size); py += 1) {
      for (let px = Math.floor(x * size); px < Math.ceil((x + width) * size); px += 1) setPixel(px, py, color);
    }
  };
  const fillCircle = (cx: number, cy: number, radius: number, color: Rgba): void => {
    const centerX = cx * size;
    const centerY = cy * size;
    const radiusPixels = radius * size;
    for (let y = Math.floor(centerY - radiusPixels); y <= Math.ceil(centerY + radiusPixels); y += 1) {
      for (let x = Math.floor(centerX - radiusPixels); x <= Math.ceil(centerX + radiusPixels); x += 1) {
        if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radiusPixels ** 2) setPixel(x, y, color);
      }
    }
  };

  fillRect(0, 0, 1, 1, DARK);
  fillCircle(0.5, 0.5, 0.37, CREAM);
  fillCircle(0.225, 0.255, 0.035, CORAL);
  fillCircle(0.775, 0.745, 0.026, PLUM);

  fillRect(0.35, 0.35, 0.082, 0.31, TEAL);
  fillRect(0.3, 0.64, 0.19, 0.075, TEAL);
  for (let y = Math.floor(size * 0.35); y < Math.ceil(size * 0.47); y += 1) {
    const progress = (y / size - 0.35) / 0.12;
    fillRect(0.35 - (1 - progress) * 0.09, y / size, 0.085, 1 / size, TEAL);
  }

  fillRect(0.55, 0.34, 0.18, 0.075, CORAL);
  fillRect(0.55, 0.64, 0.18, 0.075, CORAL);
  fillRect(0.55, 0.34, 0.075, 0.375, CORAL);
  fillRect(0.655, 0.34, 0.075, 0.375, CORAL);

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconDirectory = resolve(process.cwd(), 'public/icons');
mkdirSync(iconDirectory, { recursive: true });
for (const [name, size] of [
  ['icon-180.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
] as const) {
  writeFileSync(resolve(iconDirectory, name), renderIcon(size));
  process.stdout.write(`generated ${name}\n`);
}
