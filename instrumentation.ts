export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const adapter = await import('@/core/codexAdapter');
  adapter.applyCodexAgentIdFromConfig();
  adapter.warnIfCodexAgentMappingMissing();
}
