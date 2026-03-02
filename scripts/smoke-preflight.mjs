#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MIN_NODE_MAJOR = 20;
const START_TIMEOUT_MS = Number.parseInt(process.env.SMOKE_PREFLIGHT_START_TIMEOUT_MS ?? '', 10) || 45_000;
const POLL_INTERVAL_MS = Number.parseInt(process.env.SMOKE_PREFLIGHT_POLL_INTERVAL_MS ?? '', 10) || 1_000;
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.SMOKE_PREFLIGHT_REQUEST_TIMEOUT_MS ?? '', 10) || 2_500;
const PREFLIGHT_MODES = new Set(['listen', 'check', 'skip']);

const FAIL_CODES = Object.freeze({
  CHECK_MODE_SERVER_UNAVAILABLE: 'CHECK_MODE_SERVER_UNAVAILABLE',
  GIT_STATUS_UNAVAILABLE: 'GIT_STATUS_UNAVAILABLE',
  HOST_EMPTY: 'HOST_EMPTY',
  HOST_HAS_WHITESPACE: 'HOST_HAS_WHITESPACE',
  INVALID_PREFLIGHT_MODE: 'INVALID_PREFLIGHT_MODE',
  INVALID_SMOKE_PORT: 'INVALID_SMOKE_PORT',
  MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
  NODE_VERSION_UNSUPPORTED: 'NODE_VERSION_UNSUPPORTED',
  SERVER_START_TIMEOUT: 'SERVER_START_TIMEOUT',
  TOOL_UNAVAILABLE: 'TOOL_UNAVAILABLE',
  UNEXPECTED_FAILURE: 'UNEXPECTED_FAILURE',
  WORKTREE_DIRTY: 'WORKTREE_DIRTY',
});

function log(message) {
  console.log(`[smoke:preflight] ${message}`);
}

function formatFailFieldValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\n/g, '\\n');
}

function emitFailureContract(code, fields = {}) {
  console.error(`[smoke:preflight] FAIL_CODE ${code}`);

  const keys = Object.keys(fields).sort((left, right) => left.localeCompare(right));
  for (const key of keys) {
    console.error(`[smoke:preflight] FAIL_FIELD ${key}=${formatFailFieldValue(fields[key])}`);
  }
}

function fail(code, message, hint, fields = {}) {
  console.error(`[smoke:preflight] ERROR: ${message}`);
  emitFailureContract(code, fields);
  if (hint) {
    console.error(`[smoke:preflight] HINT: ${hint}`);
  }
  process.exit(1);
}

function parseSmokeConfig() {
  const host = (process.env.SMOKE_HOST || '127.0.0.1').trim();
  const portRaw = process.env.SMOKE_PORT;
  const preflightMode = (process.env.SMOKE_PREFLIGHT_MODE || 'listen').trim().toLowerCase();
  const fallbackPort = 3000;

  if (!host) {
    fail(
      FAIL_CODES.HOST_EMPTY,
      'SMOKE_HOST is empty.',
      'Set SMOKE_HOST to a valid hostname or IP, for example: SMOKE_HOST=127.0.0.1',
    );
  }

  if (/\s/.test(host)) {
    fail(
      FAIL_CODES.HOST_HAS_WHITESPACE,
      `SMOKE_HOST has whitespace: "${host}".`,
      'Use a plain hostname or IP with no spaces, for example: SMOKE_HOST=0.0.0.0',
      { host },
    );
  }

  const parsedPort = Number.parseInt(portRaw ?? '', 10);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : fallbackPort;

  if (portRaw !== undefined && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
    fail(
      FAIL_CODES.INVALID_SMOKE_PORT,
      `SMOKE_PORT must be an integer from 1-65535, received: "${portRaw}".`,
      `Unset SMOKE_PORT to use ${fallbackPort}, or provide a valid port like SMOKE_PORT=4173.`,
      { port_raw: portRaw },
    );
  }

  if (!PREFLIGHT_MODES.has(preflightMode)) {
    fail(
      FAIL_CODES.INVALID_PREFLIGHT_MODE,
      `SMOKE_PREFLIGHT_MODE must be one of: ${Array.from(PREFLIGHT_MODES).join(', ')}. Received: "${preflightMode}".`,
      'Use listen (default), check (existing server only), or skip (non-listening mode).',
      { mode: preflightMode },
    );
  }

  return { host, port, preflightMode, baseUrl: `http://${host}:${port}` };
}

