import { sanitizeImportedText, sha256Hex, stripHtmlToSafeText } from '../../security/sanitize';

export interface ExtractedUrlDocument {
  title: string;
  content: string;
  sourceType: 'markdown' | 'text' | 'json' | 'url';
  contentHash: string;
}

export async function extractUrlDocumentContent(params: {
  rawText: string;
  mimeType: string;
  defaultTitle: string;
}): Promise<ExtractedUrlDocument> {
  let title = params.defaultTitle;
  let content = '';
  let sourceType: ExtractedUrlDocument['sourceType'] = 'url';

  if (params.mimeType === 'text/html' || params.mimeType === 'application/xhtml+xml') {
    const extracted = stripHtmlToSafeText(params.rawText);
    if (extracted.title) title = extracted.title;
    content = extracted.text;
    sourceType = 'url';
  } else if (params.mimeType === 'application/json') {
    const parsed = JSON.parse(params.rawText);
    content = JSON.stringify(parsed, null, 2);
    sourceType = 'json';
  } else if (params.mimeType.includes('markdown')) {
    content = sanitizeImportedText(params.rawText);
    sourceType = 'markdown';
  } else {
    content = sanitizeImportedText(params.rawText);
    sourceType = 'text';
  }

  if (!content) {
    throw new Error('Fetched document contained no readable text.');
  }

  const boundedContent = content.slice(0, 190_000);
  const contentHash = await sha256Hex(boundedContent);

  return {
    title: title.slice(0, 180),
    content: boundedContent,
    sourceType,
    contentHash,
  };
}
