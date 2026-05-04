/**
 * Generate the app's icon set from a single SVG design. Run with:
 *   node scripts/generate-icons.mjs
 *
 * Outputs assets/icon.png, adaptive-icon.png, favicon.png, splash-icon.png.
 * Edit the SVG fragments below to update the brand mark.
 */
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'assets');

const PURPLE = '#a855f7';

// A simplified microphone, drawn inside a 1024x1024 viewBox.
const micPaths = (color) => `
  <!-- Capsule (mic head) -->
  <rect x="430" y="180" width="180" height="360" rx="90" fill="${color}"/>
  <!-- Stand arc -->
  <path d="M 300 460 C 300 700 520 700 520 700 C 520 700 740 700 740 460"
        stroke="${color}" stroke-width="56" fill="none" stroke-linecap="round"/>
  <!-- Stand vertical -->
  <rect x="490" y="700" width="60" height="100" rx="20" fill="${color}"/>
  <!-- Stand base -->
  <rect x="360" y="800" width="320" height="60" rx="30" fill="${color}"/>
`;

// 1024x1024 — the master icon (used by iOS)
const masterIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="200" fill="${PURPLE}"/>
  ${micPaths('white')}
</svg>`;

// Android adaptive icon foreground: solid white mic centered in the inner
// safe area (Android crops with a mask, so the design needs ~17% padding).
const adaptiveIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(170 170) scale(0.66)">
    ${micPaths('white')}
  </g>
</svg>`;

// Web favicon: same as master icon but rendered smaller. We export at
// 256x256 so retina browsers still get a crisp tab icon.
const faviconSvg = masterIconSvg;

// Expo splash: white mic on transparent. The splash backgroundColor in
// app.json fills behind it.
const splashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${micPaths('white')}
</svg>`;

async function emit(svg, file, size) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(ASSETS, file));
  console.log(`  wrote assets/${file} (${size}x${size})`);
}

console.log('Rendering icon set:');
await emit(masterIconSvg, 'icon.png', 1024);
await emit(adaptiveIconSvg, 'adaptive-icon.png', 1024);
await emit(faviconSvg, 'favicon.png', 256);
await emit(splashIconSvg, 'splash-icon.png', 1024);
console.log('Done.');
