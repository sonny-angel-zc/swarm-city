import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const SCRIPT_PATH = resolve(process.cwd(), 'scripts/smoke-preflight.mjs');

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'ignore',
  });
}

function createRepo({ includeDependencies = true, dirty = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'smoke-preflight-test-'));

  run('git', ['init', '-q'], root);
  writeFileSync(join(root, 'README.md'), '# test repo\n');

  if (includeDependencies) {
    mkdirSync(join(root, 'node_modules', 'next'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'next', 'package.json'), '{"name":"next"}\n');

    mkdirSync(join(root, 'node_modules', '@playwright', 'test'), { recursive: true });
    writeFileSync(join(root, 'node_modules', '@playwright', 'test', 'package.json'), '{"name":"@playwright/test"}\n');
  }

  run('git', ['add', '.'], root);
  run(
    'git',
    [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Smoke Test',
      'commit',
      '-qm',
      'init',
    ],
    root,
  );

  if (dirty) {
    writeFileSync(join(root, 'dirty.txt'), 'dirty\n');
  }

  return root;
}

function runPreflight(cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      SMOKE_PREFLIGHT_MODE: 'skip',
      ...extraEnv,
    },
  });
}

function parsePreflightStderr(stderr) {
  const prefix = '[smoke:preflight] ';
  const lines = stderr.replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let active = null;

  function flush() {
    if (!active) return;
    const text = [active.firstLine, ...active.continuation]
      .join('\n')
      .trimEnd();
    entries.push({ level: active.level, text });
    active = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      if (active) active.continuation.push('');
      continue;
    }

    if (!line.startsWith(prefix)) {
      if (active) {
        active.continuation.push(line);
      } else {
        entries.push({ level: 'legacy', text: line });
      }
      continue;
    }

    const payload = line.slice(prefix.length);
    if (payload.startsWith('ERROR: ')) {
      flush();
      active = { level: 'error', firstLine: payload.slice('ERROR: '.length), continuation: [] };
      continue;
    }

    if (payload.startsWith('HINT: ')) {
      flush();
      active = { level: 'hint', firstLine: payload.slice('HINT: '.length), continuation: [] };
      continue;
    }

    flush();
    entries.push({ level: 'legacy', text: payload });
  }

  flush();
  return entries;
}

test('passes preflight in clean repository', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Preflight checks passed\./);
});

test('fails preflight when required tooling is unavailable', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo, { PATH: '' });

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Required tool "npm" is unavailable\./);
});

test('fails preflight when worktree is dirty', () => {
  const repo = createRepo({ includeDependencies: false, dirty: true });
  const result = runPreflight(repo);

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Dirty worktree detected/);
});

test('parses stderr in CI/automation style with deterministic error/hint ordering', () => {
  const repo = createRepo({ includeDependencies: false, dirty: true });
  const result = runPreflight(repo);

  assert.equal(result.status, 1, result.stdout);
  const parsed = parsePreflightStderr(result.stderr);
  assert.deepEqual(
    parsed.map(entry => entry.level),
    ['error', 'hint'],
    result.stderr,
  );

  assert.match(parsed[0].text, /^Dirty worktree detected \(/);
  assert.match(parsed[1].text, /^Commit\/stash\/discard local changes/);
  assert.match(parsed[1].text, /Inspect with: git status --short/);
  assert.match(parsed[1].text, /\n\nCurrent changes:\n/);

  const hintLines = parsed[1].text.split('\n');
  const inspectIndex = hintLines.indexOf('Inspect with: git status --short');
  const currentChangesIndex = hintLines.indexOf('Current changes:');
  assert.ok(inspectIndex >= 0 && currentChangesIndex > inspectIndex, parsed[1].text);

  const backwardsCompatible = parsed.map(entry => entry.text);
  assert.equal(backwardsCompatible.length, 2);
  assert.equal(backwardsCompatible[0], parsed[0].text);
  assert.equal(backwardsCompatible[1], parsed[1].text);
});
