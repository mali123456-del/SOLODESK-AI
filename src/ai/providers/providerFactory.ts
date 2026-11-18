import type { AIProvider, AIProviderId } from './AIProvider';
import { GeminiProvider } from './GeminiProvider';
import { MockProvider } from './MockProvider';
import { OllamaProvider, type OllamaConfig } from './OllamaProvider';
import {
  OpenAICompatibleProvider,
  type OpenAICompatibleConfig,
} from './OpenAICompatibleProvider';

// Strictly in-memory ONLY. Never persisted to localStorage, sessionStorage, IndexedDB, or JSON backups.
let inMemoryGeminiApiKey = '';
let inMemoryOpenAIConfig: OpenAICompatibleConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelId: 'gpt-4o-mini',
};
let inMemoryOllamaConfig: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  modelId: 'llama3.2',
  enabled: false,
};

export function setSessionGeminiKey(key: string): void {
  inMemoryGeminiApiKey = key.trim();
}

export function getSessionGeminiKey(): string {
  return inMemoryGeminiApiKey;
}

export function hasSessionGeminiKey(): boolean {
  return inMemoryGeminiApiKey.length > 0;
}

export function clearSessionGeminiKey(): void {
  inMemoryGeminiApiKey = '';
}

export function setSessionOpenAIConfig(patch: Partial<OpenAICompatibleConfig>): void {
  inMemoryOpenAIConfig = {
    baseUrl: (patch.baseUrl ?? inMemoryOpenAIConfig.baseUrl).trim(),
    apiKey: (patch.apiKey ?? inMemoryOpenAIConfig.apiKey).trim(),
    modelId: (patch.modelId ?? inMemoryOpenAIConfig.modelId).trim() || 'gpt-4o-mini',
  };
}

export function getSessionOpenAIConfig(): OpenAICompatibleConfig {
  return { ...inMemoryOpenAIConfig };
}

export function clearSessionOpenAIConfig(): void {
  inMemoryOpenAIConfig = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    modelId: 'gpt-4o-mini',
  };
}

export function setSessionOllamaConfig(patch: Partial<OllamaConfig>): void {
  inMemoryOllamaConfig = {
    baseUrl: (patch.baseUrl ?? inMemoryOllamaConfig.baseUrl).trim() || 'http://localhost:11434',
    modelId: (patch.modelId ?? inMemoryOllamaConfig.modelId).trim() || 'llama3.2',
    enabled: patch.enabled ?? inMemoryOllamaConfig.enabled,
  };
}

export function getSessionOllamaConfig(): OllamaConfig {
  return { ...inMemoryOllamaConfig };
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return 'Not set';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function createAIProvider(preference: 'auto' | AIProviderId = 'auto'): AIProvider {
  const gemini = new GeminiProvider(getSessionGeminiKey);
  const openai = new OpenAICompatibleProvider(getSessionOpenAIConfig);
  const ollama = new OllamaProvider(getSessionOllamaConfig);
  const mock = new MockProvider();

  if (preference === 'mock') return mock;
  if (preference === 'gemini') return gemini;
  if (preference === 'openai_compatible') return openai;
  if (preference === 'ollama') return ollama;

  if (gemini.isConfigured()) return gemini;
  if (openai.isConfigured()) return openai;
  if (ollama.isConfigured()) return ollama;
  return mock;
}
