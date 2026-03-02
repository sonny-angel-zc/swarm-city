import { NextResponse } from 'next/server';
import { getAutonomousState, startAutonomousLoop } from '@/core/autonomousLoop';

export async function GET() {
  startAutonomousLoop();
  const state = getAutonomousState();
  const now = Date.now();
  const lastTickAgeMs = state.lastTickAt ? now - state.lastTickAt : null;

  return NextResponse.json({
    ok: true,
    autonomous: {
      enabled: state.enabled,
      running: state.running,
      paused: state.paused,
      pauseReason: state.pauseReason,
      currentTask: state.currentTask,
      lastTickAt: state.lastTickAt,
      lastTickAgeMs,
      recentEvents: state.events.slice(-10),
    },
    timestamp: now,
  });
}
