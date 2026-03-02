#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const healthUrl = process.env.SWARM_DEV_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const checkIntervalMs = Number(process.env.SWARM_DEV_HEALTH_INTERVAL_MS ?? '10000');
const maxHealthFailures = Number(process.env.SWARM_DEV_HEALTH_MAX_FAILURES ?? '2');
const restartSignalPath = process.env.SWARM_DEV_RESTART_SIGNAL ?? '/tmp/swarm-city-dev-restart.signal';

let child = null;
let restarts = 0;
let healthFailures = 0;
let restarting = false;
let lastSignalValue = existsSync(restartSignalPath) ? readFileSync(restartSignalPath, 'utf8') : '';

function log(message) {
  const stamp = new Date().toISOString();
  process.stdout.write(`[supervisor ${stamp}] ${message}\n`);
}

function clearNextCache() {
  const nextPath = path.join(projectRoot, '.next');
  rmSync(nextPath, { recursive: true, force: true });
  log('Cleared .next cache before restart.');
}

function startDevServer() {
  child = spawn('npm', ['run', 'dev'], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    const reason = `dev server exited (code=${String(code)} signal=${String(signal)})`;
    log(reason);
    if (restarting) return;
    void restartDevServer(reason);
  });
}

function stopChild() {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }
    const proc = child;
    const timeout = setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 5000);
    proc.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    proc.kill('SIGTERM');
  });
}

async function restartDevServer(reason) {
  if (restarting) return;
  restarting = true;
  restarts += 1;
  log(`Restarting dev server #${restarts}: ${reason}`);
  await stopChild();
  clearNextCache();
  healthFailures = 0;
  startDevServer();
  restarting = false;
}

async function checkHealth() {
  if (!child || restarting) return;
  try {
    const res = await fetch(healthUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    healthFailures = 0;
  } catch (err) {
    healthFailures += 1;
    log(`Health check failed (${healthFailures}/${maxHealthFailures}): ${String(err)}`);
    if (healthFailures >= maxHealthFailures) {
      await restartDevServer('health check failure');
    }
  }
}

function checkRestartSignal() {
  if (!existsSync(restartSignalPath)) return;
  const value = readFileSync(restartSignalPath, 'utf8');
  if (value === lastSignalValue) return;
  lastSignalValue = value;
  void restartDevServer('received external restart signal');
}

process.on('SIGINT', async () => {
  log('Supervisor received SIGINT; shutting down.');
  await stopChild();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('Supervisor received SIGTERM; shutting down.');
  await stopChild();
  process.exit(0);
});

log('Starting supervised dev server.');
startDevServer();
setInterval(() => {
  checkRestartSignal();
  void checkHealth();
}, Math.max(2000, checkIntervalMs));
