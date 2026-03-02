import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/core/orchestrator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, provider, model } = body as {
      title?: string;
      provider?: 'anthropic' | 'openai';
      model?: string;
    };

    if (!title?.trim()) {
      return NextResponse.json({ code: 'TASK_TITLE_REQUIRED', error: 'title is required' }, { status: 400 });
    }

    const resolvedProvider = provider ?? 'openai';
    if (resolvedProvider !== 'anthropic' && resolvedProvider !== 'openai') {
      return NextResponse.json({ code: 'TASK_PROVIDER_UNSUPPORTED', error: 'unsupported provider' }, { status: 400 });
    }

    const resolvedModel =
      model?.trim() ||
      (resolvedProvider === 'openai' ? 'gpt-5.3-codex' : 'claude-sonnet-4');

    const task = createTask(title.trim(), {
      provider: resolvedProvider,
      model: resolvedModel,
    });
    return NextResponse.json({ taskId: task.id, task });
  } catch (err) {
    console.error('[api/tasks POST]', err);
    return NextResponse.json({ code: 'TASKS_INTERNAL_ERROR', error: 'Internal server error' }, { status: 500 });
  }
}
