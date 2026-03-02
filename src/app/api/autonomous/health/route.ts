import { NextResponse } from 'next/server';
import { getAutonomousHealth, startAutonomousLoop } from '@/core/autonomousLoop';

export async function GET() {
  startAutonomousLoop();
  const health = await getAutonomousHealth({ skipServerProbe: true });
  const status = health.ok ? 200 : 503;
  return NextResponse.json(health, { status });
}
