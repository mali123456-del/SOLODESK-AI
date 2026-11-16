export class AppError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(code: string, message: string, recoverable = true) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, true);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} (${id}) was not found.`, true);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, true);
    this.name = 'ConflictError';
  }
}

export class ReferentialIntegrityError extends AppError {
  constructor(message: string) {
    super('REFERENTIAL_INTEGRITY', message, true);
    this.name = 'ReferentialIntegrityError';
  }
}

export class StorageQuotaError extends AppError {
  constructor(
    message = 'Browser IndexedDB storage quota exceeded. Download a JSON backup and remove unused Knowledge Hub files or sample demo data to free space.'
  ) {
    super('STORAGE_QUOTA_EXCEEDED', message, true);
    this.name = 'StorageQuotaError';
  }
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; inner?: { name?: string } };
  return (
    e.name === 'QuotaExceededError' ||
    e.inner?.name === 'QuotaExceededError' ||
    (typeof e.message === 'string' && /quota/i.test(e.message))
  );
}

export function wrapStorageOperation<T>(op: () => Promise<T>): Promise<T> {
  return op().catch((err: unknown) => {
    if (isQuotaExceededError(err)) {
      throw new StorageQuotaError();
    }
    throw err;
  });
}
