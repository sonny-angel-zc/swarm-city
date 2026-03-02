import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureCleanWorktree, parseWorktreeChanges } from '../scripts/smoke-preflight.mjs';

test('parseWorktreeChanges classifies modified/deleted/untracked/other from porcelain lines', () => {
  const summary = parseWorktreeChanges([
    ' M src/changed.js',
    'M  src/staged.js',
    'D  src/deleted.js',
    'R  old name.txt -> new name.txt',
    '?? docs/new file.md',
    '!! ignored.tmp',
  ]);

  assert.deepEqual(summary, {
    modified: 3,
    deleted: 1,
    untracked: 1,
    other: 1,
  });
});

test('ensureCleanWorktree exits early with no failure when porcelain output is empty', () => {
  let failCalled = false;
  const calls = [];

  ensureCleanWorktree({
    spawnSyncImpl: (...args) => {
      calls.push(args);
      return { status: 0, stdout: '' };
    },
    failImpl: () => {
      failCalled = true;
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], 'git');
  assert.deepEqual(calls[0][1], ['status', '--porcelain=v1', '--untracked-files=all']);
  assert.equal(failCalled, false);
});

test('ensureCleanWorktree fails deterministically for dirty output including rename and spaced paths', () => {
  const lines = [
    ' M app/main.tsx',
    'D  app/old.tsx',
    'R  docs/old name.md -> docs/new name.md',
    '?? docs/notes with space.md',
    '?? tmp/new.txt',
    '!! .cache/file',
    ' M src/another.ts',
    'A  src/added.ts',
    'D  src/removed.ts',
    '?? trailing.txt',
  ];

  let failure = null;
  ensureCleanWorktree({
    spawnSyncImpl: () => ({ status: 0, stdout: `${lines.join('\n')}\n` }),
    failImpl: (message, hint) => {
      failure = { message, hint };
    },
  });

  assert.ok(failure, 'Expected failImpl to be called for dirty worktree');
  assert.equal(
    failure.message,
    'Dirty worktree detected (modified=4, deleted=2, untracked=3, other=1). Smoke preflight requires a clean repository state.',
  );
  assert.equal(
    failure.hint,
    [
      'Commit/stash/discard local changes (including untracked files), then retry.',
      'Inspect with: git status --short',
      '',
      'Current changes:',
      lines.slice(0, 8).join('\n'),
      '...and 2 more',
    ].join('\n'),
  );
});

test('ensureCleanWorktree fails when git status cannot be inspected', () => {
  let failure = null;

  ensureCleanWorktree({
    spawnSyncImpl: () => ({ status: 1, stdout: '', error: new Error('spawn failed') }),
    failImpl: (message, hint) => {
      failure = { message, hint };
    },
  });

  assert.deepEqual(failure, {
    message: 'Unable to inspect git worktree state before smoke run.',
    hint: 'Ensure git is installed and run smoke preflight from the repository root.',
  });
});
