export interface ProcessedTextAsset {
  normalizedText: string;
  wordCount: number;
  lineCount: number;
  containsEmailOrPhonePii: boolean;
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export function processKnowledgeTextAsset(rawText: string): ProcessedTextAsset {
  const normalizedText = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  const words = normalizedText ? normalizedText.split(/\s+/).filter(Boolean) : [];
  const lineCount = normalizedText ? normalizedText.split('\n').length : 0;

  return {
    normalizedText,
    wordCount: words.length,
    lineCount,
    containsEmailOrPhonePii: EMAIL_RE.test(normalizedText),
  };
}
