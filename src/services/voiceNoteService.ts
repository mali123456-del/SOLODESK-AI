import {
  VOICE_NOTE_ALLOWED_MIME_TYPES,
  VOICE_NOTE_MAX_BYTES,
} from '../domain/schemas/entities';

const PREFERRED_RECORDING_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/wav',
];

export interface AudioRecordingSupportResult {
  supported: boolean;
  reason?: string;
  preferredMimeType?: string;
}

export function normalizeAudioMimeType(rawMime: string): string {
  return (rawMime || '').split(';')[0]?.trim().toLowerCase() ?? '';
}

export function checkAudioRecordingSupport(): AudioRecordingSupportResult {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return {
      supported: false,
      reason: 'Microphone capture API (navigator.mediaDevices.getUserMedia) is unavailable in this browser.',
    };
  }
  if (typeof MediaRecorder === 'undefined') {
    return {
      supported: false,
      reason: 'MediaRecorder API is not supported in this browser environment.',
    };
  }

  let preferredMimeType: string | undefined;
  if (typeof MediaRecorder.isTypeSupported === 'function') {
    preferredMimeType = PREFERRED_RECORDING_MIMES.find((m) => MediaRecorder.isTypeSupported(m));
  }
  if (!preferredMimeType) {
    preferredMimeType = 'audio/webm';
  }

  return {
    supported: true,
    preferredMimeType,
  };
}

export function validateAudioBlobMeta(input: {
  mimeType: string;
  sizeBytes: number;
}): { valid: boolean; normalizedMime: string; error?: string } {
  const normalizedMime = normalizeAudioMimeType(input.mimeType) || 'audio/webm';
  if (!(VOICE_NOTE_ALLOWED_MIME_TYPES as readonly string[]).includes(normalizedMime)) {
    return {
      valid: false,
      normalizedMime,
      error: `Unsupported audio MIME type "${input.mimeType}". Allowed: ${VOICE_NOTE_ALLOWED_MIME_TYPES.join(', ')}.`,
    };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return {
      valid: false,
      normalizedMime,
      error: 'Recording produced empty audio data. Try recording for at least 1 second.',
    };
  }
  if (input.sizeBytes > VOICE_NOTE_MAX_BYTES) {
    return {
      valid: false,
      normalizedMime,
      error: `Voice note exceeds the 5 MB limit (${(input.sizeBytes / 1_000_000).toFixed(2)} MB).`,
    };
  }
  return { valid: true, normalizedMime };
}

export function stopMediaStreamTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch {
    // Best-effort cleanup
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to serialize audio recording.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read recorded audio blob.'));
    reader.readAsDataURL(blob);
  });
}

export function formatAudioDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
