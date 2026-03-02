#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const LOG_PREFIX = '[typecheck]';

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runAllowFailure(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function fileExists(path) {
  return existsSync(resolve(process.cwd(), path));
}

function dependenciesReady() {
  return (
    fileExists('node_modules/next/package.json') &&
    fileExists('node_modules/typescript/package.json')
  );
}

function hydrateNodeModulesFromPrebuiltLayer() {
  const nodeModulesLayerDir = process.env.PREBUILT_NODE_MODULES_DIR;
  if (!nodeModulesLayerDir) {
    return false;
  }

  const source = resolve(nodeModulesLayerDir);
  if (!existsSync(source)) {
    log(`PREBUILT_NODE_MODULES_DIR is set but not found: ${source}`);
    return false;
  }

  const sourceNodeModules = fileExists(resolve(source, 'node_modules', 'next', 'package.json'))
    ? resolve(source, 'node_modules')
    : source;

  log(`Hydrating node_modules from prebuilt layer: ${sourceNodeModules}`);
  cpSync(sourceNodeModules, resolve(process.cwd(), 'node_modules'), { recursive: true, force: true });
  return true;
}

function hydrateNodeModulesFromTarball() {
  const tarball = process.env.PREBUILT_NODE_MODULES_TARBALL;
  if (!tarball) {
    return false;
  }

  const source = resolve(tarball);
  if (!existsSync(source)) {
    log(`PREBUILT_NODE_MODULES_TARBALL is set but not found: ${source}`);
    return false;
  }

  log(`Extracting prebuilt dependency tarball: ${source}`);
  const result = runAllowFailure('tar', ['-xf', source, '-C', process.cwd()]);
  if (result.status !== 0) {
    log('Failed to extract prebuilt dependency tarball.');
    return false;
  }
  return true;
}

function attemptOfflineInstall() {
  if (!fileExists('package-lock.json')) {
    log('Skipping npm ci: package-lock.json is missing.');
    return;
  }

  log('Attempting npm ci with offline-first settings.');
  const installResult = runAllowFailure('npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund']);
  if (installResult.status !== 0) {
    log('npm ci failed (likely restricted network or missing cache).');
  }
}

function ensureDependenciesForFullTypecheck() {
  if (dependenciesReady()) {
    log('Using existing node_modules dependencies.');
    return true;
  }

  const hadPrebuiltLayer = hydrateNodeModulesFromPrebuiltLayer();
  const hadTarball = hydrateNodeModulesFromTarball();
  if ((hadPrebuiltLayer || hadTarball) && dependenciesReady()) {
    log('Dependencies restored from prebuilt layer.');
    return true;
  }

  attemptOfflineInstall();
  if (dependenciesReady()) {
    log('Dependencies installed via npm ci.');
    return true;
  }

  return false;
}

run('node', ['scripts/validate-next-router-roots.mjs']);
rmSync(resolve(process.cwd(), '.next', 'types'), { recursive: true, force: true });

if (ensureDependenciesForFullTypecheck()) {
  run('npx', ['--no-install', 'next', 'typegen']);
  run('npx', ['--no-install', 'tsc', '--noEmit']);
} else {
  log('Full typecheck unavailable; falling back to changed-file validation.');
  run('node', ['scripts/validate-changed-files.mjs']);
}
