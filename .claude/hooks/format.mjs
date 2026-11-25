#!/usr/bin/env node
// PostToolUse formatter: formats ONLY the file Claude just edited.
// Dart → `dart format`; TypeScript/JSON under backend/ → backend's local Prettier (if installed).
// Never fails the session: always exits 0. Silent when the tool is unavailable.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const file = String(input.tool_input?.file_path ?? '');
  if (!file || !existsSync(file)) process.exit(0);
  const norm = file.replace(/\\/g, '/');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const opts = { stdio: 'ignore', timeout: 30000 };

  if (norm.endsWith('.dart')) {
    // `dart` is a .bat on Windows, so it needs a shell; quote the path (folders contain spaces).
    if (process.platform === 'win32') spawnSync(`dart format "${file}"`, { ...opts, shell: true });
    else spawnSync('dart', ['format', file], opts);
  } else if (/\/backend\/.+\.(ts|json)$/.test(norm) && !/\/node_modules\//.test(norm) && !/package(-lock)?\.json$/.test(norm)) {
    // Run Prettier's JS entry with the current Node: no shell, so paths with spaces are safe.
    const cli = join(root, 'backend', 'node_modules', 'prettier', 'bin', 'prettier.cjs');
    if (existsSync(cli)) spawnSync(process.execPath, [cli, '--write', file], { ...opts, cwd: join(root, 'backend') });
  }
} catch {
  // ignore — formatting is best-effort
}
process.exit(0);
