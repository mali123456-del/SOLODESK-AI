import { GoogleGenAI } from '@google/genai';
import {
  AIProviderError,
  type AIGenerateRequest,
  type AIGenerateResponse,
  type AIProvider,
} from './AIProvider';

export const GEMINI_FREE_MODEL = 'gemini-4-hydrogen';

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly label = 'Gemini 4 Hydrogen (BYOK)';
  readonly modelId = GEMINI_FREE_MODEL;
  private readonly getApiKey: () => string;

  constructor(getApiKey: () => string) {
    this.getApiKey = getApiKey;
  }

  isConfigured(): boolean {
    return this.getApiKey().trim().length > 0;
  }

  async generateText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const apiKey = this.getApiKey().trim();
    if (!apiKey) {
      throw new AIProviderError(
        'missing_key',
        'No Gemini API key is active in memory. Add your key in AI Configuration or use Offline Draft mode.'
      );
    }

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
      const ai = new GoogleGenAI({ apiKey });
      const fullPrompt = request.context
        ? `Workspace Context:\n${request.context}\n\nUser Request:\n${request.prompt}`
        : request.prompt;

      const response = await Promise.race([
        ai.models.generateContent({
          model: GEMINI_FREE_MODEL,
          contents: fullPrompt,
          config: {
            systemInstruction: request.systemInstruction,
            temperature: request.temperature ?? 0.4,
            maxOutputTokens: request.maxOutputTokens ?? 1200,
          },
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new AIProviderError('timeout', 'Gemini request timed out. Please retry.'));
          });
        }),
      ]);

      const text = response?.text?.trim();
      if (!text) {
        throw new AIProviderError(
          'invalid_response',
          'Gemini returned an empty response. Try rephrasing your prompt.'
        );
      }

      return {
        text,
        model: GEMINI_FREE_MODEL,
        providerId: 'gemini',
        isOfflineDraft: false,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (lower.includes('401') || lower.includes('403') || lower.includes('api key')) {
        throw new AIProviderError(
          'unauthorized',
          'Gemini rejected the API key. Check your key permissions and quota.'
        );
      }
      if (lower.includes('429') || lower.includes('quota') || lower.includes('rate')) {
        throw new AIProviderError(
          'rate_limited',
          'Free-tier rate limit reached for Gemini 4 Hydrogen. Wait a moment before retrying.'
        );
      }
      if (lower.includes('network') || lower.includes('fetch')) {
        throw new AIProviderError('network', 'Network error communicating with Gemini API.');
      }
      throw new AIProviderError('unknown', `Gemini error: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.generateText({
        prompt: 'Reply with OK.',
        maxOutputTokens: 16,
        temperature: 0,
        timeoutMs: 12_000,
      });
      return { ok: true, message: `Connected to ${res.model}.` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed.',
      };
    }
  }
}
