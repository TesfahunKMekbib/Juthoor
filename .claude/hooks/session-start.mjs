#!/usr/bin/env node
// SessionStart hook: prints a 2–4 line status that is added to Claude's context (kept tiny on purpose).
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (c) => {
  try { return execSync(c, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
};

const branch = run('git rev-parse --abbrev-ref HEAD') || 'unknown';
const dirty = run('git status --porcelain').split('\n').filter(Boolean).length;
let open = 0;
const oq = join(root, 'docs', 'open-questions.md');
if (existsSync(oq)) open = (readFileSync(oq, 'utf8').match(/^Status: open/gm) ?? []).length;

const lines = [`[juthoor] branch: ${branch} · uncommitted files: ${dirty} · open questions: ${open} (docs/open-questions.md)`];
if (['main', 'master', 'feature'].includes(branch)) {
  lines.push(`[juthoor] You are on the shared branch "${branch}". Use /start-task to create a task branch before changing code.`);
}
if (dirty > 0) lines.push('[juthoor] Uncommitted changes exist — do not stash, reset or reformat files you did not change.');
console.log(lines.join('\n'));
process.exit(0);
