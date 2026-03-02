export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const adapter = await import('@/core/codexAdapter');
  const autonomousLoop = await import('@/core/autonomousLoop');
  adapter.applyCodexAgentIdFromConfig();
  adapter.warnIfCodexAgentMappingMissing();
  autonomousLoop.startAutonomousLoop();
}
