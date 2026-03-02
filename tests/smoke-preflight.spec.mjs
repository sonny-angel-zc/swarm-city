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
