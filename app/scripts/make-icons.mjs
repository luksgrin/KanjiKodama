// Renders the PNG icons from public/icons/icon.svg (derived from app/src/main/res/drawable/ic_launcher_foreground.xml).
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const svg = readFileSync(resolve(dir, 'icon.svg'));
const maskable = readFileSync(resolve(dir, 'icon-maskable.svg'));
const jobs = [
  [svg, 'icon-192.png', 192],
  [svg, 'icon-512.png', 512],
  [svg, 'apple-touch-icon.png', 180],
  [maskable, 'icon-maskable-512.png', 512],
];
for (const [src, name, size] of jobs) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(resolve(dir, name));
  console.log('wrote', name);
}
