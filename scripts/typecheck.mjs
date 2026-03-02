#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
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

run('node', ['scripts/validate-next-router-roots.mjs']);

rmSync(resolve(process.cwd(), '.next', 'types'), { recursive: true, force: true });

run('npx', ['next', 'typegen']);
run('npx', ['tsc', '--noEmit']);
