import { useEffect } from 'react';
import { useAmbientStore } from '../stores/ambientStore';
import { getSoundManager } from '../lib/utils/sound';
import { LOFI_TRACKS } from '../stores/ambientStore';

/**
 * One-shot bootstrap for the sound manager. Mount this once at the app root
 * (e.g. inside `_app.tsx`'s outermost component) so:
 *   - the SoundManager subscribes to `ambientStore` (volume + focus mode wiring)
 *   - the persisted `currentTrackId` triggers playback once the user clicks
 *     anywhere (autoplay-policy gate)
 *
 * The hook returns nothing — its work is purely side-effectful.
 *
 * NOTE: browsers block `audio.play()` before the first user gesture. The
 * `getSoundManager().subscribeToStore()` call wires the volume + paused
 * reactivity, but the FIRST `playMusic` call only succeeds after the user
 * has interacted with the page. Components that trigger music playback
 * (e.g. MusicPicker on click) will land their gesture and unblock audio.
 */
export function useAmbientBootstrap(): void {
  const trackId = useAmbientStore((s) => s.currentTrackId);
  const paused = useAmbientStore((s) => s.paused);

  useEffect(() => {
    const unsub = getSoundManager().subscribeToStore();
    return () => unsub();
  }, []);

  useEffect(() => {
    const sound = getSoundManager();
    if (paused || !trackId) {
      sound.playMusic(null);
      return;
    }
    const track = LOFI_TRACKS.find((t) => t.id === trackId);
    if (track) sound.playMusic(track.src);
  }, [trackId, paused]);
}
