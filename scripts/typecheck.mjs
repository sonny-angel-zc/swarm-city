#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function isEnabled(value) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

const shouldRunNextTypegen = isEnabled(process.env.TYPECHECK_RUN_NEXT_TYPEGEN);
const localNextBin = resolve(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const localTscBin = resolve(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');

run(process.execPath, ['scripts/validate-next-router-roots.mjs']);

rmSync(resolve(process.cwd(), '.next', 'types'), { recursive: true, force: true });

if (shouldRunNextTypegen) {
  console.log('[typecheck] TYPECHECK_RUN_NEXT_TYPEGEN is enabled, running Next.js type generation.');
  if (existsSync(localNextBin)) {
    run(process.execPath, [localNextBin, 'typegen']);
  } else {
    run('next', ['typegen']);
  }
} else {
  console.log('[typecheck] Skipping Next.js type generation (set TYPECHECK_RUN_NEXT_TYPEGEN=1 to enable).');
}

if (existsSync(localTscBin)) {
  run(process.execPath, [localTscBin, '--noEmit']);
} else {
  run('tsc', ['--noEmit']);
}
