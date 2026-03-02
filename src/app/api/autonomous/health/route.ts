import { NextResponse } from 'next/server';
import { getAutonomousHealth, startAutonomousLoop } from '@/core/autonomousLoop';

export async function GET() {
  startAutonomousLoop();
  return NextResponse.json(getAutonomousHealth(), { status: 200 });
}
