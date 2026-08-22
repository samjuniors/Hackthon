import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath: string, override = false) {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match && (override || !process.env[match[1]])) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

// .env.local overrides process.env
loadEnvFile('.env.local', true);
loadEnvFile('.env', false);
