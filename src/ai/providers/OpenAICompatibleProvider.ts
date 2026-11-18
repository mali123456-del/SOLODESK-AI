import {
  AIProviderError,
  type AIGenerateRequest,
  type AIGenerateResponse,
  type AIProvider,
} from './AIProvider';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id = 'openai_compatible' as const;
  readonly label = 'OpenAI-Compatible API (BYOK)';
  private readonly getConfig: () => OpenAICompatibleConfig;

  constructor(getConfig: () => OpenAICompatibleConfig) {
    this.getConfig = getConfig;
  }

  get modelId(): string {
    return this.getConfig().modelId || 'gpt-4o-mini';
  }

  isConfigured(): boolean {
    const cfg = this.getConfig();
    return cfg.apiKey.trim().length > 0 && cfg.baseUrl.trim().length > 0;
  }

  async generateText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const cfg = this.getConfig();
    if (!cfg.apiKey.trim()) {
      throw new AIProviderError(
        'missing_key',
        'No OpenAI-compatible API key is active in memory.'
      );
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new AIProviderError('offline', 'Browser is offline.');
    }

    const endpoint = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 25_000);

    try {
      const messages: Array<{ role: string; content: string }> = [];
      if (request.systemInstruction) {
        messages.push({ role: 'system', content: request.systemInstruction });
      }
      const userContent = request.context
        ? `Workspace Context:\n${request.context}\n\nUser Request:\n${request.prompt}`
        : request.prompt;
      messages.push({ role: 'user', content: userContent });

      const resp = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: this.modelId,
          messages,
          temperature: request.temperature ?? 0.4,
          max_tokens: request.maxOutputTokens ?? 1200,
        }),
      });

      if (resp.status === 401 || resp.status === 403) {
        throw new AIProviderError('unauthorized', 'OpenAI-compatible endpoint rejected credentials.');
      }
      if (resp.status === 429) {
        throw new AIProviderError('rate_limited', 'Rate limit reached on OpenAI-compatible endpoint.');
      }
      if (!resp.ok) {
        throw new AIProviderError('unknown', `Provider returned HTTP ${resp.status}.`);
      }

      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new AIProviderError('invalid_response', 'Provider returned empty completion.');
      }

      return {
        text,
        model: this.modelId,
        providerId: 'openai_compatible',
        isOfflineDraft: false,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AIProviderError('timeout', 'OpenAI-compatible request timed out.');
      }
      throw new AIProviderError(
        'network',
        err instanceof Error ? err.message : 'Network error calling OpenAI-compatible API.'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.generateText({
        prompt: 'Reply with OK.',
        maxOutputTokens: 12,
        temperature: 0,
        timeoutMs: 10_000,
      });
      return { ok: true, message: `Connected to ${res.model}.` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Connection failed.' };
    }
  }
}
