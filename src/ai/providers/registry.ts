export interface AIProviderCapabilitySpec {
  id: 'mock' | 'gemini';
  defaultModelId: string;
  label: string;
  requiresNetwork: boolean;
  requiresApiKey: boolean;
  supportsToolSuggestions: boolean;
  maxRecommendedContextChars: number;
  notes: string;
}

export const AI_PROVIDER_REGISTRY: Record<'mock' | 'gemini', AIProviderCapabilitySpec> = {
  mock: {
    id: 'mock',
    defaultModelId: 'local-offline-template-v1',
    label: 'Offline Deterministic Drafts',
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
};

export function getProviderCapability(id: 'mock' | 'gemini'): AIProviderCapabilitySpec {
  return AI_PROVIDER_REGISTRY[id];
}
