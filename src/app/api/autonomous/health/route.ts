import { NextResponse } from 'next/server';
import { getAutonomousHealth, startAutonomousLoop } from '@/core/autonomousLoop';

export async function GET() {
  startAutonomousLoop();
  const loop = getAutonomousHealth();
  return NextResponse.json({
    ok: loop.ok,
    loop,
  });
}
