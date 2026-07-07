/**
 * One-time PWA icon generation: renders app/icon.svg to the PNG sizes the
 * manifest + iOS need. Outputs are committed (this script only reruns when
 * the logo changes):  npx tsx scripts/gen-icons.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SVG = path.join(ROOT, 'app', 'icon.svg');
const OUT = path.join(ROOT, 'public', 'icons');

// The maskable icon needs the logo inside the ~80% safe zone, so render the
// K tile smaller on a brand-colored bleed.
const MASKABLE_SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#e5a00d" />
  <text x="32" y="34" text-anchor="middle" dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="34"
        fill="#0f172a">K</text>
</svg>`);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const svg = fs.readFileSync(SVG);

  const jobs: [string, Buffer, number][] = [
    ['icon-192.png', svg, 192],
    ['icon-512.png', svg, 512],
    ['icon-maskable-512.png', MASKABLE_SVG, 512],
    ['apple-touch-icon.png', svg, 180],
  ];
  for (const [name, src, size] of jobs) {
    await sharp(src, { density: 300 }).resize(size, size).png().toFile(path.join(OUT, name));
    console.log(`wrote public/icons/${name} (${size}x${size})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
