import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';

import { createSupervisor } from '../scripts/start-supervised.mjs';

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.killSignals = [];
  }

  kill(signal) {
    this.killSignals.push(signal);
    return true;
  }

  emitExit(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }
}

function createFakeTimers() {
  let nextTimeoutId = 1;
  let nextIntervalId = 1;
  const timeouts = new Map();
  const intervals = new Map();

  return {
    setTimeout(fn) {
      const id = nextTimeoutId++;
      timeouts.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(fn) {
      const id = nextIntervalId++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    runNextTimeout() {
      const next = timeouts.entries().next().value;
      if (!next) return false;
      const [id, fn] = next;
      timeouts.delete(id);
      fn();
      return true;
    },
    timeoutCount() {
      return timeouts.size;
    },
    intervalCount() {
      return intervals.size;
    },
  };
}

function createHarness(overrides = {}) {
  const timers = createFakeTimers();
  const spawned = [];
  const logs = [];

  const supervisor = createSupervisor({
    cwd: overrides.cwd,
    env: overrides.env,
    config: {
      restartDelayMs: 5,
      healthPollMs: 2000,
      healthTimeoutMs: 1000,
      unhealthyThreshold: 1,
      ...overrides.config,
    },
    spawn: () => {
      const proc = new FakeChild();
      spawned.push(proc);
      return proc;
    },
    fetch: overrides.fetch ?? (async () => ({ ok: false })),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    log: (line) => logs.push(line),
  });

  return { supervisor, timers, spawned, logs };
}

test('schedules only one restart for crash + rapid unhealthy failures', async () => {
  const { supervisor, timers, spawned } = createHarness();

  supervisor.start();
  assert.equal(spawned.length, 1);
  assert.equal(timers.intervalCount(), 1);

  spawned[0].emitExit(1, null);
  assert.equal(supervisor.getState().restartScheduled, true);
  assert.equal(supervisor.getState().restartCount, 1);
  assert.equal(timers.timeoutCount(), 1);

  await supervisor.watchdogTick();
  await supervisor.watchdogTick();
  assert.equal(supervisor.getState().restartCount, 1);
  assert.equal(timers.timeoutCount(), 1);

  assert.equal(timers.runNextTimeout(), true);
  assert.equal(spawned.length, 2);
  assert.equal(supervisor.getState().restartScheduled, false);
});

test('intentional restart signal does not trigger duplicate restart on expected exit', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'start-supervised-test-'));
  const runtimeDir = join(cwd, '.swarm-runtime');
  mkdirSync(runtimeDir, { recursive: true });

  const { supervisor, timers, spawned } = createHarness({ cwd });

  supervisor.start();
  assert.equal(spawned.length, 1);

  writeFileSync(join(runtimeDir, 'restart-dev-server.signal'), 'intentional test restart\n');
  await supervisor.watchdogTick();

  assert.equal(supervisor.getState().restartScheduled, true);
  assert.equal(supervisor.getState().restartCount, 1);
  assert.equal(timers.timeoutCount(), 1);
  assert.deepEqual(spawned[0].killSignals, ['SIGTERM']);

  spawned[0].emitExit(0, 'SIGTERM');
  assert.equal(supervisor.getState().restartCount, 1);
  assert.equal(timers.timeoutCount(), 1);

  assert.equal(timers.runNextTimeout(), true);
  assert.equal(spawned.length, 2);
});

test('does not spawn second dev server while current process has not exited', () => {
  const { supervisor, timers, spawned } = createHarness();

  supervisor.start();
  assert.equal(spawned.length, 1);

  supervisor.scheduleRestart('manual restart');
  assert.equal(supervisor.getState().restartCount, 1);
  assert.deepEqual(spawned[0].killSignals, ['SIGTERM']);

  assert.equal(timers.runNextTimeout(), true);
  assert.equal(spawned.length, 1);
  assert.equal(supervisor.getState().childAlive, true);
});
