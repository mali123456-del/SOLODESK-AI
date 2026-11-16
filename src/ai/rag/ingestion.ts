export const MAX_KNOWLEDGE_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export interface IngestedDocumentInput {
  title: string;
  sourceType: 'note' | 'markdown' | 'text' | 'json';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  tags: string[];
}

export function normalizeDocumentContent(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}

export async function validateAndReadKnowledgeFile(file: File): Promise<IngestedDocumentInput> {
  if (file.size === 0) {
    throw new Error('Selected file is empty.');
  }
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    throw new Error('File exceeds the 2 MB local Knowledge Hub limit.');
  }

  const lowerName = file.name.toLowerCase();
  let sourceType: IngestedDocumentInput['sourceType'] = 'text';
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    sourceType = 'markdown';
  } else if (lowerName.endsWith('.json')) {
    sourceType = 'json';
  } else if (!lowerName.endsWith('.txt') && !lowerName.endsWith('.csv')) {
    throw new Error('Supported file types: .txt, .md, .markdown, .json, or .csv.');
  }

  const rawText = await file.text();
  const content = normalizeDocumentContent(rawText);
  if (!content) {
    throw new Error('File contains no readable text.');
  }

  if (sourceType === 'json') {
    try {
      const parsed = JSON.parse(content);
      return {
        title: file.name.replace(/\.[^.]+$/, ''),
        sourceType,
        fileName: file.name,
        mimeType: file.type || 'application/json',
        sizeBytes: file.size,
        content: JSON.stringify(parsed, null, 2),
        tags: ['imported'],
      };
    } catch {
      throw new Error('JSON file is malformed.');
    }
  }

  return {
    title: file.name.replace(/\.[^.]+$/, ''),
    sourceType,
    fileName: file.name,
    mimeType: file.type || 'text/plain',
    sizeBytes: file.size,
    content,
    tags: ['imported'],
  };
}
