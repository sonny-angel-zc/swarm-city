#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const HEALTH_URL = process.env.SWARM_SUPERVISOR_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const HEALTH_INTERVAL_MS = Number(process.env.SWARM_SUPERVISOR_HEALTH_INTERVAL_MS ?? '15000');
const HEALTH_TIMEOUT_MS = Number(process.env.SWARM_SUPERVISOR_HEALTH_TIMEOUT_MS ?? '4000');
const HEALTH_FAIL_THRESHOLD = Number(process.env.SWARM_SUPERVISOR_FAIL_THRESHOLD ?? '3');

let child = null;
let stopping = false;
let restarting = false;
let restarts = 0;
let consecutiveHealthFailures = 0;

function log(message) {
  const ts = new Date().toISOString();
  console.log(`[supervisor ${ts}] ${message}`);
}

function clearNextCache() {
  const nextPath = path.join(process.cwd(), '.next');
  rmSync(nextPath, { recursive: true, force: true });
  log('Cleared .next cache before restart.');
}

function startDevServer() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  child = spawn(npmCmd, ['run', 'dev'], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${String(code)}`;
    if (stopping || restarting) return;
    void restartDevServer(`dev server exited (${reason})`);
  });
}

function stopCurrentServer() {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }

    const proc = child;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    proc.once('exit', () => finish());
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!done) proc.kill('SIGKILL');
    }, 8000);
  });
}

async function restartDevServer(reason) {
  if (restarting) return;
  restarting = true;
  restarts += 1;
  log(`Restart #${restarts}: ${reason}`);
  consecutiveHealthFailures = 0;
  clearNextCache();
  await stopCurrentServer();
  startDevServer();
  restarting = false;
}

async function isHealthy() {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function runHealthCheck() {
  if (!child || restarting || stopping) return;
  const ok = await isHealthy();
  if (ok) {
    consecutiveHealthFailures = 0;
    return;
  }

  consecutiveHealthFailures += 1;
  log(`Health check failed (${consecutiveHealthFailures}/${HEALTH_FAIL_THRESHOLD}) at ${HEALTH_URL}`);
  if (consecutiveHealthFailures >= HEALTH_FAIL_THRESHOLD) {
    await restartDevServer('health check failures');
  }
}

process.on('SIGINT', async () => {
  stopping = true;
  log('Received SIGINT, shutting down supervisor.');
  await stopCurrentServer();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  stopping = true;
  log('Received SIGTERM, shutting down supervisor.');
  await stopCurrentServer();
  process.exit(0);
});

log(`Starting supervised dev server. Health endpoint: ${HEALTH_URL}`);
clearNextCache();
startDevServer();
setInterval(() => {
  void runHealthCheck();
}, Math.max(5000, HEALTH_INTERVAL_MS));
