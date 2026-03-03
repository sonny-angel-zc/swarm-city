import { NextRequest, NextResponse } from 'next/server';

type OpenAICostResult = {
  amount?: {
    value?: number;
  };
};

type OpenAIUsageResult = {
  input_tokens?: number;
  output_tokens?: number;
  num_model_requests?: number;
};

function toFinite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumCost(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return 0;

  let total = 0;
  for (const bucket of data) {
    if (!bucket || typeof bucket !== 'object') continue;
    const bucketObj = bucket as { amount?: { value?: number }; results?: OpenAICostResult[] };
    if (bucketObj.amount) total += toFinite(bucketObj.amount.value);
    if (Array.isArray(bucketObj.results)) {
      for (const result of bucketObj.results) {
        total += toFinite(result?.amount?.value);
      }
    }
  }
  return total;
}

function sumUsage(payload: unknown): { inputTokens: number; outputTokens: number; requests: number } {
  if (!payload || typeof payload !== 'object') {
    return { inputTokens: 0, outputTokens: 0, requests: 0 };
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return { inputTokens: 0, outputTokens: 0, requests: 0 };
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let requests = 0;
  for (const bucket of data) {
    if (!bucket || typeof bucket !== 'object') continue;
    const bucketObj = bucket as {
      input_tokens?: number;
      output_tokens?: number;
      num_model_requests?: number;
      results?: OpenAIUsageResult[];
    };
    inputTokens += toFinite(bucketObj.input_tokens);
    outputTokens += toFinite(bucketObj.output_tokens);
    requests += toFinite(bucketObj.num_model_requests);
    if (Array.isArray(bucketObj.results)) {
      for (const result of bucketObj.results) {
        inputTokens += toFinite(result?.input_tokens);
        outputTokens += toFinite(result?.output_tokens);
        requests += toFinite(result?.num_model_requests);
      }
    }
  }
  return { inputTokens, outputTokens, requests };
}

async function fetchOpenAIJson(url: string, apiKey: string): Promise<unknown> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const apiMessage =
      json && typeof json === 'object'
        ? (json as { error?: { message?: string } }).error?.message
        : undefined;
    const message =
      (typeof apiMessage === 'string' && apiMessage.trim().length > 0
        ? apiMessage
        : text.trim().length > 0
          ? text
          : `OpenAI API request failed (${res.status})`);
    throw new Error(message);
  }

  return json;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return NextResponse.json({
      available: false,
      reason: 'missing_openai_key',
      message: 'Set OPENAI_ADMIN_KEY (preferred) or OPENAI_API_KEY to enable usage sync.',
    });
  }

  const windowRaw = Number(request.nextUrl.searchParams.get('windowMin') ?? '15');
  const windowMin = Math.min(120, Math.max(1, Number.isFinite(windowRaw) ? windowRaw : 15));
  const endTimeSec = Math.floor(Date.now() / 1000);
  const startTimeSec = endTimeSec - windowMin * 60;

  const usageUrl =
    `https://api.openai.com/v1/organization/usage/completions?start_time=${startTimeSec}&end_time=${endTimeSec}&bucket_width=1m`;
  const costsUrl =
    `https://api.openai.com/v1/organization/costs?start_time=${startTimeSec}&end_time=${endTimeSec}&bucket_width=1m`;

  try {
    const [usagePayload, costsPayload] = await Promise.all([
      fetchOpenAIJson(usageUrl, apiKey),
      fetchOpenAIJson(costsUrl, apiKey),
    ]);

    const usage = sumUsage(usagePayload);
    const totalCostUsd = sumCost(costsPayload);
    const totalTokens = usage.inputTokens + usage.outputTokens;

    return NextResponse.json({
      available: true,
      source: 'openai-organization',
      windowMinutes: windowMin,
      startTimeSec,
      endTimeSec,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens,
      requests: usage.requests,
      totalCostUsd,
      burnRateUsdPerMin: windowMin > 0 ? totalCostUsd / windowMin : 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      available: false,
      reason: 'openai_usage_fetch_failed',
      message,
      windowMinutes: windowMin,
      startTimeSec,
      endTimeSec,
    });
  }
}
