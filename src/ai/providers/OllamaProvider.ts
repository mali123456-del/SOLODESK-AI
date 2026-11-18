import {
  AIProviderError,
  type AIGenerateRequest,
  type AIGenerateResponse,
  type AIProvider,
} from './AIProvider';

export interface OllamaConfig {
  baseUrl: string;
  modelId: string;
  enabled: boolean;
}

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const;
  readonly label = 'Local Ollama (Optional Loopback)';
  private readonly getConfig: () => OllamaConfig;

  constructor(getConfig: () => OllamaConfig) {
    this.getConfig = getConfig;
  }

  get modelId(): string {
    return this.getConfig().modelId || 'llama3.2';
  }

  isConfigured(): boolean {
    const cfg = this.getConfig();
    return cfg.enabled && cfg.baseUrl.trim().length > 0;
  }

  async generateText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const cfg = this.getConfig();
    if (!cfg.enabled) {
      throw new AIProviderError('missing_key', 'Local Ollama adapter is not enabled.');
    }

    const endpoint = `${cfg.baseUrl.replace(/\/+$/, '')}/api/generate`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 25_000);

    try {
      const prompt = [
        request.systemInstruction ? `System: ${request.systemInstruction}` : '',
        request.context ? `Context:\n${request.context}` : '',
        `Request:\n${request.prompt}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const resp = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelId,
          prompt,
          stream: false,
          options: {
            temperature: request.temperature ?? 0.4,
          },
        }),
      });

      if (!resp.ok) {
        throw new AIProviderError('unknown', `Ollama returned HTTP ${resp.status}.`);
      }

      const data = (await resp.json()) as { response?: string };
      const text = data.response?.trim();
      if (!text) {
        throw new AIProviderError('invalid_response', 'Ollama returned empty text.');
      }

      return {
        text,
        model: this.modelId,
        providerId: 'ollama',
        isOfflineDraft: true,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AIProviderError('timeout', 'Local Ollama request timed out.');
      }
      throw new AIProviderError(
        'network',
        'Could not reach local Ollama server (verify Ollama is running on localhost:11434 with OLLAMA_ORIGINS allowed).'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const cfg = this.getConfig();
    try {
      const resp = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/api/tags`);
      if (!resp.ok) return { ok: false, message: `Ollama HTTP ${resp.status}` };
      return { ok: true, message: `Reachable at ${cfg.baseUrl} (model: ${this.modelId}).` };
    } catch {
      return {
        ok: false,
        message: 'Local Ollama not reachable on loopback (start Ollama with OLLAMA_ORIGINS enabled if desired).',
      };
    }
  }
}
