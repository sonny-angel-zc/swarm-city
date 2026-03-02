import { NextRequest, NextResponse } from 'next/server';
import { addHumanMessage } from '@/core/orchestrator';
import { AgentRole } from '@/core/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ role: string }> },
) {
  try {
    const { role } = await params;
    const body = await request.json();
    const { taskId, message } = body as { taskId?: string; message?: string };

    if (!taskId || !message?.trim()) {
      return NextResponse.json(
        { code: 'AGENT_MESSAGE_REQUIRED_FIELDS', error: 'taskId and message are required' },
        { status: 400 },
      );
    }

    addHumanMessage(taskId, role as AgentRole, message.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/agents/message POST]', err);
    return NextResponse.json({ code: 'AGENT_MESSAGE_INTERNAL_ERROR', error: 'Internal server error' }, { status: 500 });
  }
}
