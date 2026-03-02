import assert from 'node:assert/strict';
import test from 'node:test';

const originalEnv = {
  NEXT_RUNTIME: process.env.NEXT_RUNTIME,
  SWARM_AUTONOMOUS_DEFAULT_ON: process.env.SWARM_AUTONOMOUS_DEFAULT_ON,
  SWARM_CODEX_AGENT_MAP: process.env.SWARM_CODEX_AGENT_MAP,
  SWARM_CODEX_AGENT_ID: process.env.SWARM_CODEX_AGENT_ID,
  OPENCLAW_CODEX_AGENT_ID: process.env.OPENCLAW_CODEX_AGENT_ID,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

function clearStartupGlobals() {
  const runtime = globalThis.__swarmAutonomousRuntime;
  if (runtime?.timer) {
    clearInterval(runtime.timer);
  }
  delete globalThis.__swarmAutonomousRuntime;
  delete globalThis.__swarmCodexAdapterWarned;
}

function countBootEvents(events) {
  return events.filter((event) => event.message === 'Autonomous loop booted.').length;
}

test('register() boots autonomous loop on server startup exactly once across re-register/hot reload', async () => {
  clearStartupGlobals();
  process.env.NEXT_RUNTIME = 'nodejs';
  process.env.SWARM_AUTONOMOUS_DEFAULT_ON = 'false';
  process.env.SWARM_CODEX_AGENT_MAP = '{"default":"agent-test"}';

  const instrumentation = await import('../instrumentation.ts');

  assert.equal(countBootEvents(globalThis.__swarmAutonomousRuntime?.state?.events ?? []), 0);

  await instrumentation.register();
  assert.equal(countBootEvents(globalThis.__swarmAutonomousRuntime?.state?.events ?? []), 1);
  const runtimeRef = globalThis.__swarmAutonomousRuntime;
  assert.equal(runtimeRef?.started, true);

  await instrumentation.register();
  assert.equal(countBootEvents(globalThis.__swarmAutonomousRuntime?.state?.events ?? []), 1);
  assert.equal(globalThis.__swarmAutonomousRuntime, runtimeRef);

  const hotReloadedInstrumentation = await import(`../instrumentation.ts?reload=${Date.now()}`);
  await hotReloadedInstrumentation.register();
  assert.equal(countBootEvents(globalThis.__swarmAutonomousRuntime?.state?.events ?? []), 1);
  assert.equal(globalThis.__swarmAutonomousRuntime, runtimeRef);
});

test.after(() => {
  clearStartupGlobals();
  restoreEnv();
});
