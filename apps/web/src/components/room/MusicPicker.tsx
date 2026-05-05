import { LOFI_TRACKS, useAmbientStore } from '../../stores/ambientStore';

/**
 * Vinyl-record style music picker.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "P15 ·
 * MusicPicker" for the spec (vinyl-record disc that spins when playing,
 * track scroller, volume slider, attribution credit text).
 *
 * Reads + writes `useAmbientStore` for:
 *   - currentTrackId (the active track)
 *   - musicVolume (0-1)
 *   - paused (toggle)
 */
export function MusicPicker(): React.JSX.Element {
  const trackId = useAmbientStore((s) => s.currentTrackId);
  const setTrack = useAmbientStore((s) => s.setTrack);
  const volume = useAmbientStore((s) => s.musicVolume);
  const setVolume = useAmbientStore((s) => s.setMusicVolume);
  const paused = useAmbientStore((s) => s.paused);
  const togglePaused = useAmbientStore((s) => s.togglePaused);

  return (
    <div data-todo-antigravity="room-music-picker" className="rounded-cozy border p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{trackId ?? 'silence'}</span>
        <button type="button" onClick={togglePaused} className="text-ink/60">
          {paused ? '▶' : '⏸'}
        </button>
      </div>
      <select
        value={trackId ?? ''}
        onChange={(e) => setTrack((e.target.value || null) as never)}
        className="mt-1 w-full rounded-cozy border px-1 py-0.5"
      >
        <option value="">Silence</option>
        {LOFI_TRACKS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        className="mt-2 w-full"
        aria-label="Music volume"
      />
    </div>
  );
}
