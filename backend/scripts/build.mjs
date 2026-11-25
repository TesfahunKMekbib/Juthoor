// Builds the app: runs tsc, then copies the non-TypeScript data files tsc ignores ({src,libs}/**/data/*.json,
// read through import.meta.url) into the output folder. None exist while FR-020 is deferred (plan §7).
// Usage: node scripts/build.mjs [outDir]   (default: dist)
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(root, 'dist'));

const tsc = spawnSync(
  process.execPath,
  [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(root, 'tsconfig.build.json'), '--outDir', outDir],
  { stdio: 'inherit', cwd: root },
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

/** Finds every `*.json` that sits in a `data` folder under the given directory. */
function dataFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...dataFiles(path));
    else if (name.endsWith('.json') && dir.split(/[\\/]/).pop() === 'data') found.push(path);
  }
  return found;
}

// src/ and libs/ (plan T1: shared code moved to libs/, e.g. a future libs/integration/geo/data dataset).
for (const file of ['src', 'libs'].flatMap((d) => dataFiles(join(root, d)))) {
  const target = join(outDir, relative(root, file));
  mkdirSync(dirname(target), { recursive: true });
  cpSync(file, target);
}
