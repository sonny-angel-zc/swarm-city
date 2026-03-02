#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import process from 'process';

const PROJECT_ROOT = process.cwd();
const PORT = Number(process.env.PORT ?? '3000');
const HEALTHCHECK_URL = process.env.SWARM_HEALTHCHECK_URL ?? `http://127.0.0.1:${PORT}/api/autonomous/health`;
const HEALTH_INTERVAL_MS = Number(process.env.SWARM_SUPERVISOR_HEALTH_INTERVAL_MS ?? '10000');
const HEALTH_FAILURE_THRESHOLD = Number(process.env.SWARM_SUPERVISOR_HEALTH_FAILURES ?? '3');
const HEALTH_TIMEOUT_MS = Number(process.env.SWARM_SUPERVISOR_HEALTH_TIMEOUT_MS ?? '4000');
const RESTART_SIGNAL_FILE = path.join(PROJECT_ROOT, '.swarm-supervisor-restart');

let child = null;
let restartCount = 0;
let shuttingDown = false;
let healthFailures = 0;
let restartInProgress = false;

function log(message) {
  const stamp = new Date().toISOString();
  process.stdout.write(`[supervisor ${stamp}] ${message}\n`);
}

function clearNextCache() {
  const nextDir = path.join(PROJECT_ROOT, '.next');
  try {
    fs.rmSync(nextDir, { recursive: true, force: true });
    log('cleared .next cache');
  } catch (err) {
    log(`failed to clear .next cache: ${String(err)}`);
  }
}

function startDevServer() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  child = spawn(npmCmd, ['run', 'dev'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: 'inherit',
  });

  healthFailures = 0;

  child.on('exit', (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${String(code)}`;
    log(`dev server exited (${detail})`);
    child = null;

    if (!shuttingDown && !restartInProgress) {
      void restartDevServer(`process exited (${detail})`);
    }
  });
}

function stopChild() {
  return new Promise((resolve) => {
    if (!child) {
      resolve();
      return;
    }

    const proc = child;
    let settled = false;

    const finalize = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const forceTimer = setTimeout(() => {
      if (proc.pid) {
        try {
          process.kill(proc.pid, 'SIGKILL');
        } catch {}
      }
      finalize();
    }, 8000);

    proc.once('exit', () => {
      clearTimeout(forceTimer);
      finalize();
    });

    if (proc.pid) {
      try {
        process.kill(proc.pid, 'SIGTERM');
      } catch {
        clearTimeout(forceTimer);
        finalize();
      }
    }
  });
}

async function restartDevServer(reason) {
  if (restartInProgress) return;
  restartInProgress = true;
  restartCount += 1;
  log(`restart #${restartCount}: ${reason}`);

  await stopChild();
  clearNextCache();
  startDevServer();

  restartInProgress = false;
}

async function healthCheckOnce() {
  if (!child || restartInProgress) return;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(HEALTHCHECK_URL, {
      cache: 'no-store',
      signal: controller.signal,
    });
    const latency = Date.now() - startedAt;

    if (res.ok) {
      healthFailures = 0;
      return;
    }

    healthFailures += 1;
    log(`health failure ${healthFailures}/${HEALTH_FAILURE_THRESHOLD} (status ${res.status}, ${latency}ms)`);
  } catch (err) {
    healthFailures += 1;
    log(`health failure ${healthFailures}/${HEALTH_FAILURE_THRESHOLD} (${String(err)})`);
  } finally {
    clearTimeout(timeout);
  }

  if (healthFailures >= HEALTH_FAILURE_THRESHOLD) {
    await restartDevServer('health check failures threshold reached');
  }
}

function checkRestartSignalFile() {
  if (!fs.existsSync(RESTART_SIGNAL_FILE) || restartInProgress) return;

  let reason = 'manual restart request';
  try {
    const raw = fs.readFileSync(RESTART_SIGNAL_FILE, 'utf8');
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      const parsedReason = String(parsed.reason ?? '').trim();
      if (parsedReason) reason = parsedReason;
    }
  } catch {}

  try {
    fs.rmSync(RESTART_SIGNAL_FILE, { force: true });
  } catch {}

  void restartDevServer(`external signal: ${reason}`);
}

function wireSignals() {
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, shutting down supervisor`);
    await stopChild();
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

wireSignals();
clearNextCache();
startDevServer();

setInterval(() => { void healthCheckOnce(); }, HEALTH_INTERVAL_MS);
setInterval(() => { checkRestartSignalFile(); }, 2000);
