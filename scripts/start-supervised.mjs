#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

function ts(now = () => new Date()) {
  return now().toISOString();
}

function resolveConfig(env = process.env, cwd = process.cwd()) {
  const repoRoot = cwd;
  const runtimeDir = path.join(repoRoot, env.SWARM_RUNTIME_DIR ?? '.swarm-runtime');
  return {
    repoRoot,
    runtimeDir,
    restartSignalPath: path.join(runtimeDir, env.SWARM_DEV_RESTART_SIGNAL ?? 'restart-dev-server.signal'),
    healthUrl: env.SWARM_DEV_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health',
    healthPollMs: Number(env.SWARM_SUPERVISOR_HEALTH_POLL_MS ?? '5000'),
    healthTimeoutMs: Number(env.SWARM_SUPERVISOR_HEALTH_TIMEOUT_MS ?? '2500'),
    unhealthyThreshold: Number(env.SWARM_SUPERVISOR_UNHEALTHY_THRESHOLD ?? '3'),
    restartDelayMs: Number(env.SWARM_SUPERVISOR_RESTART_DELAY_MS ?? '600'),
  };
}

export function createSupervisor(options = {}) {
  const config = {
    ...resolveConfig(options.env, options.cwd),
    ...options.config,
  };

  const spawnFn = options.spawn ?? spawn;
  const fetchFn = options.fetch ?? fetch;
  const setTimeoutFn = options.setTimeout ?? setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? clearTimeout;
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  const now = options.now ?? (() => new Date());
  const logOutput = options.log ?? ((message) => process.stdout.write(`[supervisor ${ts(now)}] ${message}\n`));

  let child = null;
  let stopping = false;
  let unhealthyCount = 0;
  let restartCount = 0;
  let restartTimer = null;
  let watchdogInterval = null;
  const expectedExit = new WeakSet();

  function log(message) {
    logOutput(message);
  }

  function isChildAlive(candidate) {
    return Boolean(candidate) && candidate.exitCode == null && candidate.signalCode == null;
  }

  function ensureRuntimeDir() {
    mkdirSync(config.runtimeDir, { recursive: true });
  }

  function clearNextCache() {
    const nextDir = path.join(config.repoRoot, '.next');
    if (existsSync(nextDir)) {
      rmSync(nextDir, { recursive: true, force: true });
      log('cleared .next cache');
    }
  }

  function consumeRestartSignal() {
    if (!existsSync(config.restartSignalPath)) return null;
    try {
      const reason = readFileSync(config.restartSignalPath, 'utf8').trim();
      unlinkSync(config.restartSignalPath);
      return reason || 'restart signal detected';
    } catch {
      return 'restart signal detected';
    }
  }

  function terminateChild({ expected = false } = {}) {
    if (!isChildAlive(child)) return;
    if (expected) expectedExit.add(child);
    child.kill('SIGTERM');
  }

  function scheduleRestart(reason) {
    if (stopping) return;
    if (restartTimer) {
      log(`restart already scheduled; ignoring duplicate trigger: ${reason}`);
      return;
    }

    restartCount += 1;
    unhealthyCount = 0;
    log(`restarting dev server (#${restartCount}) due to: ${reason}`);
    terminateChild({ expected: true });
    restartTimer = setTimeoutFn(() => {
      restartTimer = null;
      if (stopping || isChildAlive(child)) {
        if (!stopping && isChildAlive(child)) {
          log('restart skipped because dev server is still running');
        }
        return;
      }
      spawnDevServer();
    }, Math.max(0, config.restartDelayMs));
  }

  function onChildExit(proc, code, signal) {
    if (child === proc) child = null;
    if (stopping) return;

    if (expectedExit.has(proc)) {
      expectedExit.delete(proc);
      log(`dev server exited as part of intentional restart (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
      return;
    }

    log(`dev server exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    scheduleRestart('process exit');
  }

  function spawnDevServer() {
    if (isChildAlive(child)) {
      log('spawn skipped because dev server is already running');
      return;
    }

    clearNextCache();
    ensureRuntimeDir();
    log('starting Next.js dev server');

    const proc = spawnFn('npm', ['run', 'dev'], {
      cwd: config.repoRoot,
      stdio: 'inherit',
      env: { ...process.env, ...(options.env ?? {}) },
    });
    child = proc;
    proc.on('exit', (code, signal) => {
      onChildExit(proc, code, signal);
    });
  }

  async function probeHealth() {
    const controller = new AbortController();
    const timeout = setTimeoutFn(() => controller.abort(), Math.max(1000, config.healthTimeoutMs));
    try {
      const res = await fetchFn(config.healthUrl, { method: 'GET', cache: 'no-store', signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeoutFn(timeout);
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
    log(`health check failed (${unhealthyCount}/${config.unhealthyThreshold})`);
    if (unhealthyCount >= Math.max(1, config.unhealthyThreshold)) {
      scheduleRestart('unhealthy health checks');
    }
  }

  function start() {
    spawnDevServer();
    watchdogInterval = setIntervalFn(() => {
      void watchdogTick();
    }, Math.max(2000, config.healthPollMs));
  }

  function stop() {
    stopping = true;
    if (watchdogInterval) clearIntervalFn(watchdogInterval);
    if (restartTimer) {
      clearTimeoutFn(restartTimer);
      restartTimer = null;
    }
    log('supervisor shutting down');
    terminateChild({ expected: true });
  }

  function getState() {
    return {
      stopping,
      unhealthyCount,
      restartCount,
      childAlive: isChildAlive(child),
      restartScheduled: Boolean(restartTimer),
    };
  }

  return {
    config,
    start,
    stop,
    watchdogTick,
    scheduleRestart,
    spawnDevServer,
    getState,
  };
}

function isCliEntrypoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function runCli() {
  const supervisor = createSupervisor();

  function shutdown() {
    supervisor.stop();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  supervisor.start();
}

if (isCliEntrypoint()) {
  runCli();
}

export { runCli };
