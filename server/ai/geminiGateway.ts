import { GoogleGenAI } from '@google/genai';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { scrubSensitiveData, serverMetrics } from '../monitoring/telemetry';

export const SERVER_GEMINI_MODEL = 'gemini-4-hydrogen';

export interface ServerAiGenerateInput {
  prompt: string;
  context?: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  model?: string;
  agentId?: string;
  sessionGeminiKey?: string;
  workspaceId?: string;
  userId?: string;
  timeoutMs?: number;
}

export interface ServerAiGenerateOutput {
  text: string;
  model: string;
  latencyMs: number;
  estimatedCostUsd: number;
}

export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function generateWithServerGemini(
  db: DatabaseSync,
  input: ServerAiGenerateInput
): Promise<ServerAiGenerateOutput> {
  const apiKey = (input.sessionGeminiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new GatewayError(
      400,
      'missing_key',
      'No GEMINI_API_KEY configured on server and no session X-Gemini-Key provided. Use Offline Draft mode.'
    );
  }

  const model = input.model || SERVER_GEMINI_MODEL;
  const startedAt = performance.now();
  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 25_000, 1000), 45_000);
  const fullPrompt = input.context
    ? `Workspace Context:\n${input.context}\n\nUser Request:\n${input.prompt}`
    : input.prompt;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    // Respect Gemini 4 model guidance: do NOT pass deprecated sampling params (temperature, topP, topK).
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          systemInstruction: input.systemInstruction,
          maxOutputTokens: input.maxOutputTokens ?? 1200,
        },
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new GatewayError(504, 'timeout', 'Server Gemini request timed out.'));
        });
      }),
    ]);

    const text = response?.text?.trim();
    if (!text) {
      throw new GatewayError(502, 'invalid_response', 'Gemini returned an empty completion.');
    }

    const latencyMs = Number((performance.now() - startedAt).toFixed(2));
    const estimatedCostUsd = Number(
      (((fullPrompt.length + text.length) / 4000) * 0.0005).toFixed(6)
    );

    serverMetrics.aiCalls += 1;
    recordAiUsage(db, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      agentId: input.agentId ?? 'copilot',
      model,
      promptChars: fullPrompt.length,
      completionChars: text.length,
      estimatedCostUsd,
      latencyMs,
      status: 'ok',
    });

    return { text, model, latencyMs, estimatedCostUsd };
  } catch (err) {
    if (err instanceof GatewayError) {
      recordAiUsage(db, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        agentId: input.agentId ?? 'copilot',
        model,
        promptChars: fullPrompt.length,
        completionChars: 0,
        estimatedCostUsd: 0,
        latencyMs: Number((performance.now() - startedAt).toFixed(2)),
        status: err.code,
      });
      throw err;
    }

    const rawMsg = err instanceof Error ? err.message : String(err);
    const msg = String(scrubSensitiveData(rawMsg));
    const lower = rawMsg.toLowerCase();
    let mapped = new GatewayError(502, 'provider_error', `Gemini API failure: ${msg}`);
    if (lower.includes('401') || lower.includes('403') || lower.includes('api key')) {
      mapped = new GatewayError(401, 'unauthorized', 'Gemini rejected the configured API key.');
    } else if (lower.includes('429') || lower.includes('quota') || lower.includes('rate')) {
      mapped = new GatewayError(429, 'rate_limited', 'Gemini rate limit or free-tier quota exceeded.');
    }

    recordAiUsage(db, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      agentId: input.agentId ?? 'copilot',
      model,
      promptChars: fullPrompt.length,
      completionChars: 0,
      estimatedCostUsd: 0,
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      status: mapped.code,
    });
    throw mapped;
  } finally {
    clearTimeout(timer);
  }
}

function recordAiUsage(
  db: DatabaseSync,
  entry: {
    workspaceId?: string;
    userId?: string;
    agentId: string;
    model: string;
    promptChars: number;
    completionChars: number;
    estimatedCostUsd: number;
    latencyMs: number;
    status: string;
  }
): void {
  if (!entry.workspaceId) return;
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ai_usage_records (id, workspace_id, user_id, agent_id, model, prompt_chars, completion_chars, estimated_cost_usd, latency_ms, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `aiu_${crypto.randomUUID()}`,
      entry.workspaceId,
      entry.userId ?? '',
      entry.agentId,
      entry.model,
      entry.promptChars,
      entry.completionChars,
      entry.estimatedCostUsd,
      entry.latencyMs,
      entry.status,
      now
    );

    const approxTokens = Math.ceil((entry.promptChars + entry.completionChars) / 4);
    db.prepare(
      'UPDATE subscriptions SET ai_tokens_used_month = ai_tokens_used_month + ?, updated_at = ? WHERE workspace_id = ?'
    ).run(approxTokens, now, entry.workspaceId);
  } catch {
    // Non-fatal metering error
  }
}
