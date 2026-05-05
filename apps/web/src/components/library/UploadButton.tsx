import { useRef } from 'react';
import type { UploadProgress } from '../../hooks/usePdfUpload';

export interface UploadButtonProps {
  /** Wire to `usePdfUpload().upload(file)`. */
  onUpload: (file: File) => void;
  /** Read from `usePdfUpload().progress`. */
  progress: UploadProgress;
  /** True if `usage.pdfs.used >= usage.pdfs.limit`. */
  isLifetimeLimitHit: boolean;
}

/**
 * Big upload button + inline SSE progress bar.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Library ·
 * UploadButton" for the spec (drag-n-drop accept zone, animated stage label,
 * progress ring tied to `progress.batchIndex / progress.totalBatches` during
 * the embedding phase, lifetime-limit lock message).
 */
export function UploadButton(props: UploadButtonProps): React.JSX.Element {
  const fileInput = useRef<HTMLInputElement>(null);
  const handleClick = (): void => fileInput.current?.click();
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) props.onUpload(file);
    e.target.value = '';
  };

  const isStreaming =
    props.progress.stage !== 'idle' &&
    props.progress.stage !== 'ready' &&
    props.progress.stage !== 'error';

  return (
    <div data-todo-antigravity="library-upload-button" className="rounded-cozy border p-4">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={props.isLifetimeLimitHit || isStreaming}
        className="rounded-cozy bg-ember-500 px-4 py-2 text-white disabled:opacity-50"
      >
        {props.isLifetimeLimitHit ? 'PDF limit reached' : isStreaming ? `${props.progress.stage}…` : 'Upload PDF'}
      </button>
      {props.progress.stage === 'embedding' && props.progress.totalBatches ? (
        <p className="mt-2 text-xs text-ink/60">
          embedding batch {props.progress.batchIndex} / {props.progress.totalBatches}
        </p>
      ) : null}
      {props.progress.stage === 'error' ? (
        <p className="mt-2 text-xs text-rose-600">
          {props.progress.error?.message ?? 'Upload failed.'}
        </p>
      ) : null}
    </div>
  );
}
