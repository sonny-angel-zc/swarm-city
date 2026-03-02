import { NextRequest, NextResponse } from 'next/server';
import { getAutonomousState, setAutonomousEnabled, startAutonomousLoop } from '@/core/autonomousLoop';

export async function GET(request: NextRequest) {
  startAutonomousLoop();
  const sinceRaw = request.nextUrl.searchParams.get('since');
  const since = sinceRaw ? Number(sinceRaw) : undefined;
  const safeSince = Number.isFinite(since) ? since : undefined;
  return NextResponse.json(getAutonomousState(safeSince));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled boolean is required' }, { status: 400 });
    }
    setAutonomousEnabled(body.enabled);
    return NextResponse.json(getAutonomousState());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