function ensureNodeVersion() {
  const detectedNodeVersion = process.env.SMOKE_PREFLIGHT_NODE_VERSION || process.versions.node;
  const major = Number.parseInt(detectedNodeVersion.split('.')[0] ?? '', 10);
  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
    fail(
      FAIL_CODES.NODE_VERSION_UNSUPPORTED,
      `Node.js ${detectedNodeVersion} detected, but smoke tests require Node.js ${MIN_NODE_MAJOR}+.`,
      `Use Node.js ${MIN_NODE_MAJOR}+ (for example via nvm), then reinstall dependencies with npm ci.`,
      {
        min_major: MIN_NODE_MAJOR,
        node_version: detectedNodeVersion,
      },
    );
  }
}

function ensureCommand(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf-8' });
  if (result.error || result.status !== 0) {
    fail(
      FAIL_CODES.TOOL_UNAVAILABLE,
      `Required tool "${command}" is unavailable.`,
      `Install ${command} and ensure it is on PATH, then retry npm run test:smoke.`,
      {
        command,
        status: result.status ?? '',
      },
    );
  }
}

function ensureDependencyInstalled(packagePath, label) {
  if (!existsSync(resolve(process.cwd(), packagePath))) {
    fail(
      FAIL_CODES.MISSING_DEPENDENCY,
      `Missing dependency: ${label}.`,
      'Run npm ci (or npm install) before running smoke tests.',
      {
        dependency: label,
        package_path: packagePath,
      },
    );
  }
}

function parseWorktreeChanges(lines) {
  const summary = {
    modified: 0,
    deleted: 0,
    untracked: 0,
    other: 0,
  };

  for (const line of lines) {
    if (line.startsWith('??')) {
      summary.untracked += 1;
      continue;
    }

    const status = line.slice(0, 2);
    const x = status[0];
    const y = status[1];

    if (x === 'D' || y === 'D') {
      summary.deleted += 1;
      continue;
    }

    if ('MARCUT'.includes(x) || 'MARCUT'.includes(y)) {
      summary.modified += 1;
      continue;
    }

    summary.other += 1;
  }

  return summary;
}

function ensureCleanWorktree() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.error || result.status !== 0) {
    fail(
      FAIL_CODES.GIT_STATUS_UNAVAILABLE,
      'Unable to inspect git worktree state before smoke run.',
      'Ensure git is installed and run smoke preflight from the repository root.',
      {
        command: 'git status --porcelain=v1 --untracked-files=all',
        status: result.status ?? '',
      },
    );
  }

  const lines = result.stdout
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    return;
  }

  const summary = parseWorktreeChanges(lines);
  const summaryParts = [
    `modified=${summary.modified}`,
    `deleted=${summary.deleted}`,
    `untracked=${summary.untracked}`,
  ];
  if (summary.other > 0) {
    summaryParts.push(`other=${summary.other}`);
  }
  const preview = lines.slice(0, 8).join('\n');
  const remainder = lines.length > 8 ? `\n...and ${lines.length - 8} more` : '';

  fail(
    FAIL_CODES.WORKTREE_DIRTY,
    `Dirty worktree detected (${summaryParts.join(', ')}). Smoke preflight requires a clean repository state.`,
    `Commit/stash/discard local changes (including untracked files), then retry.\nInspect with: git status --short\n\nCurrent changes:\n${preview}${remainder}`,
    {
      deleted: summary.deleted,
      modified: summary.modified,
      other: summary.other,
      total: lines.length,
      untracked: summary.untracked,
    },
  );
}

function checkUrlReady(baseUrl) {
  return new Promise(resolveReady => {
    const req = httpRequest(
      baseUrl,
      { method: 'GET', timeout: REQUEST_TIMEOUT_MS },
      res => {
        // Any HTTP response confirms something is serving on the configured host/port.
        resolveReady(Boolean(res.statusCode && res.statusCode < 500));
        res.resume();
      },
    );

    req.on('error', () => resolveReady(false));
    req.on('timeout', () => {
      req.destroy();
      resolveReady(false);
    });

    req.end();
  });
}

