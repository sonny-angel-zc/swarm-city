#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import process from 'process';

const projectRoot = process.cwd();
const stateDir = path.join(projectRoot, '.swarm-supervisor');
const restartSignalFile = path.join(stateDir, 'restart-request.json');
const restartLogFile = path.join(stateDir, 'restarts.log');
const nextCacheDir = path.join(projectRoot, '.next');
const healthUrl = process.env.SWARM_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const checkIntervalMs = Number(process.env.SWARM_SUPERVISOR_INTERVAL_MS ?? '15000');
const healthTimeoutMs = Number(process.env.SWARM_SUPERVISOR_HEALTH_TIMEOUT_MS ?? '4000');
const unhealthyThreshold = Number(process.env.SWARM_SUPERVISOR_UNHEALTHY_THRESHOLD ?? '3');
const startupGraceMs = Number(process.env.SWARM_SUPERVISOR_STARTUP_GRACE_MS ?? '30000');

let child = null;
let stopping = false;
let unhealthyCount = 0;
let restarting = false;
let lastSpawnAt = 0;
let lastSignalMtime = 0;
let intervalHandle = null;
let restartCount = 0;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(restartLogFile, `${line}\n`, { encoding: 'utf8', flag: 'a' });
}

function commandForNpm() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function clearNextCache() {
  try {
    rmSync(nextCacheDir, { recursive: true, force: true });
    log('Cleared .next cache before restart.');
  } catch (err) {
    log(`Failed to clear .next cache: ${String(err)}`);
  }
}

function spawnDevServer(reason) {
  if (reason !== 'initial') {
    clearNextCache();
  }
  const cmd = commandForNpm();
  const args = ['run', 'dev'];
  child = spawn(cmd, args, {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: 'inherit',
  });
  unhealthyCount = 0;
  lastSpawnAt = Date.now();
  log(`Started dev server (pid=${child.pid}, reason=${reason}).`);

  child.on('exit', (code, signal) => {
    const exitedPid = child?.pid;
    child = null;
    if (stopping) return;
    log(`Dev server exited (pid=${String(exitedPid)}, code=${String(code)}, signal=${String(signal)}).`);
    void restart(`process-exit code=${String(code)} signal=${String(signal)}`);
  });
}

async function isHealthy() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, healthTimeoutMs));
  try {
    const res = await fetch(healthUrl, { cache: 'no-store', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function consumeRestartSignal() {
  if (!existsSync(restartSignalFile)) return null;
  try {
    const stats = readFileSync(restartSignalFile, 'utf8');
    const data = JSON.parse(stats);
    const mtime = Date.parse(data.requestedAt || '');
    if (Number.isFinite(mtime) && mtime <= lastSignalMtime) return null;
    lastSignalMtime = Number.isFinite(mtime) ? mtime : Date.now();
    try {
      unlinkSync(restartSignalFile);
    } catch {
      // Ignore file removal failure.
    }
    return String(data.reason || 'manual-restart-request');
  } catch {
    return null;
  }
}

async function restart(reason) {
  if (restarting || stopping) return;
  restarting = true;
  restartCount += 1;
  log(`Restart #${restartCount}: ${reason}`);

  if (child) {
    child.kill('SIGTERM');
    const killTimeout = setTimeout(() => {
      if (child) {
        log(`Force-killing dev server pid=${child.pid}.`);
        child.kill('SIGKILL');
      }
    }, 10000);
    await new Promise((resolve) => {
      const local = child;
      if (!local) {
        clearTimeout(killTimeout);
        resolve();
        return;
      }
      local.once('exit', () => {
        clearTimeout(killTimeout);
        resolve();
      });
    });
  }

  spawnDevServer(reason);
  restarting = false;
}

async function watchdogTick() {
  if (!child || restarting || stopping) return;

  const signalReason = consumeRestartSignal();
  if (signalReason) {
    await restart(`requested-by-runtime: ${signalReason}`);
    return;
  }

  if ((Date.now() - lastSpawnAt) < startupGraceMs) return;

  const healthy = await isHealthy();
  if (healthy) {
    unhealthyCount = 0;
    return;
  }

  unhealthyCount += 1;
  log(`Health check failed (${unhealthyCount}/${unhealthyThreshold}) for ${healthUrl}.`);
  if (unhealthyCount >= unhealthyThreshold) {
    await restart(`health-check-failed x${unhealthyCount}`);
  }
}

function setupSignalHandlers() {
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    if (intervalHandle) clearInterval(intervalHandle);
    log(`Supervisor received ${signal}; shutting down.`);
    if (!child) {
      process.exit(0);
      return;
    }
    child.once('exit', () => process.exit(0));
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child) child.kill('SIGKILL');
      process.exit(0);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function main() {
  mkdirSync(stateDir, { recursive: true });
  setupSignalHandlers();
  spawnDevServer('initial');
  intervalHandle = setInterval(() => {
    void watchdogTick();
  }, Math.max(2000, checkIntervalMs));
  log(`Watchdog loop started. Monitoring ${healthUrl}.`);
}

main();
