import { NextResponse } from 'next/server';
import { getAllAgentStatuses } from '@/core/agentRegistry';

export async function GET() {
  return NextResponse.json(getAllAgentStatuses());
}
