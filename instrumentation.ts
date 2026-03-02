export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const mod = await import('@/core/autonomousLoop');
  mod.startAutonomousLoop();
}
