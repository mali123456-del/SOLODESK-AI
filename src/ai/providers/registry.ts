import type { AIProviderId } from './AIProvider';

export interface AIProviderCapabilitySpec {
  id: AIProviderId;
  defaultModelId: string;
  label: string;
  requiresNetwork: boolean;
  requiresApiKey: boolean;
  supportsToolSuggestions: boolean;
  maxRecommendedContextChars: number;
  notes: string;
}

export const AI_PROVIDER_REGISTRY: Record<AIProviderId, AIProviderCapabilitySpec> = {
  mock: {
    id: 'mock',
    defaultModelId: 'local-offline-template-v1',
    label: 'Offline Deterministic Drafts (Demo/Test Fallback)',
    requiresNetwork: false,
    requiresApiKey: false,
    supportsToolSuggestions: true,
    maxRecommendedContextChars: 12_000,
    notes: 'Runs 100% locally in browser memory with zero network transfer or external quota usage.',
  },
  gemini: {
    id: 'gemini',
    defaultModelId: 'gemini-4-hydrogen',
    label: 'Gemini BYOK Adapter',
    requiresNetwork: true,
    requiresApiKey: true,
    supportsToolSuggestions: true,
    maxRecommendedContextChars: 24_000,
    notes:
      'Optional external BYOK adapter. Requires explicit user consent per context transfer and eligible API account.',
  },
  openai_compatible: {
    id: 'openai_compatible',
    defaultModelId: 'gpt-4o-mini',
    label: 'OpenAI-Compatible BYOK Adapter',
    requiresNetwork: true,
    requiresApiKey: true,
    supportsToolSuggestions: true,
    maxRecommendedContextChars: 24_000,
    notes:
      'Optional OpenAI-compatible HTTP adapter (BYOK in-memory only). Subject to endpoint CORS & rate limits.',
  },
  ollama: {
    id: 'ollama',
    defaultModelId: 'llama3.2',
    label: 'Local Ollama Loopback Adapter',
    requiresNetwork: false,
    requiresApiKey: false,
    supportsToolSuggestions: true,
    maxRecommendedContextChars: 16_000,
    notes:
      'Optional loopback adapter (http://localhost:11434). Requires Ollama running locally with browser CORS allowed.',
  },
};

export function getProviderCapability(id: AIProviderId): AIProviderCapabilitySpec {
  return AI_PROVIDER_REGISTRY[id];
}
