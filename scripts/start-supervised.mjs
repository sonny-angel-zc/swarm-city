#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const runtimeDir = path.join(repoRoot, process.env.SWARM_RUNTIME_DIR ?? '.swarm-runtime');
const restartSignalPath = path.join(runtimeDir, process.env.SWARM_DEV_RESTART_SIGNAL ?? 'restart-dev-server.signal');
const healthUrl = process.env.SWARM_DEV_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const healthPollMs = Number(process.env.SWARM_SUPERVISOR_HEALTH_POLL_MS ?? '5000');
const healthTimeoutMs = Number(process.env.SWARM_SUPERVISOR_HEALTH_TIMEOUT_MS ?? '2500');
const unhealthyThreshold = Number(process.env.SWARM_SUPERVISOR_UNHEALTHY_THRESHOLD ?? '3');

let child = null;
let stopping = false;
let unhealthyCount = 0;
let restartCount = 0;
let restartTimer = null;
let suppressExitRestart = false;

function ts() {
  return new Date().toISOString();
}

function log(message) {
  process.stdout.write(`[supervisor ${ts()}] ${message}\n`);
}

function ensureRuntimeDir() {
  mkdirSync(runtimeDir, { recursive: true });
}

function clearNextCache() {
  const nextDist = process.env.NEXT_DIST_DIR || '.next-dev-3000';
  const nextDir = path.join(repoRoot, nextDist);
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
    log(`cleared ${nextDist} cache`);
  }
}

function consumeRestartSignal() {
  if (!existsSync(restartSignalPath)) return null;
  try {
    const reason = readFileSync(restartSignalPath, 'utf8').trim();
    unlinkSync(restartSignalPath);
    return reason || 'restart signal detected';
  } catch {
    return 'restart signal detected';
  }
}

function spawnDevServer() {
  if (child && !child.killed) {
    log('dev server already running; skipping spawn');
    return;
  }
  clearNextCache();
  ensureRuntimeDir();
  log('starting Next.js dev server');

  child = spawn('npm', ['run', 'dev'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_DISABLE_WEBPACK_CACHE: process.env.NEXT_DISABLE_WEBPACK_CACHE ?? '1',
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '.next-dev-3000',
    },
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;
    const expectedExit = suppressExitRestart;
    child = null;
    log(`dev server exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    if (!expectedExit) {
      scheduleRestart('process exit');
    }
  });
}

function terminateChild() {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
}

function scheduleRestart(reason) {
  if (stopping) return;
  if (restartTimer) {
    log(`restart already scheduled; ignoring additional trigger (${reason})`);
    return;
  }
  restartCount += 1;
  unhealthyCount = 0;
  log(`restarting dev server (#${restartCount}) due to: ${reason}`);
  suppressExitRestart = true;
  terminateChild();
  restartTimer = setTimeout(() => {
    restartTimer = null;
    suppressExitRestart = false;
    if (stopping) return;
    spawnDevServer();
  }, 600);
}

async function probeHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, healthTimeoutMs));
  try {
    const res = await fetch(healthUrl, { method: 'GET', cache: 'no-store', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function watchdogTick() {
  if (stopping) return;

  const signalReason = consumeRestartSignal();
  if (signalReason) {
    scheduleRestart(signalReason);
    return;
  }

  const healthy = await probeHealth();
  if (healthy) {
    unhealthyCount = 0;
    return;
  }

  unhealthyCount += 1;
  log(`health check failed (${unhealthyCount}/${unhealthyThreshold})`);
  if (unhealthyCount >= Math.max(1, unhealthyThreshold)) {
    scheduleRestart('unhealthy health checks');
  }
}

function shutdown() {
  stopping = true;
  log('supervisor shutting down');
  terminateChild();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

spawnDevServer();
setInterval(() => {
  void watchdogTick();
}, Math.max(2000, healthPollMs));
