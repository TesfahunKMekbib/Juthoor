#!/usr/bin/env node
// Runs the same checks as CI, locally, and prints a compact pass/fail table.
// Usage: node .claude/scripts/verify.mjs [all|backend|frontend]   (default: all)
// "Baseline" checks mirror CI's non-blocking checks (docs/open-questions.md Q-D1, Q-D2).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = process.argv[2] ?? 'all';
const strict = process.env.STRICT_CHECKS === 'true';

const checks = [];
if (target === 'all' || target === 'backend') {
  const cwd = join(root, 'backend');
  if (!existsSync(join(cwd, 'node_modules'))) checks.push({ area: 'backend', name: 'install', cwd, cmd: 'npm ci' });
  checks.push(
    { area: 'backend', name: 'typecheck', cwd, cmd: 'npm run -s typecheck', baseline: true },
    { area: 'backend', name: 'lint', cwd, cmd: 'npm run -s lint', baseline: true },
    { area: 'backend', name: 'test', cwd, cmd: 'npm run -s test:cov' },
    { area: 'backend', name: 'audit', cwd, cmd: 'npm audit --audit-level=high --omit=dev' },
  );
}
if (target === 'all' || target === 'frontend') {
  const cwd = join(root, 'frontend');
  const hasTests = existsSync(join(cwd, 'test'));
  checks.push(
    { area: 'frontend', name: 'pub get', cwd, cmd: 'flutter pub get' },
    { area: 'frontend', name: 'format', cwd, cmd: `dart format --output=none --set-exit-if-changed lib${hasTests ? ' test' : ''}`, baseline: true },
    { area: 'frontend', name: 'analyze', cwd, cmd: 'flutter analyze' },
    hasTests
      ? { area: 'frontend', name: 'test', cwd, cmd: 'flutter test' }
      : { area: 'frontend', name: 'test', skip: 'no frontend/test directory yet' },
  );
}

const rows = [];
let blockingFailed = false;
for (const c of checks) {
  if (c.skip) { rows.push([c.area, c.name, 'SKIP', c.skip]); continue; }
  const r = spawnSync(c.cmd, { cwd: c.cwd, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ok = r.status === 0;
  const blocking = strict || !c.baseline;
  if (!ok && blocking) blockingFailed = true;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').filter(Boolean);
  const tail = ok ? '' : out.slice(-4).join(' | ').slice(0, 300);
  rows.push([c.area, c.name, ok ? 'PASS' : blocking ? 'FAIL' : 'WARN (baseline)', tail]);
}

console.log('\n| Area | Check | Result | Detail (last lines on failure) |\n|---|---|---|---|');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
console.log(`\nOverall: ${blockingFailed ? 'FAIL' : 'PASS'}${strict ? ' (strict)' : ' (baseline checks non-blocking)'}`);
process.exit(blockingFailed ? 1 : 0);
