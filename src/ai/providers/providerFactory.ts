import type { AIProvider } from './AIProvider';
import { GeminiProvider } from './GeminiProvider';
import { MockProvider } from './MockProvider';

// Strictly in-memory ONLY. Never persisted to localStorage, sessionStorage, IndexedDB, or JSON backups.
let inMemoryGeminiApiKey = '';

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

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return 'Not set';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function createAIProvider(preference: 'auto' | 'gemini' | 'mock' = 'auto'): AIProvider {
  const gemini = new GeminiProvider(getSessionGeminiKey);
  const mock = new MockProvider();

  if (preference === 'mock') return mock;
  if (preference === 'gemini') return gemini;
  return gemini.isConfigured() ? gemini : mock;
}
