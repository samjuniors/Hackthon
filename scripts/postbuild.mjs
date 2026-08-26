import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const staticSrc = join(root, '.next', 'static');
const staticDest = join(root, '.next', 'standalone', '.next', 'static');
const publicSrc = join(root, 'public');
const publicDest = join(root, '.next', 'standalone', 'public');

for (const [src, dest] of [[staticSrc, staticDest], [publicSrc, publicDest]]) {
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log(`copied ${src} -> ${dest}`);
  } else {
    console.warn(`skipped missing ${src}`);
  }
}
