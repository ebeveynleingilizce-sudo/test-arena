import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openmojiRegistry } from '../src/assets/openmoji.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(resolve(root, 'vendor/openmoji/data/openmoji.json'), 'utf8'));
const selected = Object.values(openmojiRegistry).filter(entry => entry.status === 'ready');
const files = new Set();
// Validate the complete selection before copying any SVG.
for (const entry of selected) {
  const name = `${entry.hexcode}.svg`;
  if (!/^[A-F0-9]+(?:-[A-F0-9]+)*\.svg$/.test(name) ||
      entry.file !== `/assets/openmoji/selected/${name}`) throw new Error('Invalid selected asset');
  files.add(name);
  if (!metadata.some(row => row.hexcode === entry.hexcode && row.annotation === entry.annotation)) throw new Error('Metadata mismatch: ' + entry.concept);
  const svg = await readFile(resolve(root, 'vendor/openmoji/color', name), 'utf8');
  if (!svg.includes('<svg') || /<(?:script|foreignObject)\b|\bon\w+\s*=|(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) throw new Error('Unsafe SVG: ' + name);
}
const destination = resolve(root, 'public/assets/openmoji/selected');
await mkdir(destination, { recursive: true });
for (const name of files) {
  await copyFile(resolve(root, 'vendor/openmoji/color', name), resolve(destination, name));
}
await copyFile(resolve(root, 'vendor/openmoji/LICENSE.txt'), resolve(destination, '../LICENSE.txt'));
console.log(`Copied ${files.size} unique selected OpenMoji SVGs for ${selected.length} semantic IDs.`);
