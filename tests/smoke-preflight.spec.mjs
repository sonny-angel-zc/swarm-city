import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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

function createStubCommand(binDir, name, body) {
  const target = join(binDir, name);
  writeFileSync(target, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  chmodSync(target, 0o755);
}

function createMockToolchain({ failGitStatus = false } = {}) {
  const binDir = mkdtempSync(join(tmpdir(), 'smoke-preflight-bin-'));

  createStubCommand(binDir, 'npm', 'exit 0');
  createStubCommand(binDir, 'npx', 'exit 0');
  createStubCommand(binDir, 'node', 'exit 0');
  createStubCommand(
    binDir,
    'git',
    `
if [ "$1" = "--version" ]; then
  exit 0
fi
if [ "$1" = "status" ]; then
  if [ "${failGitStatus}" = "true" ]; then
    exit 2
  fi
  exit 0
fi
exit 0
`,
  );

  return binDir;
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

function parseFailureContract(stderr) {
  const lines = stderr.split('\n');
  const failCodeLine = lines.find(line => line.includes('FAIL_CODE'));
  const failCode = failCodeLine?.match(/FAIL_CODE\s+([A-Z_]+)/)?.[1] ?? null;

  const fieldOrder = [];
  const fields = {};
  for (const line of lines) {
    const match = line.match(/FAIL_FIELD\s+([a-z0-9_]+)=(.*)$/i);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    fieldOrder.push(key);
    fields[key] = value;
  }

  return { failCode, fieldOrder, fields };
}

function assertFailureContract(result, { code, fieldKeys = [] }) {
  assert.equal(result.status, 1, result.stderr || result.stdout);

  const contract = parseFailureContract(result.stderr);
  assert.equal(contract.failCode, code, result.stderr);
  assert.deepEqual(
    contract.fieldOrder,
    [...contract.fieldOrder].sort((left, right) => left.localeCompare(right)),
    result.stderr,
  );

  const sortedExpected = [...fieldKeys].sort((left, right) => left.localeCompare(right));
  assert.deepEqual(contract.fieldOrder, sortedExpected, result.stderr);
  return contract;
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

  assertFailureContract(result, {
    code: 'TOOL_UNAVAILABLE',
    fieldKeys: ['command', 'status'],
  });
  assert.match(result.stderr, /Required tool "npm" is unavailable\./);
});

test('fails preflight when worktree is dirty', () => {
  const repo = createRepo({ includeDependencies: true, dirty: true });
  const result = runPreflight(repo);

  const contract = assertFailureContract(result, {
    code: 'WORKTREE_DIRTY',
    fieldKeys: ['deleted', 'modified', 'other', 'total', 'untracked'],
  });
  assert.equal(Number.parseInt(contract.fields.modified, 10), 0);
  assert.equal(Number.parseInt(contract.fields.deleted, 10), 0);
  assert.equal(Number.parseInt(contract.fields.untracked, 10), 1);
  assert.equal(Number.parseInt(contract.fields.other, 10), 0);
  assert.equal(Number.parseInt(contract.fields.total, 10), 1);
  assert.match(result.stderr, /Dirty worktree detected/);
});

test('fails preflight with HOST_EMPTY contract when host is blank', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo, { SMOKE_HOST: '   ' });

  assertFailureContract(result, {
    code: 'HOST_EMPTY',
    fieldKeys: [],
  });
});

test('fails preflight with HOST_HAS_WHITESPACE contract when host has spaces', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo, { SMOKE_HOST: '127.0.0. 1' });

  const contract = assertFailureContract(result, {
    code: 'HOST_HAS_WHITESPACE',
    fieldKeys: ['host'],
  });
  assert.equal(contract.fields.host, '127.0.0. 1');
});

test('fails preflight with INVALID_SMOKE_PORT contract for non-numeric port', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo, { SMOKE_PORT: 'abc' });

  const contract = assertFailureContract(result, {
    code: 'INVALID_SMOKE_PORT',
    fieldKeys: ['port_raw'],
  });
  assert.equal(contract.fields.port_raw, 'abc');
});

