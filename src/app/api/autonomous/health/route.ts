import { NextResponse } from 'next/server';
import { getAutonomousState, startAutonomousLoop } from '@/core/autonomousLoop';

export async function GET() {
  startAutonomousLoop();
  const state = getAutonomousState();
  return NextResponse.json({
    ok: true,
    service: 'autonomous-loop',
    timestamp: new Date().toISOString(),
    enabled: state.enabled,
    running: state.running,
    paused: state.paused,
    lastTickAt: state.lastTickAt,
    currentTask: state.currentTask?.identifier ?? null,
  });
}
