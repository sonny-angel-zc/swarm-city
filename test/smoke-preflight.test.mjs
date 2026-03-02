import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePorcelainStatus,
  formatRemediationText,
  runSmokePreflight,
} from '../scripts/smoke-preflight.mjs';

function createBufferingWriter() {
  return {
    chunks: [],
    write(chunk) {
      this.chunks.push(String(chunk));
    },
    toString() {
      return this.chunks.join('');
    },
  };
}

test('parsePorcelainStatus classifies modified/deleted/untracked/other with edge cases', () => {
  const output = [
    ' M src/file.js',
    'M  src/another.js',
    ' D src/deleted.js',
    '?? new file with spaces.txt',
    'R  old name.ts -> new name.ts',
    'A  src/added.ts',
  ].join('\n');

  assert.deepEqual(parsePorcelainStatus(output), {
    modified: 2,
    deleted: 1,
    untracked: 1,
    other: 2,
  });
});

test('formatRemediationText is deterministic', () => {
  const counts = { modified: 2, deleted: 1, untracked: 3, other: 4 };

  assert.equal(
    formatRemediationText(counts),
    [
      '[smoke-preflight] Dirty worktree detected.',
      '[smoke-preflight] Classification: modified=2, deleted=1, untracked=3, other=4.',
      '[smoke-preflight] Remediation: commit or stash tracked changes, and remove or add untracked files before continuing.',
    ].join('\n'),
  );
});

test('runSmokePreflight exits early when clean', () => {
  const stdout = createBufferingWriter();
  const stderr = createBufferingWriter();

  const result = runSmokePreflight({
    execGitStatus: () => '\n\n',
    stdout,
    stderr,
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.counts, {
    modified: 0,
    deleted: 0,
    untracked: 0,
    other: 0,
  });
  assert.equal(stderr.toString(), '');
  assert.equal(stdout.toString(), '[smoke-preflight] Worktree clean.\n');
});

test('runSmokePreflight fails with deterministic remediation for dirty tree', () => {
  const stdout = createBufferingWriter();
  const stderr = createBufferingWriter();

  const result = runSmokePreflight({
    execGitStatus: () => [
      ' M src/changed.ts',
      ' D src/deleted.ts',
      '?? path with spaces/new file.ts',
      'R  old path.ts -> renamed path.ts',
    ].join('\n'),
    stdout,
    stderr,
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.counts, {
    modified: 1,
    deleted: 1,
    untracked: 1,
    other: 1,
  });
  assert.equal(stdout.toString(), '');

  const expectedMessage = [
    '[smoke-preflight] Dirty worktree detected.',
    '[smoke-preflight] Classification: modified=1, deleted=1, untracked=1, other=1.',
    '[smoke-preflight] Remediation: commit or stash tracked changes, and remove or add untracked files before continuing.',
  ].join('\n');

  assert.equal(result.remediation, expectedMessage);
  assert.equal(stderr.toString(), `${expectedMessage}\n`);
});