async function waitForReady(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkUrlReady(baseUrl)) {
      return true;
    }
    await new Promise(resolveSleep => setTimeout(resolveSleep, POLL_INTERVAL_MS));
  }
  return false;
}

async function terminateProcess(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    new Promise(resolveDone => child.once('exit', resolveDone)),
    new Promise(resolveDone => setTimeout(resolveDone, 5_000)),
  ]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise(resolveDone => child.once('exit', resolveDone));
  }
}

async function assertServerStartReadiness(host, port, baseUrl) {
  if (await checkUrlReady(baseUrl)) {
    log(`Existing server responded at ${baseUrl}; readiness confirmed.`);
    return;
  }

  log(`No server detected at ${baseUrl}; verifying Next.js dev server startup.`);

  const child = spawn('npx', ['next', 'dev', '-H', host, '-p', String(port)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = [];
  child.stdout.on('data', chunk => {
    output.push(String(chunk));
    if (output.length > 200) {
      output.shift();
    }
  });
  child.stderr.on('data', chunk => {
    output.push(String(chunk));
    if (output.length > 200) {
      output.shift();
    }
  });

  const ready = await waitForReady(baseUrl, START_TIMEOUT_MS);

  if (!ready) {
    await terminateProcess(child);
    const tail = output.join('').trim().split('\n').slice(-20).join('\n');
    fail(
      FAIL_CODES.SERVER_START_TIMEOUT,
      `Unable to start and reach server at ${baseUrl} within ${Math.floor(START_TIMEOUT_MS / 1000)}s.`,
      `${tail || 'No startup logs captured.'}\nFix host/port conflicts or Next startup errors, then retry.`,
      {
        base_url: baseUrl,
        timeout_seconds: Math.floor(START_TIMEOUT_MS / 1000),
      },
    );
  }

  await terminateProcess(child);
  log(`Verified server startup readiness at ${baseUrl}.`);
}

async function assertServerReadiness({ host, port, baseUrl, preflightMode }) {
  if (preflightMode === 'skip') {
    log('SMOKE_PREFLIGHT_MODE=skip; skipping server readiness check (non-listening mode).');
    return;
  }

  if (preflightMode === 'check') {
    const ready = await checkUrlReady(baseUrl);
    if (!ready) {
      fail(
        FAIL_CODES.CHECK_MODE_SERVER_UNAVAILABLE,
        `SMOKE_PREFLIGHT_MODE=check requires an existing server at ${baseUrl}, but none responded.`,
        'Start a server manually, or switch to SMOKE_PREFLIGHT_MODE=listen (default) where preflight starts Next.js automatically.',
        {
          base_url: baseUrl,
          mode: preflightMode,
        },
      );
    }

    log(`SMOKE_PREFLIGHT_MODE=check confirmed existing server at ${baseUrl}.`);
    return;
  }

  await assertServerStartReadiness(host, port, baseUrl);
}

async function main() {
  if (process.env.SMOKE_PREFLIGHT_FORCE_UNEXPECTED === '1') {
    throw new Error('Forced unexpected preflight failure.');
  }

  const { host, port, preflightMode, baseUrl } = parseSmokeConfig();

  ensureNodeVersion();
  ensureCommand('npm');
  ensureCommand('npx');
  ensureCommand('node');
  ensureCommand('git');
  ensureCleanWorktree();

  ensureDependencyInstalled('node_modules/next/package.json', 'next');
  ensureDependencyInstalled('node_modules/@playwright/test/package.json', '@playwright/test');

  log(`Config: SMOKE_HOST=${host}, SMOKE_PORT=${port}, SMOKE_PREFLIGHT_MODE=${preflightMode}`);
  await assertServerReadiness({ host, port, baseUrl, preflightMode });
  log('Preflight checks passed.');
}

main().catch(error => {
  fail(
    FAIL_CODES.UNEXPECTED_FAILURE,
    `Unexpected preflight failure: ${error?.message ?? String(error)}`,
    undefined,
    {
      error_name: error?.name ?? '',
      error_type: typeof error,
    },
  );
});
