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
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const defaultProvider: 'anthropic' | 'openai' =
      (process.env.SWARM_DEFAULT_PROVIDER ?? 'anthropic').toLowerCase() === 'openai'
        ? 'openai'
        : 'anthropic';
    const resolvedProvider = provider ?? defaultProvider;
    if (resolvedProvider !== 'anthropic' && resolvedProvider !== 'openai') {
      return NextResponse.json({ error: 'unsupported provider' }, { status: 400 });
    }

    const resolvedModel =
      model?.trim() ||
      (resolvedProvider === 'openai'
        ? process.env.SWARM_OPENAI_MODEL ?? 'gpt-5.3-codex'
        : process.env.SWARM_ANTHROPIC_MODEL ?? 'sonnet');

    const task = createTask(title.trim(), {
      provider: resolvedProvider,
      model: resolvedModel,
    });
    return NextResponse.json({ taskId: task.id, task });
  } catch (err) {
    console.error('[api/tasks POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
