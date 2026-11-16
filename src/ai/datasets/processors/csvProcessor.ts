export function parseDatasetCsvToMarkdown(
  csvText: string,
  title = 'Imported CSV Dataset',
  maxRows = 250
): { markdown: string; rowCount: number; columns: string[] } {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('CSV dataset input is empty.');
  }

  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const columns = splitRow(lines[0]).filter(Boolean);
  if (columns.length === 0) {
    throw new Error('CSV header row has no valid columns.');
  }

  const bodyLines = lines.slice(1, maxRows + 1);
  const formattedRows = bodyLines.map((line, idx) => {
    const vals = splitRow(line);
    const pairs = columns.map((col, colIdx) => `${col}: ${vals[colIdx] ?? ''}`);
    return `- Row ${idx + 1}: ${pairs.join(' | ')}`;
  });

  const markdown = [`# ${title}`, '', `Columns: ${columns.join(', ')}`, '', ...formattedRows].join('\n');
  return { markdown, rowCount: bodyLines.length, columns };
}
