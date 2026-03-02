import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const DEFAULT_LIMITS = {
  tokensPerMin: Number(process.env.SWARM_TOKENS_PER_MIN ?? '50000'),
  requestsPerMin: Number(process.env.SWARM_REQUESTS_PER_MIN ?? '300'),
  contextWindow: Number(process.env.SWARM_CONTEXT_WINDOW ?? '200000'),
};

function hasCommand(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { timeout: 2500, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const codexAvailable = hasCommand(process.env.SWARM_CODEX_BIN ?? 'codex');
  const claudeAvailable = hasCommand(process.env.SWARM_CLAUDE_BIN ?? 'claude');

  return NextResponse.json({
    provider: codexAvailable ? 'openai' : claudeAvailable ? 'anthropic' : 'openai',
    plan: process.env.SWARM_PLAN ?? 'local-cli',
    model: codexAvailable ? 'gpt-5.3-codex' : 'claude-sonnet-4',
    codexAvailable,
    claudeAvailable,
    ...DEFAULT_LIMITS,
  });
}
