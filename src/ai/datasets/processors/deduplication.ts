import { sha256Hex } from '../../../security/sanitize';
import { processKnowledgeTextAsset } from './textProcessor';

export interface DeduplicationCandidate {
  id: string;
  content: string;
}

export async function deduplicateTextAssets<T extends DeduplicationCandidate>(
  assets: T[]
): Promise<{ unique: Array<T & { contentHash: string }>; duplicateIds: string[] }> {
  const seenHashes = new Set<string>();
  const unique: Array<T & { contentHash: string }> = [];
  const duplicateIds: string[] = [];

  for (const item of assets) {
    const { normalizedText } = processKnowledgeTextAsset(item.content);
    const hash = await sha256Hex(normalizedText);
    if (seenHashes.has(hash)) {
      duplicateIds.push(item.id);
      continue;
    }
    seenHashes.add(hash);
    unique.push({ ...item, contentHash: hash });
  }

  return { unique, duplicateIds };
}
