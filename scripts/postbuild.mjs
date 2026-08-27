import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standaloneDir = join(root, '.next', 'standalone');

if (existsSync(standaloneDir)) {
  const staticSrc = join(root, '.next', 'static');
  const staticDest = join(standaloneDir, '.next', 'static');
  const publicSrc = join(root, 'public');
  const publicDest = join(standaloneDir, 'public');

  for (const [src, dest] of [[staticSrc, staticDest], [publicSrc, publicDest]]) {
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
      console.log(`copied ${src} -> ${dest}`);
    } else {
      console.warn(`skipped missing ${src}`);
    }
  }
} else {
  console.log('Standard Next.js build: skipping standalone file copy.');
}
