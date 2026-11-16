import { z } from 'zod';
import { repositories, DexieSolodeskRepositories } from '../database/repositories/dexieRepositories';
import type { ClientStatus } from '../domain/schemas/entities';
import { parseCsvRecords } from '../export/csvUtils';

export const MAX_CSV_IMPORT_ROWS = 2000;

const csvClientRowSchema = z.object({
  name: z.string().trim().min(1).max(140),
  company: z.string().trim().max(140).default(''),
  email: z.string().trim().max(160).default(''),
  phone: z.string().trim().max(60).default(''),
  website: z.string().trim().max(200).default(''),
  location: z.string().trim().max(140).default(''),
  status: z.enum(['active', 'lead', 'archived']).default('active'),
  category: z.string().trim().max(80).default('General'),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  notes: z.string().max(4000).default(''),
});

export interface CsvClientImportResult {
  totalRows: number;
  importedCount: number;
  skippedDuplicateCount: number;
  skippedInvalidCount: number;
  errors: string[];
}

export async function importClientsFromCsvText(
  csvText: string,
  repo: DexieSolodeskRepositories = repositories
): Promise<CsvClientImportResult> {
  const rows = parseCsvRecords(csvText);
  if (rows.length === 0) {
    throw new Error('CSV file appears empty or missing headers.');
  }
  if (rows.length > MAX_CSV_IMPORT_ROWS) {
    throw new Error(`CSV exceeds maximum row limit of ${MAX_CSV_IMPORT_ROWS} rows per import.`);
  }

  let importedCount = 0;
  let skippedDuplicateCount = 0;
  let skippedInvalidCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rawName = (row.name || row['client name'] || '').trim();
    if (!rawName) {
      skippedInvalidCount += 1;
      continue;
    }

    const rawStatus = (row.status || '').trim().toLowerCase();
    const status: ClientStatus =
      rawStatus === 'lead' || rawStatus === 'archived' ? rawStatus : 'active';

    const candidate = {
      name: rawName,
      company: (row.company || '').trim(),
      email: (row.email || '').trim(),
      phone: (row.phone || '').trim(),
      website: (row.website || '').trim(),
      location: (row.location || '').trim(),
      status,
      category: (row.category || '').trim() || 'General',
      tags: row.tags
        ? row.tags
            .split(/[;|,]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      notes: row.notes || '',
    };

    const parsed = csvClientRowSchema.safeParse(candidate);
    if (!parsed.success) {
      skippedInvalidCount += 1;
      errors.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message ?? 'Invalid fields'}`);
      continue;
    }

    const dups = await repo.findDuplicateClients({
      name: parsed.data.name,
      email: parsed.data.email,
    });
    if (dups.length > 0) {
      skippedDuplicateCount += 1;
      continue;
    }

    await repo.createClient({
      ...parsed.data,
      isDemo: false,
    });
    importedCount += 1;
  }

  return {
    totalRows: rows.length,
    importedCount,
    skippedDuplicateCount,
    skippedInvalidCount,
    errors: errors.slice(0, 10),
  };
}
