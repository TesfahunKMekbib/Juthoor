#!/usr/bin/env node
// PreToolUse guard for Juthoor. Reads the hook JSON from stdin.
// Exit 2 = block the tool call (stderr is shown to Claude). Exit 0 = allow.
// Protects: approved requirements, secrets, teammates' uncommitted work, shared history, human-only merges.
import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0); // never break the session on malformed input
}

const tool = input.tool_name ?? '';
const ti = input.tool_input ?? {};
const block = (msg) => {
  process.stderr.write(`[juthoor-guard] BLOCKED: ${msg}\n`);
  process.exit(2);
};

// ---- File edits -----------------------------------------------------------
if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const p = String(ti.file_path ?? ti.notebook_path ?? '').replace(/\\/g, '/');
  if (/\/docs\/requirements\/(functional|non-functional)\.md$/i.test(p)) {
    block('approved requirements are read-only. Propose the change to the human; they edit it in a docs PR.');
  }
  if (/(^|\/)\.env(\.[^/]*)?$/i.test(p) && !/\.env\.example$/i.test(p)) {
    block('.env files hold secrets and must not be written by Claude. Use .env.example with placeholders.');
  }
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(p) || /(^|\/)(credentials|secrets?)\.(json|ya?ml)$/i.test(p)) {
    block('credential/key files must not be written by Claude.');
  }
  process.exit(0);
}

// ---- Shell commands (Bash and PowerShell) ---------------------------------
if (tool === 'Bash' || tool === 'PowerShell') {
  const cmd = String(ti.command ?? '');
  const rules = [
    [/\bgit\s+push\b[^\n;&|]*(\s--force(?!-with-lease)\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/, 'force-push rewrites shared history.'],
    [/\bgit\s+push\b[^\n;&|]*\s(origin\s+)?(main|master)\b(?!-)/, 'never push directly to main; open a PR.'],
    [/\bgit\s+reset\b[^\n;&|]*--hard\b/, 'git reset --hard can destroy uncommitted work.'],
    [/\bgit\s+clean\b[^\n;&|]*\s-[a-z]*f/, 'git clean -f deletes untracked files (possibly teammates\' work).'],
    [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, 'discarding all working-tree changes is not allowed.'],
    [/\bgit\s+stash\b(?!\s+(list|show))/, 'do not stash; it hides the user\'s uncommitted work. Ask instead.'],
    [/\bgit\s+add\s+(-A\b|--all\b|\.(\s|$)|-u\b)/, 'stage files by explicit path, not `git add .`/`-A`/`-u`.'],
    [/\bgit\s+commit\b[^\n;&|]*\s(-a\b|-am\b|--all\b)/, 'do not use `git commit -a`; stage explicit paths.'],
    [/--no-verify\b/, 'skipping git hooks is not allowed.'],
    [/\bgh\s+pr\s+merge\b/, 'merging is done by a human reviewer on GitHub.'],
    [/\bgh\s+repo\s+delete\b/, 'repository deletion is not allowed.'],
    [/\bnpm\s+audit\s+fix\b[^\n;&|]*--force/, '`npm audit fix --force` can introduce breaking upgrades; propose it instead.'],
    [/\b(cat|type|Get-Content|less|more|head|tail)\b[^\n;&|]*\.env(?!\.example)\b/, 'reading .env files exposes secrets.'],
  ];
  for (const [re, msg] of rules) if (re.test(cmd)) block(msg);
}
process.exit(0);
