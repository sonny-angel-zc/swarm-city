#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const NEXT_CACHE_DIR = path.join(PROJECT_ROOT, '.next');
const SUPERVISOR_DIR = path.join(PROJECT_ROOT, '.swarm-supervisor');
const RESTART_REQUEST_FILE = path.join(SUPERVISOR_DIR, 'restart-request.json');
const HEARTBEAT_FILE = path.join(SUPERVISOR_DIR, 'supervisor-heartbeat.json');
const HEALTH_URL = process.env.SWARM_DEV_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const HEALTH_INTERVAL_MS = Number(process.env.SWARM_SUPERVISOR_HEALTH_INTERVAL_MS ?? '10000');
const HEALTH_TIMEOUT_MS = Number(process.env.SWARM_SUPERVISOR_HEALTH_TIMEOUT_MS ?? '2500');
const UNHEALTHY_THRESHOLD = Number(process.env.SWARM_SUPERVISOR_UNHEALTHY_THRESHOLD ?? '3');

let child = null;
let stopping = false;
let restartCount = 0;
let unhealthyCount = 0;
let restartInFlight = false;

function log(message) {
  const ts = new Date().toISOString();
  console.log(`[supervisor ${ts}] ${message}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function probeHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, { method: 'GET', cache: 'no-store', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function readRestartReason() {
  if (!existsSync(RESTART_REQUEST_FILE)) return null;
  try {
    const body = JSON.parse(readFileSync(RESTART_REQUEST_FILE, 'utf8'));
    return typeof body.reason === 'string' ? body.reason : 'restart requested';
  } catch {
    return 'restart requested';
  }
}

function clearRestartRequest() {
  try {
    unlinkSync(RESTART_REQUEST_FILE);
  } catch {
    // no-op
  }
}

function clearNextCache() {
  try {
    rmSync(NEXT_CACHE_DIR, { recursive: true, force: true });
    log('cleared .next cache before restart');
  } catch {
    log('failed to clear .next cache; continuing restart');
  }
}

function writeHeartbeat() {
  mkdirSync(SUPERVISOR_DIR, { recursive: true });
  writeFileSync(
    HEARTBEAT_FILE,
    JSON.stringify({
      pid: process.pid,
      childPid: child?.pid ?? null,
      restartCount,
      timestamp: new Date().toISOString(),
      healthUrl: HEALTH_URL,
    }),
  );
}

function startChild() {
  child = spawn('npm', ['run', 'dev'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: 'inherit',
  });

  unhealthyCount = 0;
  writeHeartbeat();

  child.on('exit', async (code, signal) => {
    const exitedChild = child;
    child = null;

    if (stopping) return;

    if (!restartInFlight) {
      const reason = `child exited (code=${String(code)}, signal=${String(signal)})`;
      await restartChild(reason);
    } else if (exitedChild?.pid) {
      // restart flow owns bringing child back up
    }
  });

  child.on('error', async (err) => {
    if (stopping) return;
    await restartChild(`child process error: ${String(err)}`);
  });

  log(`spawned dev server (pid=${child.pid})`);
}

async function stopChild() {
  const current = child;
  if (!current) return;

  current.kill('SIGTERM');
  for (let i = 0; i < 20; i += 1) {
    if (!child) return;
    await delay(250);
  }

  if (child) {
    child.kill('SIGKILL');
  }
}

async function restartChild(reason) {
  if (restartInFlight || stopping) return;
  restartInFlight = true;

  try {
    restartCount += 1;
    log(`restarting dev server (#${restartCount}) reason="${reason}"`);
    clearRestartRequest();
    await stopChild();
    clearNextCache();
    await delay(500);
    startChild();
  } finally {
    restartInFlight = false;
  }
}

async function watchdogLoop() {
  while (!stopping) {
    await delay(HEALTH_INTERVAL_MS);
    if (stopping) break;

    const requestedReason = readRestartReason();
    if (requestedReason) {
      await restartChild(`external request: ${requestedReason}`);
      continue;
    }

    if (!child || restartInFlight) {
      continue;
    }

    const healthy = await probeHealth();
    if (healthy) {
      unhealthyCount = 0;
      writeHeartbeat();
      continue;
    }

    unhealthyCount += 1;
    log(`health probe failed (${unhealthyCount}/${UNHEALTHY_THRESHOLD})`);
    if (unhealthyCount >= UNHEALTHY_THRESHOLD) {
      await restartChild(`health checks failed ${unhealthyCount} times`);
    }
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearRestartRequest();
  try {
    unlinkSync(HEARTBEAT_FILE);
  } catch {
    // no-op
  }
  await stopChild();
  process.exit(0);
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

log(`starting supervised dev server for ${PROJECT_ROOT}`);
startChild();
void watchdogLoop();
