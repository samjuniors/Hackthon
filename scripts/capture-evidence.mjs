#!/usr/bin/env node
/**
 * §8 — Evidence Capture Script
 *
 * Orchestrates the final evidence package:
 *  - Gets current git commit SHA
 *  - Runs unit tests and captures results
 *  - Lists available E2E screenshots
 *  - Writes evidence/YYYYMMDD-HHMMSS.md
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const evidenceDir = 'evidence';

mkdirSync(evidenceDir, { recursive: true });

function run(cmd) {
  try {
    return { output: execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }), exitCode: 0 };
  } catch (err) {
    return { output: err.stdout || err.stderr || String(err), exitCode: err.status ?? 1 };
  }
}

// Git commit SHA
const gitResult = run('git rev-parse HEAD');
const commitSha = gitResult.output.trim();

// Git status
const gitStatus = run('git status --short');

// Unit tests
console.log('→ Running unit tests...');
const unitResult = run('pnpm test');
const unitPass = unitResult.exitCode === 0;

// TypeScript
console.log('→ Running typecheck...');
const tcResult = run('pnpm typecheck');
const tcPass = tcResult.exitCode === 0;

// E2E screenshots
const screenshotDir = 'tests/e2e/evidence';
const screenshots = existsSync(screenshotDir)
  ? readdirSync(screenshotDir).filter((f) => f.endsWith('.png'))
  : [];

// E2E legacy screenshot
const legacySmokeShot = existsSync('tests/e2e/workspace-smoke.png')
  ? ['tests/e2e/workspace-smoke.png']
  : [];

const allShots = [...legacySmokeShot, ...screenshots.map((f) => join(screenshotDir, f))];

// Build evidence markdown
const lines = [
  `# Verification Evidence — ${timestamp}`,
  '',
  `**Commit:** \`${commitSha}\``,
  `**Timestamp:** ${new Date().toISOString()}`,
  '',
  '## §1 — Baseline Environment',
  '',
  '```',
  gitStatus.output.trim() || 'clean',
  '```',
  '',
  '## §2/§4/§5 — Unit Tests',
  '',
  `**Result:** ${unitPass ? '✅ PASS' : '❌ FAIL'}`,
  '',
  '```',
  unitResult.output.slice(0, 4000),
  '```',
  '',
  '## TypeScript',
  '',
  `**Result:** ${tcPass ? '✅ PASS' : '❌ FAIL'}`,
  '',
  tcResult.exitCode !== 0 ? ('```\n' + tcResult.output.slice(0, 2000) + '\n```') : '_clean_',
  '',
  '## §8 — Screenshots',
  '',
  allShots.length > 0
    ? allShots.map((p) => `- \`${p}\``).join('\n')
    : '_No screenshots found. Run `pnpm test:e2e` first._',
  '',
  '## §3 — LIVE Mode Evidence',
  '',
  '_Run `node scripts/probe-california.mjs` and paste output here._',
  '',
  '## §7 — Mobile Verification',
  '',
  '_Run `pnpm test:e2e --project=mobile-chrome` and attach screenshots._',
  '',
];

const output = lines.join('\n');
const outPath = join(evidenceDir, `${timestamp}.md`);
writeFileSync(outPath, output, 'utf8');

console.log(`\n✅ Evidence written to: ${outPath}`);
console.log(`   Commit: ${commitSha}`);
console.log(`   Unit tests: ${unitPass ? 'PASS' : 'FAIL'}`);
console.log(`   Typecheck: ${tcPass ? 'PASS' : 'FAIL'}`);
console.log(`   Screenshots: ${allShots.length}`);
