export interface TextChunkDraft {
  chunkIndex: number;
  content: string;
}

export function chunkTextDeterministic(
  content: string,
  maxChunkChars = 500,
  overlapChars = 80
): TextChunkDraft[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChunkChars) {
    return [{ chunkIndex: 0, content: normalized }];
  }

  const chunks: TextChunkDraft[] = [];
  let cursor = 0;
  let idx = 0;

  while (cursor < normalized.length) {
    let end = Math.min(normalized.length, cursor + maxChunkChars);
    if (end < normalized.length) {
      const lastParagraph = normalized.lastIndexOf('\n\n', end);
      const lastLine = normalized.lastIndexOf('\n', end);
      const lastSpace = normalized.lastIndexOf(' ', end);
      const breakPoint =
        lastParagraph > cursor + 150
          ? lastParagraph
          : lastLine > cursor + 150
            ? lastLine
            : lastSpace > cursor + 150
              ? lastSpace
              : end;
      end = breakPoint;
    }

    const slice = normalized.slice(cursor, end).trim();
    if (slice) {
      chunks.push({ chunkIndex: idx, content: slice });
      idx += 1;
    }
    if (end >= normalized.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }

  return chunks;
}
