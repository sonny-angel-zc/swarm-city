import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStderrDiagnostics } from './helpers/stderrDiagnostics.mjs';

const cases = [
  {
    name: 'parses LF newlines with multiline hint continuation',
    stderr: [
      '[smoke:preflight] ERROR: Dirty worktree detected.',
      '[smoke:preflight] HINT: Commit/stash/discard local changes.',
      'Inspect with: git status --short',
      '',
      'Current changes:',
      ' M README.md',
      '?? scratch.txt',
    ].join('\n'),
    expected: [
      {
        level: 'ERROR',
        message: 'Dirty worktree detected.',
      },
      {
        level: 'HINT',
        message: [
          'Commit/stash/discard local changes.',
          'Inspect with: git status --short',
          '',
          'Current changes:',
          ' M README.md',
          '?? scratch.txt',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'parses CRLF newlines deterministically',
    stderr: [
      '[smoke:preflight] ERROR: Required tool "npm" is unavailable.',
      '[smoke:preflight] HINT: Install npm and ensure it is on PATH.',
      'Retry with npm run test:smoke.',
    ].join('\r\n'),
    expected: [
      {
        level: 'ERROR',
        message: 'Required tool "npm" is unavailable.',
      },
      {
        level: 'HINT',
        message: 'Install npm and ensure it is on PATH.\nRetry with npm run test:smoke.',
      },
    ],
  },
  {
    name: 'handles mixed prefixed and unprefixed lines as continuation',
    stderr: [
      '[smoke:preflight] ERROR: Unable to inspect git worktree state before smoke run.',
      'git: not found',
      '[smoke:preflight] HINT: Ensure git is installed.',
      'Run smoke preflight from the repository root.',
    ].join('\n'),
    expected: [
      {
        level: 'ERROR',
        message: 'Unable to inspect git worktree state before smoke run.\ngit: not found',
      },
      {
        level: 'HINT',
        message: 'Ensure git is installed.\nRun smoke preflight from the repository root.',
      },
    ],
  },
  {
    name: 'preserves ordering for repeated ERROR/HINT blocks',
    stderr: [
      '[smoke:preflight] ERROR: First error.',
      '[smoke:preflight] HINT: First hint.',
      '[smoke:preflight] ERROR: Second error.',
      '[smoke:preflight] HINT: Second hint.',
      'with details',
    ].join('\n'),
    expected: [
      {
        level: 'ERROR',
        message: 'First error.',
      },
      {
        level: 'HINT',
        message: 'First hint.',
      },
      {
        level: 'ERROR',
        message: 'Second error.',
      },
      {
        level: 'HINT',
        message: 'Second hint.\nwith details',
      },
    ],
  },
];

for (const fixture of cases) {
  test(fixture.name, () => {
    const diagnostics = parseStderrDiagnostics(fixture.stderr);
    assert.deepEqual(diagnostics, fixture.expected);
  });
}
