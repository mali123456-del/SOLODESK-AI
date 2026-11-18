import { sha256Hex } from '../security/sanitize';
import { createId, type VaultFile } from '../domain/schemas/entities';

export const MAX_VAULT_FILE_BYTES = 5_000_000;

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'txt',
  'md',
  'csv',
  'json',
]);

export function sanitizeVaultFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'document.txt';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  return cleaned.slice(0, 140) || 'document.txt';
}

export function detectMimeFromMagicBytes(bytes: Uint8Array, fallbackName: string): {
  valid: boolean;
  mimeType: string;
  reason?: string;
} {
  const ext = (fallbackName.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      mimeType: 'application/octet-stream',
      reason: `Unsupported extension ".${ext}". Allowed: PDF, PNG, JPG, TXT, MD, CSV, JSON.`,
    };
  }

  // PDF: %PDF-
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    if (ext !== 'pdf') {
      return { valid: false, mimeType: 'application/pdf', reason: 'PDF header does not match file extension.' };
    }
    return { valid: true, mimeType: 'application/pdf' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    if (ext !== 'png') {
      return { valid: false, mimeType: 'image/png', reason: 'PNG signature does not match file extension.' };
    }
    return { valid: true, mimeType: 'image/png' };
  }

  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    if (ext !== 'jpg' && ext !== 'jpeg') {
      return { valid: false, mimeType: 'image/jpeg', reason: 'JPEG signature does not match file extension.' };
    }
    return { valid: true, mimeType: 'image/jpeg' };
  }

  // Text-based formats (must not contain NUL bytes or binary control chars)
  if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
    for (let i = 0; i < Math.min(bytes.length, 4096); i += 1) {
      if (bytes[i] === 0x00) {
        return {
          valid: false,
          mimeType: 'application/octet-stream',
          reason: 'Binary NUL byte detected inside text document.',
        };
      }
    }
    const mime =
      ext === 'json'
        ? 'application/json'
        : ext === 'csv'
          ? 'text/csv'
          : ext === 'md'
            ? 'text/markdown'
            : 'text/plain';
    return { valid: true, mimeType: mime };
  }

  return {
    valid: false,
    mimeType: 'application/octet-stream',
    reason: `File signature did not match declared ".${ext}" format.`,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export async function prepareVaultFileDraft(input: {
  fileName: string;
  bytes: Uint8Array;
  folder?: string;
  classification?: VaultFile['classification'];
  clientId?: string;
  projectId?: string;
  tags?: string[];
  existingFile?: VaultFile;
  versionNote?: string;
}): Promise<Omit<VaultFile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }> {
  if (input.bytes.byteLength === 0) {
    throw new Error('File is empty (0 bytes).');
  }
  if (input.bytes.byteLength > MAX_VAULT_FILE_BYTES) {
    throw new Error(`File exceeds ${Math.round(MAX_VAULT_FILE_BYTES / 1_000_000)} MB browser vault limit.`);
  }

  const safeName = sanitizeVaultFilename(input.fileName);
  const magic = detectMimeFromMagicBytes(input.bytes, safeName);
  if (!magic.valid) {
    throw new Error(magic.reason ?? 'File failed magic-byte MIME validation.');
  }

  const isText = magic.mimeType.startsWith('text/') || magic.mimeType === 'application/json';
  const previewText = isText ? new TextDecoder().decode(input.bytes).slice(0, 100_000) : '';
  const dataUrl = `data:${magic.mimeType};base64,${bytesToBase64(input.bytes)}`;
  const hash = await sha256Hex(dataUrl);
  const now = new Date().toISOString();

  const nextVersion = input.existingFile ? input.existingFile.version + 1 : 1;
  const previousVersions = input.existingFile?.versions ?? [];

  return {
    id: input.existingFile?.id,
    name: safeName,
    folder: input.folder?.trim() || input.existingFile?.folder || 'General',
    mimeType: magic.mimeType,
    sizeBytes: input.bytes.byteLength,
    sha256: hash,
    contentDataUrl: dataUrl,
    previewText,
    classification: input.classification ?? input.existingFile?.classification ?? 'internal',
    approvalStatus: input.existingFile?.approvalStatus ?? 'draft',
    clientId: input.clientId ?? input.existingFile?.clientId ?? '',
    projectId: input.projectId ?? input.existingFile?.projectId ?? '',
    shareToken: input.existingFile?.shareToken ?? createId('vsh'),
    tags: input.tags ?? input.existingFile?.tags ?? [],
    version: nextVersion,
    versions: [
      ...previousVersions,
      {
        version: nextVersion,
        sizeBytes: input.bytes.byteLength,
        sha256: hash,
        note: input.versionNote?.trim() || (nextVersion === 1 ? 'Initial upload' : 'Updated version'),
        createdAt: now,
      },
    ],
  };
}
