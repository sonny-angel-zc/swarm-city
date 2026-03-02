import { NextResponse } from 'next/server';
import { seedAutonomousBacklog, startAutonomousLoop } from '@/core/autonomousLoop';

export async function POST() {
  try {
    startAutonomousLoop();
    const result = await seedAutonomousBacklog();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ code: 'AUTONOMOUS_SEED_FAILED', error: String(err) }, { status: 500 });
  }
}
