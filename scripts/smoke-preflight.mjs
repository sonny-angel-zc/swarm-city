#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

export function parsePorcelainStatus(output) {
  const counts = {
    modified: 0,
    deleted: 0,
    untracked: 0,
    other: 0,
  };

  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  for (const line of lines) {
    const x = line[0] ?? ' ';
    const y = line[1] ?? ' ';

    if (x === '?' && y === '?') {
      counts.untracked += 1;
      continue;
    }

    if (x === 'D' || y === 'D') {
      counts.deleted += 1;
      continue;
    }

    if (x === 'M' || y === 'M') {
      counts.modified += 1;
      continue;
    }

    counts.other += 1;
  }

  return counts;
}

function makeCountSummary(counts) {
  return `modified=${counts.modified}, deleted=${counts.deleted}, untracked=${counts.untracked}, other=${counts.other}`;
}

export function formatRemediationText(counts) {
  return [
    '[smoke-preflight] Dirty worktree detected.',
    `[smoke-preflight] Classification: ${makeCountSummary(counts)}.`,
    '[smoke-preflight] Remediation: commit or stash tracked changes, and remove or add untracked files before continuing.',
  ].join('\n');
}

function getGitStatusPorcelain(execGitStatus) {
  if (execGitStatus) {
    return execGitStatus();
  }

  return execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function runSmokePreflight({ execGitStatus, stdout = process.stdout, stderr = process.stderr } = {}) {
  const statusOutput = getGitStatusPorcelain(execGitStatus);
  const counts = parsePorcelainStatus(statusOutput);
  const dirtyCount = counts.modified + counts.deleted + counts.untracked + counts.other;

  if (dirtyCount === 0) {
    stdout.write('[smoke-preflight] Worktree clean.\n');
    return { ok: true, exitCode: 0, counts, remediation: '' };
  }

  const remediation = formatRemediationText(counts);
  stderr.write(`${remediation}\n`);
  return { ok: false, exitCode: 1, counts, remediation };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runSmokePreflight();
  process.exitCode = result.exitCode;
}
