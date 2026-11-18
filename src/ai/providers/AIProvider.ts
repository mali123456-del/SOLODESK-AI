export type AIErrorCode =
  | 'missing_key'
  | 'unauthorized'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'offline'
  | 'invalid_response'
  | 'unknown';

export class AIProviderError extends Error {
  readonly code: AIErrorCode;

  constructor(code: AIErrorCode, message: string) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
  }
}

export interface AIGenerateRequest {
  systemInstruction?: string;
  prompt: string;
  context?: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export type AIProviderId = 'gemini' | 'openai_compatible' | 'ollama' | 'mock';

export interface AIGenerateResponse {
  text: string;
  model: string;
  providerId: AIProviderId;
  isOfflineDraft: boolean;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly label: string;
  readonly modelId: string;
  isConfigured(): boolean;
  generateText(request: AIGenerateRequest): Promise<AIGenerateResponse>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
