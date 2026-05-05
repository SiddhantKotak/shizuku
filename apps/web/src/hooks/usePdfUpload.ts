import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { env } from '../env';
import { queryKeys } from '../lib/api/queryKeys';
import { streamSSE } from '../lib/sse/sseClient';
import { useAuthStore } from '../stores/authStore';

/**
 * PDF upload with SSE progress.
 *
 * `POST /v1/documents` is multipart with an SSE response stream that emits:
 *   created → parsed → chunked → embedding(N/M) → ready  (or error)
 *
 * This hook exposes the flow as a single `upload(file)` async function plus
 * a granular progress object for the UI to render the bar / stage label.
 *
 * On success, invalidates the documents list query so the new row appears
 * in /library without a manual refetch.
 */

export type UploadStage =
  | 'idle'
  | 'created'
  | 'parsed'
  | 'chunked'
  | 'embedding'
  | 'ready'
  | 'error';

export interface UploadProgress {
  stage: UploadStage;
  pages?: number;
  totalChars?: number;
  chunkCount?: number;
  batchIndex?: number;
  totalBatches?: number;
  documentId?: string;
  error?: { code: string; message: string };
}

const INITIAL: UploadProgress = { stage: 'idle' };

export function usePdfUpload() {
  const [progress, setProgress] = useState<UploadProgress>(INITIAL);
  const qc = useQueryClient();

  const upload = useCallback(
    async (file: File): Promise<{ documentId: string }> => {
      if (file.type !== 'application/pdf') {
        throw new Error('Only PDF files are supported');
      }
      const fd = new FormData();
      fd.append('file', file);

      const accessToken = useAuthStore.getState().accessToken;
      let documentId = '';

      await streamSSE({
        url: `${env.VITE_API_URL}/v1/documents`,
        method: 'POST',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: fd,
        onEvent: (evt) => {
          switch (evt.event) {
            case 'created': {
              const { documentId: id } = evt.data as { documentId: string; r2Key: string };
              documentId = id;
              setProgress({ stage: 'created', documentId: id });
              break;
            }
            case 'parsed': {
              const d = evt.data as { pages: number; totalChars: number };
              setProgress((p) => ({ ...p, stage: 'parsed', ...d }));
              break;
            }
            case 'chunked': {
              const d = evt.data as { chunkCount: number };
              setProgress((p) => ({ ...p, stage: 'chunked', ...d }));
              break;
            }
            case 'embedding': {
              const d = evt.data as { batchIndex: number; totalBatches: number };
              setProgress((p) => ({ ...p, stage: 'embedding', ...d }));
              break;
            }
            case 'ready': {
              const d = evt.data as { documentId: string; chunkCount: number };
              documentId = d.documentId;
              setProgress((p) => ({ ...p, stage: 'ready', ...d }));
              void qc.invalidateQueries({ queryKey: queryKeys.documents.list() });
              void qc.invalidateQueries({ queryKey: queryKeys.usage() });
              break;
            }
            case 'error': {
              const d = evt.data as { code: string; message: string };
              setProgress((p) => ({ ...p, stage: 'error', error: d }));
              break;
            }
          }
        },
      });

      if (!documentId) throw new Error('upload completed without a documentId');
      return { documentId };
    },
    [qc],
  );

  const reset = useCallback(() => setProgress(INITIAL), []);

  return { upload, progress, reset };
}