test('fails preflight with INVALID_PREFLIGHT_MODE contract for unsupported mode', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo, { SMOKE_PREFLIGHT_MODE: 'invalid' });

  const contract = assertFailureContract(result, {
    code: 'INVALID_PREFLIGHT_MODE',
    fieldKeys: ['mode'],
  });
  assert.equal(contract.fields.mode, 'invalid');
});

test('fails preflight with MISSING_DEPENDENCY contract', () => {
  const repo = createRepo({ includeDependencies: false, dirty: false });
  const result = runPreflight(repo);

  const contract = assertFailureContract(result, {
    code: 'MISSING_DEPENDENCY',
    fieldKeys: ['dependency', 'package_path'],
  });
  assert.equal(contract.fields.dependency, 'next');
  assert.equal(contract.fields.package_path, 'node_modules/next/package.json');
});

test('fails preflight with GIT_STATUS_UNAVAILABLE contract', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const pathPrefix = createMockToolchain({ failGitStatus: true });
  const result = runPreflight(repo, {
    PATH: pathPrefix,
  });

  const contract = assertFailureContract(result, {
    code: 'GIT_STATUS_UNAVAILABLE',
    fieldKeys: ['command', 'status'],
  });
  assert.equal(contract.fields.command, 'git status --porcelain=v1 --untracked-files=all');
  assert.equal(Number.parseInt(contract.fields.status, 10), 2);
});

test('fails preflight with CHECK_MODE_SERVER_UNAVAILABLE contract', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo, {
    SMOKE_PREFLIGHT_MODE: 'check',
    SMOKE_HOST: '127.0.0.1',
    SMOKE_PORT: '65533',
  });

  const contract = assertFailureContract(result, {
    code: 'CHECK_MODE_SERVER_UNAVAILABLE',
    fieldKeys: ['base_url', 'mode'],
  });
  assert.equal(contract.fields.mode, 'check');
  assert.equal(contract.fields.base_url, 'http://127.0.0.1:65533');
});

test('fails preflight with SERVER_START_TIMEOUT contract in listen mode', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const pathPrefix = createMockToolchain({ failGitStatus: false });
  const result = runPreflight(repo, {
    PATH: pathPrefix,
    SMOKE_HOST: '127.0.0.1',
    SMOKE_PORT: '65534',
    SMOKE_PREFLIGHT_MODE: 'listen',
    SMOKE_PREFLIGHT_START_TIMEOUT_MS: '50',
    SMOKE_PREFLIGHT_POLL_INTERVAL_MS: '5',
    SMOKE_PREFLIGHT_REQUEST_TIMEOUT_MS: '20',
  });

  const contract = assertFailureContract(result, {
    code: 'SERVER_START_TIMEOUT',
    fieldKeys: ['base_url', 'timeout_seconds'],
  });
  assert.equal(contract.fields.base_url, 'http://127.0.0.1:65534');
  assert.equal(Number.parseInt(contract.fields.timeout_seconds, 10), 0);
});

test('fails preflight with NODE_VERSION_UNSUPPORTED contract', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo, {
    SMOKE_PREFLIGHT_NODE_VERSION: '18.20.0',
  });

  const contract = assertFailureContract(result, {
    code: 'NODE_VERSION_UNSUPPORTED',
    fieldKeys: ['min_major', 'node_version'],
  });
  assert.equal(Number.parseInt(contract.fields.min_major, 10), 20);
  assert.equal(contract.fields.node_version, '18.20.0');
});

test('fails preflight with UNEXPECTED_FAILURE contract', () => {
  const repo = createRepo({ includeDependencies: true, dirty: false });
  const result = runPreflight(repo, {
    SMOKE_PREFLIGHT_FORCE_UNEXPECTED: '1',
  });

  const contract = assertFailureContract(result, {
    code: 'UNEXPECTED_FAILURE',
    fieldKeys: ['error_name', 'error_type'],
  });
  assert.equal(contract.fields.error_name, 'Error');
  assert.equal(contract.fields.error_type, 'object');
});
