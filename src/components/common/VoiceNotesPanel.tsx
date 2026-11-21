import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Pause, Play, Save, Square, Trash2, Volume2, X } from 'lucide-react';
import { Button, ConfirmDialog, Input, useToast } from '../ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import { formatDisplayDate } from '../../domain/calculations/dates';
import type { VoiceNote } from '../../domain/schemas/entities';
import {
  blobToDataUrl,
  checkAudioRecordingSupport,
  formatAudioDuration,
  stopMediaStreamTracks,
  validateAudioBlobMeta,
} from '../../services/voiceNoteService';

interface VoiceNotesPanelProps {
  parentType: 'project' | 'task';
  parentId: string;
  parentLabel?: string;
}

type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'preview' | 'saving';

export const VoiceNotesPanel: React.FC<VoiceNotesPanelProps> = ({
  parentType,
  parentId,
  parentLabel,
}) => {
  const { voiceNotes, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewMimeType, setPreviewMimeType] = useState('audio/webm');
  const [deleteTarget, setDeleteTarget] = useState<VoiceNote | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const previewUrlRef = useRef('');

  const support = useMemo(() => checkAudioRecordingSupport(), []);

  const scopedNotes = useMemo(
    () =>
      voiceNotes.filter(
        (v) => v.parentType === parentType && v.parentId === parentId
      ),
    [voiceNotes, parentType, parentId]
  );

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const revokePreview = (urlToRevoke?: string) => {
    const url = urlToRevoke ?? previewUrlRef.current;
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
    if (!urlToRevoke || urlToRevoke === previewUrlRef.current) {
      previewUrlRef.current = '';
    }
  };

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearTimer();
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore cleanup stop errors
      }
      stopMediaStreamTracks(streamRef.current);
      revokePreview();
    };
  }, []);

  const startRecording = async () => {
    setErrorMessage(null);
    if (!support.supported) {
      setErrorMessage(support.reason ?? 'Voice recording is unsupported in this browser.');
      return;
    }

    setStatus('requesting');
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) {
        stopMediaStreamTracks(stream);
        return;
      }

      streamRef.current = stream;
      const mimeOption = support.preferredMimeType;
      const recorder = mimeOption
        ? new MediaRecorder(stream, { mimeType: mimeOption })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      const chosenMime = recorder.mimeType || mimeOption || 'audio/webm';

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        clearTimer();
        stopMediaStreamTracks(streamRef.current);
        streamRef.current = null;
        setStatus('idle');
        setErrorMessage('Audio recording failed unexpectedly. Please check your microphone.');
      };

      recorder.onstop = () => {
        clearTimer();
        stopMediaStreamTracks(streamRef.current);
        streamRef.current = null;
        mediaRecorderRef.current = null;

        if (cancelledRef.current) {
          chunksRef.current = [];
          setElapsedSeconds(0);
          setStatus('idle');
          return;
        }

        const blob = new Blob(chunksRef.current, { type: chosenMime });
        chunksRef.current = [];
        const check = validateAudioBlobMeta({
          mimeType: blob.type || chosenMime,
          sizeBytes: blob.size,
        });
        if (!check.valid) {
          setStatus('idle');
          setErrorMessage(check.error ?? 'Invalid audio recording.');
          return;
        }

        revokePreview();
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewBlob(blob);
        setPreviewMimeType(check.normalizedMime);
        setPreviewUrl(url);
        setNoteTitle(
          parentLabel
            ? `${parentLabel} note`
            : `${parentType === 'project' ? 'Project' : 'Task'} Voice Note`
        );
        setStatus('preview');
      };

      setElapsedSeconds(0);
      recorder.start(250);
      setStatus('recording');
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      stopMediaStreamTracks(streamRef.current);
      streamRef.current = null;
      setStatus('idle');
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Enable microphone access in browser settings to record voice notes.'
          : err instanceof Error
            ? err.message
            : 'Unable to access microphone.';
      setErrorMessage(msg);
    }
  };

  const pauseOrResume = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (status === 'recording') {
      if (typeof rec.pause === 'function') rec.pause();
      clearTimer();
      setStatus('paused');
    } else if (status === 'paused') {
      if (typeof rec.resume === 'function') rec.resume();
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      setStatus('recording');
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    cancelledRef.current = false;
    rec.stop();
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    clearTimer();
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      stopMediaStreamTracks(streamRef.current);
      streamRef.current = null;
      setElapsedSeconds(0);
      setStatus('idle');
    }
  };

  const discardPreview = () => {
    revokePreview();
    setPreviewUrl('');
    setPreviewBlob(null);
    setElapsedSeconds(0);
    setNoteTitle('');
    setStatus('idle');
  };

  const savePreview = async () => {
    if (!previewBlob) return;
    setStatus('saving');
    setErrorMessage(null);
    try {
      const dataUrl = await blobToDataUrl(previewBlob);
      await repositories.createVoiceNote({
        parentType,
        parentId,
        title: noteTitle.trim() || 'Voice Note',
        mimeType: previewMimeType,
        sizeBytes: previewBlob.size,
        durationSeconds: Math.max(1, elapsedSeconds),
        audioDataUrl: dataUrl,
        transcript: '',
      });
      await refresh();
      discardPreview();
      pushToast({
        tone: 'success',
        title: 'Voice note saved locally',
        description: `Stored in IndexedDB for this ${parentType}.`,
      });
    } catch (err) {
      setStatus('preview');
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save voice note.');
    }
  };

  return (
    <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Voice Notes ({scopedNotes.length})
          </p>
        </div>

        {status === 'idle' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void startRecording()}
            disabled={!support.supported}
            icon={<Mic className="w-3.5 h-3.5" />}
          >
            Record Voice Note
          </Button>
        )}
      </div>

      {!support.supported && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2.5 py-2">
          {support.reason}
        </p>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-2.5 py-2"
        >
          {errorMessage}
        </div>
      )}

      {status === 'requesting' && (
        <p className="text-xs text-slate-500">Requesting microphone permission…</p>
      )}

      {(status === 'recording' || status === 'paused') && (
        <div className="p-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-white">
              {status === 'paused' ? 'Paused' : 'Recording'}
            </span>
            <span className="font-mono tabular-nums font-bold text-[#2563EB] dark:text-[#20C7D9]">
              {formatAudioDuration(elapsedSeconds)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={pauseOrResume}
              aria-label={status === 'paused' ? 'Resume recording' : 'Pause recording'}
            >
              {status === 'paused' ? (
                <>
                  <Play className="w-3 h-3 mr-1" aria-hidden="true" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3 mr-1" aria-hidden="true" />
                  Pause
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={stopRecording}
              aria-label="Stop recording"
            >
              <Square className="w-3 h-3 mr-1 fill-current" aria-hidden="true" />
              Stop
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={cancelRecording}
              aria-label="Cancel recording"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {(status === 'preview' || status === 'saving') && previewUrl && (
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101827] space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              Preview Recording · {formatAudioDuration(elapsedSeconds)}
            </span>
            <span className="font-mono text-slate-500">
              {previewBlob ? `${Math.max(1, Math.round(previewBlob.size / 1024))} KB` : ''}
            </span>
          </div>
          <audio
            controls
            src={previewUrl}
            className="w-full h-9"
            aria-label="Voice note recording preview player"
          />
          <Input
            label="Note Title"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Describe this voice note..."
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={discardPreview}
              disabled={status === 'saving'}
            >
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              loading={status === 'saving'}
              onClick={() => void savePreview()}
              icon={<Save className="w-3.5 h-3.5" />}
            >
              Save Voice Note
            </Button>
          </div>
        </div>
      )}

      {scopedNotes.length === 0 ? (
        <p className="text-xs text-slate-500">
          No voice notes attached to this {parentType} yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {scopedNotes.map((note) => (
            <li
              key={note.id}
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827] space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    {note.title}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {formatAudioDuration(note.durationSeconds)} ·{' '}
                    {Math.max(1, Math.round(note.sizeBytes / 1024))} KB ·{' '}
                    {formatDisplayDate(note.createdAt, dateFormat)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteTarget(note)}
                  aria-label={`Delete voice note ${note.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
                </Button>
              </div>
              <audio
                controls
                src={note.audioDataUrl}
                className="w-full h-8"
                aria-label={`Play ${note.title}`}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteVoiceNote(deleteTarget.id);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Voice note deleted' });
        }}
        title="Delete Voice Note"
        description={`Permanently delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
