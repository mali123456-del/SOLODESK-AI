import {
  AIProviderError,
  type AIGenerateRequest,
  type AIGenerateResponse,
  type AIProvider,
} from './AIProvider';
import { AI_PROVIDER_REGISTRY } from './registry';

export const GEMINI_FREE_MODEL = AI_PROVIDER_REGISTRY.gemini.defaultModelId;

/**
 * Frontend Gemini adapter that routes requests exclusively to `/api/v1/ai/generate`.
 * `@google/genai` is executed strictly on the server so API keys and client SDKs
 * are never bundled into browser code or passed deprecated sampling parameters.
 */
export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly label = 'Gemini 4 Hydrogen (Server Gateway)';
  readonly modelId: string;
  private readonly getApiKey: () => string;

  constructor(getApiKey: () => string, modelId = GEMINI_FREE_MODEL) {
    this.getApiKey = getApiKey;
    this.modelId = modelId;
  }

  isConfigured(): boolean {
    return this.getApiKey().trim().length > 0;
  }

  async generateText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const apiKey = this.getApiKey().trim();

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new AIProviderError(
        'offline',
        'Your browser is offline. Gemini 4 Hydrogen requires an internet connection.'
      );
    }

    const timeoutMs = request.timeoutMs ?? 25_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-Gemini-Key'] = apiKey;
      }

      const response = await fetch('/api/v1/ai/generate', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          provider: 'gemini',
          model: this.modelId,
          prompt: request.prompt,
          context: request.context,
          systemInstruction: request.systemInstruction,
          maxOutputTokens: request.maxOutputTokens ?? 1200,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        text?: string;
        model?: string;
        error?: { code?: string; message?: string };
      };

      if (!response.ok) {
        const errCode = payload.error?.code;
        const msg = payload.error?.message || `Server AI gateway returned HTTP ${response.status}.`;
        if (response.status === 401 || response.status === 403 || errCode === 'unauthorized') {
          throw new AIProviderError('unauthorized', msg);
        }
        if (errCode === 'missing_key' || response.status === 400) {
          throw new AIProviderError('missing_key', msg);
        }
        if (response.status === 429 || errCode === 'rate_limited') {
          throw new AIProviderError('rate_limited', msg);
        }
        throw new AIProviderError('unknown', msg);
      }

      const text = payload.text?.trim();
      if (!text) {
        throw new AIProviderError(
          'invalid_response',
          'Gemini gateway returned an empty response. Try rephrasing your prompt.'
        );
      }

      return {
        text,
        model: payload.model || this.modelId,
        providerId: 'gemini',
        isOfflineDraft: false,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AIProviderError('timeout', 'Gemini gateway request timed out. Please retry.');
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
        throw new AIProviderError('network', 'Network error communicating with /api/v1/ai/generate.');
      }
      throw new AIProviderError('unknown', `Gemini gateway error: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.generateText({
        prompt: 'Reply with OK.',
        maxOutputTokens: 16,
        timeoutMs: 12_000,
      });
      return { ok: true, message: `Connected to ${res.model} via server gateway.` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed.',
      };
    }
  }
}
