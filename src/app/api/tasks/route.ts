import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/core/orchestrator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title } = body as { title?: string };

    if (!title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const task = createTask(title.trim());
    return NextResponse.json({ taskId: task.id, task });
  } catch (err) {
    console.error('[api/tasks POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
