import { NextRequest, NextResponse } from 'next/server';
import { getTask, subscribeToTask, SSEEvent } from '@/core/orchestrator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;

  if (!getTask(taskId)) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(event: SSEEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected
        }
      }

      const unsubscribe = subscribeToTask(taskId, send);

      // Close stream when client disconnects
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
