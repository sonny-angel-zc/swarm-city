#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, readFileSync, rmSync, unlinkSync } from 'fs';
import path from 'path';
import process from 'process';

const PROJECT_ROOT = process.cwd();
const HEALTH_URL = process.env.SWARM_HEALTHCHECK_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const HEALTH_INTERVAL_MS = Math.max(2_000, Number(process.env.SWARM_SUPERVISOR_HEALTH_INTERVAL_MS ?? '5000'));
const HEALTH_TIMEOUT_MS = Math.max(500, Number(process.env.SWARM_SUPERVISOR_HEALTH_TIMEOUT_MS ?? '3000'));
const STARTUP_GRACE_MS = Math.max(5_000, Number(process.env.SWARM_SUPERVISOR_STARTUP_GRACE_MS ?? '20000'));
const FAILURE_THRESHOLD = Math.max(1, Number(process.env.SWARM_SUPERVISOR_FAILURE_THRESHOLD ?? '3'));
const RESTART_SIGNAL = path.join(PROJECT_ROOT, '.swarm-dev-restart.json');

let child = null;
let restartCount = 0;
let consecutiveHealthFailures = 0;
let lastStartAt = 0;
let shuttingDown = false;
let restarting = false;

function ts() {
  return new Date().toISOString();
}

function log(message) {
  process.stdout.write(`[supervisor ${ts()}] ${message}\n`);
}

function clearNextCache() {
  const nextDir = path.join(PROJECT_ROOT, '.next');
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
  }
}

function startDevServer() {
  lastStartAt = Date.now();
  consecutiveHealthFailures = 0;
  child = spawn('npm', ['run', 'dev'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: 'inherit',
  });
  log(`dev server started (pid=${child.pid ?? 'unknown'})`);

  child.on('exit', (code, signal) => {
    const reason = `dev server exited (code=${String(code)}, signal=${String(signal)})`;
    child = null;
    if (!shuttingDown) {
      void restartDevServer(reason);
    }
  });
}

function stopChild() {
  return new Promise((resolve) => {
    if (!child) {
      resolve();
      return;
    }
    const target = child;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const killTimer = setTimeout(() => {
      try { target.kill('SIGKILL'); } catch {}
      finish();
    }, 8_000);
    target.once('exit', () => {
      clearTimeout(killTimer);
      finish();
    });
    try {
      target.kill('SIGTERM');
    } catch {
      clearTimeout(killTimer);
      finish();
    }
  });
}

async function restartDevServer(reason) {
  if (restarting || shuttingDown) return;
  restarting = true;
  restartCount += 1;
  log(`restart #${restartCount}: ${reason}`);
  await stopChild();
  clearNextCache();
  startDevServer();
  restarting = false;
}

async function healthCheck() {
  if (!child || restarting || shuttingDown) return;

  const age = Date.now() - lastStartAt;
  if (age < STARTUP_GRACE_MS) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  let ok = false;
  let error = null;
  try {
    const res = await fetch(HEALTH_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    ok = res.ok;
    if (!res.ok) {
      error = `HTTP ${res.status}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }

  if (ok) {
    consecutiveHealthFailures = 0;
    return;
  }

  consecutiveHealthFailures += 1;
  log(`health check failed (${consecutiveHealthFailures}/${FAILURE_THRESHOLD}): ${error ?? 'unhealthy'}`);
  if (consecutiveHealthFailures >= FAILURE_THRESHOLD) {
    await restartDevServer(`unhealthy at ${HEALTH_URL}`);
  }
}

async function checkRestartSignal() {
  if (!existsSync(RESTART_SIGNAL) || restarting || shuttingDown) return;
  let reason = 'restart requested by runtime';
  try {
    const raw = readFileSync(RESTART_SIGNAL, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.reason === 'string' && parsed.reason.trim()) {
      reason = parsed.reason.trim();
    }
  } catch {
    // Ignore malformed signal files.
  }
  try {
    unlinkSync(RESTART_SIGNAL);
  } catch {
    // Ignore unlink errors.
  }
  await restartDevServer(reason);
}

function handleShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, shutting down supervisor`);
  void stopChild().finally(() => process.exit(0));
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

log(`starting supervised dev server (health=${HEALTH_URL})`);
startDevServer();
setInterval(() => { void healthCheck(); }, HEALTH_INTERVAL_MS);
setInterval(() => { void checkRestartSignal(); }, 2_000);
