import { NextResponse } from 'next/server';
import { getAutonomousHealth, getAutonomousState, startAutonomousLoop } from '@/core/autonomousLoop';

export async function GET() {
  startAutonomousLoop();
  const health = getAutonomousHealth();
  const state = getAutonomousState();

  return NextResponse.json(
    {
      ...health,
      loop: {
        lastEventId: state.events[state.events.length - 1]?.id ?? 0,
        seeded: state.seeded,
        cooldownUntil: state.cooldownUntil,
      },
    },
    { status: health.ok ? 200 : 503 },
  );
}
