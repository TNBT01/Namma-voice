/**
 * Generate optional vector wordmarks for the NAMMA VOICE interface.
 * The uploaded college campus photograph is intentionally left untouched.
 */

import fs from 'fs';
import path from 'path';

const outDir = path.resolve('public/assets/images');
fs.mkdirSync(outDir, { recursive: true });

const assets = [
  {
    name: 'namma-voice-logo.svg',
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 88" role="img" aria-labelledby="title">
  <title id="title">NAMMA VOICE</title>
  <rect x="4" y="4" width="80" height="80" rx="20" fill="#142c40"/>
  <path d="M24 57V30h8l24 27V30h8v27h-8L32 40v17z" fill="#e8d1a7"/>
  <text x="102" y="43" fill="#142c40" font-family="Georgia,serif" font-size="25" font-weight="700" letter-spacing="2">NAMMA VOICE</text>
  <text x="103" y="64" fill="#7b6848" font-family="sans-serif" font-size="10" font-weight="600" letter-spacing="2">NAMMA COLLEGE · NAMMA VOICE</text>
</svg>`
  },
  {
    name: 'college-logo.svg',
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 72" role="img" aria-labelledby="title">
  <title id="title">APS College of Arts and Science</title>
  <path d="M30 6 57 17v19c0 17-14 26-27 32C17 62 3 53 3 36V17z" fill="#142c40" stroke="#b28d55" stroke-width="2"/>
  <path d="M16 32c6-3 11-2 14 1 4-3 9-4 15-1v15c-6-3-11-2-15 1-3-3-8-4-14-1z" fill="none" stroke="#e8d1a7" stroke-width="2"/>
  <text x="73" y="30" fill="#142c40" font-family="sans-serif" font-size="17" font-weight="700" letter-spacing="1">APS COLLEGE</text>
  <text x="73" y="50" fill="#53616a" font-family="sans-serif" font-size="11" font-weight="600" letter-spacing="1">OF ARTS AND SCIENCE</text>
</svg>`
  }
];

for (const asset of assets) {
  fs.writeFileSync(path.join(outDir, asset.name), asset.content, 'utf8');
}

console.log('Optional vector wordmarks generated. The campus photograph was not modified.');
