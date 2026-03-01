import {
  AgentRole,
  ModelKind,
  ModelProvider,
  ProviderSpend,
  ModelSpend,
  TelemetryEvent,
  TelemetryState,
  TransactionType,
} from './types';

const INPUT_COST_PER_1K: Record<string, number> = {
  'openai/gpt-4o-mini': 0.00015,
  'openai/o4-mini': 0.0011,
  'anthropic/claude-3-5-sonnet': 0.003,
  'google/gemini-2.0-flash': 0.00035,
};

const OUTPUT_COST_PER_1K: Record<string, number> = {
  'openai/gpt-4o-mini': 0.0006,
  'openai/o4-mini': 0.0044,
  'anthropic/claude-3-5-sonnet': 0.015,
  'google/gemini-2.0-flash': 0.00105,
};

const MODEL_ROTATION: Record<AgentRole, { provider: ModelProvider; model: string; kind: ModelKind }[]> = {
  pm: [
    { provider: 'openai', model: 'openai/o4-mini', kind: 'reasoning' },
    { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet', kind: 'reasoning' },
  ],
  engineer: [
    { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet', kind: 'analysis' },
    { provider: 'openai', model: 'openai/o4-mini', kind: 'analysis' },
  ],
  designer: [
    { provider: 'google', model: 'google/gemini-2.0-flash', kind: 'analysis' },
    { provider: 'openai', model: 'openai/gpt-4o-mini', kind: 'analysis' },
  ],
  qa: [
    { provider: 'openai', model: 'openai/gpt-4o-mini', kind: 'review' },
    { provider: 'google', model: 'google/gemini-2.0-flash', kind: 'review' },
  ],
  devils_advocate: [
    { provider: 'openai', model: 'openai/o4-mini', kind: 'reasoning' },
    { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet', kind: 'reasoning' },
  ],
  reviewer: [
    { provider: 'openai', model: 'openai/gpt-4o-mini', kind: 'review' },
    { provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet', kind: 'review' },
  ],
  researcher: [
    { provider: 'google', model: 'google/gemini-2.0-flash', kind: 'analysis' },
    { provider: 'openai', model: 'openai/gpt-4o-mini', kind: 'analysis' },
  ],
};

const PROVIDERS: ModelProvider[] = ['openai', 'anthropic', 'google'];

function emptyProviderSpend(provider: ModelProvider): ProviderSpend {
  return { provider, tokens: 0, costUsd: 0, events: 0 };
}

export function createInitialTelemetryState(): TelemetryState {
  return {
    events: [],
    providerSpend: {
      openai: emptyProviderSpend('openai'),
      anthropic: emptyProviderSpend('anthropic'),
      google: emptyProviderSpend('google'),
    },
    modelSpend: {},
    burnRatePerMinUsd: 0,
    totalCostUsd: 0,
  };
}

export function pickModelForRole(role: AgentRole, sequence: number) {
  const rotation = MODEL_ROTATION[role];
  if (!rotation || rotation.length === 0) {
    return { provider: 'openai' as const, model: 'openai/gpt-4o-mini', kind: 'analysis' as const };
  }
  return rotation[sequence % rotation.length];
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const inRate = INPUT_COST_PER_1K[model] ?? 0.001;
  const outRate = OUTPUT_COST_PER_1K[model] ?? 0.004;
  const inputCost = (Math.max(0, inputTokens) / 1000) * inRate;
  const outputCost = (Math.max(0, outputTokens) / 1000) * outRate;
  return inputCost + outputCost;
}

export function buildTelemetryEvent(args: {
  id: string;
  role: AgentRole;
  provider: ModelProvider;
  model: string;
  kind: ModelKind;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  transactionType: TransactionType;
}): TelemetryEvent {
  return {
    ...args,
    estimatedCostUsd: estimateCostUsd(args.model, args.inputTokens, args.outputTokens),
  };
}

export function updateTelemetryState(prev: TelemetryState, event: TelemetryEvent): TelemetryState {
  const providerSpend = { ...prev.providerSpend };
  providerSpend[event.provider] = {
    ...providerSpend[event.provider],
    tokens: providerSpend[event.provider].tokens + event.inputTokens + event.outputTokens,
    costUsd: providerSpend[event.provider].costUsd + event.estimatedCostUsd,
    events: providerSpend[event.provider].events + 1,
  };

  const currentModel = prev.modelSpend[event.model] ?? {
    model: event.model,
    provider: event.provider,
    tokens: 0,
    costUsd: 0,
    events: 0,
  };

  const modelSpend: Record<string, ModelSpend> = {
    ...prev.modelSpend,
    [event.model]: {
      ...currentModel,
      tokens: currentModel.tokens + event.inputTokens + event.outputTokens,
      costUsd: currentModel.costUsd + event.estimatedCostUsd,
      events: currentModel.events + 1,
    },
  };

  const events = [...prev.events.slice(-400), event];
  const now = event.timestamp;
  const recent = events.filter(e => now - e.timestamp <= 60_000);
  const recentCost = recent.reduce((sum, e) => sum + e.estimatedCostUsd, 0);

  let totalCostUsd = 0;
  for (const provider of PROVIDERS) {
    totalCostUsd += providerSpend[provider].costUsd;
  }

  return {
    events,
    providerSpend,
    modelSpend,
    burnRatePerMinUsd: recentCost,
    totalCostUsd,
  };
}
