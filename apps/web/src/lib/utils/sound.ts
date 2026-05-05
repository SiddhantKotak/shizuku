/**
 * Audio manager — owns three channels (music / ambience / sfx) backed by
 * pooled HTMLAudioElement instances. Connected to the ambientStore so volume
 * sliders and focus-mode mutes propagate without component-level wiring.
 *
 * Why HTMLAudioElement and not Web Audio API: we don't need spatial audio,
 * frequency analysis, or precise timing for Slice 1. Plain <audio> is simpler,
 * cheaper, and behaves correctly when the tab is backgrounded.
 *
 * Usage:
 *   const sound = getSoundManager();
 *   sound.playMusic(track.src);   // crossfades from previous track
 *   sound.playSfx('/audio/level-up.ogg');
 *   sound.subscribeToStore();     // wires volume + focus mode reactivity
 */
import { useAmbientStore } from '../../stores/ambientStore';

const CROSSFADE_MS = 800;

class Channel {
  private current: HTMLAudioElement | null = null;
  private fadingOut: HTMLAudioElement | null = null;
  private targetVolume = 1;

  constructor(public readonly name: 'music' | 'ambience' | 'sfx') {}

  setVolume(v: number): void {
    this.targetVolume = Math.max(0, Math.min(1, v));
    if (this.current) this.current.volume = this.targetVolume;
  }

  /** Crossfade from current to a new looping track. Returns immediately. */
  playLoop(src: string | null): void {
    if (this.current && this.current.src.endsWith(src ?? '__never__')) return;

    // Fade out current
    if (this.current) {
      this.fadingOut = this.current;
      const old = this.fadingOut;
      const startVol = old.volume;
      const t0 = performance.now();
      const fade = (now: number): void => {
        const t = Math.min(1, (now - t0) / CROSSFADE_MS);
        old.volume = startVol * (1 - t);
        if (t < 1) requestAnimationFrame(fade);
        else {
          old.pause();
          old.src = '';
          if (this.fadingOut === old) this.fadingOut = null;
        }
      };
      requestAnimationFrame(fade);
    }

    if (!src) {
      this.current = null;
      return;
    }

    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0;
    audio.play().catch(() => {
      // Autoplay blocked — common before first user gesture. Silently ignore;
      // we'll get another chance after the user clicks the music button.
    });
    this.current = audio;

    const t0 = performance.now();
    const fade = (now: number): void => {
      if (this.current !== audio) return;
      const t = Math.min(1, (now - t0) / CROSSFADE_MS);
      audio.volume = this.targetVolume * t;
      if (t < 1) requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }

  pause(): void {
    this.current?.pause();
  }

  resume(): void {
    this.current?.play().catch(() => undefined);
  }

  /** Fire-and-forget one-shot. Volume locked to channel volume. */
  playOnce(src: string): void {
    const audio = new Audio(src);
    audio.volume = this.targetVolume;
    audio.play().catch(() => undefined);
    audio.addEventListener('ended', () => {
      audio.src = '';
    });
  }
}

class SoundManager {
  readonly music = new Channel('music');
  readonly ambience = new Channel('ambience');
  readonly sfx = new Channel('sfx');
  private storeUnsub: (() => void) | null = null;

  /** Convenience wrappers. */
  playMusic(src: string | null): void {
    this.music.playLoop(src);
  }
  playAmbience(src: string | null): void {
    this.ambience.playLoop(src);
  }
  playSfx(src: string): void {
    this.sfx.playOnce(src);
  }

  /**
   * Subscribe to ambientStore — keeps volumes + paused state synced.
   * Call once at app boot. Returns an unsubscribe in case tests need it.
   */
  subscribeToStore(): () => void {
    if (this.storeUnsub) return this.storeUnsub;
    // ambientStore doesn't import this file, so a static import is safe.
    // The earlier dynamic-import dance left a Vite warning about chunk
    // duplication when useAmbientBootstrap also static-imported the store.
    const sync = (s: ReturnType<typeof useAmbientStore.getState>): void => {
      this.music.setVolume(s.focusMode ? Math.max(s.musicVolume, 0.6) : s.musicVolume);
      this.ambience.setVolume(s.focusMode ? 0 : s.ambienceVolume);
      this.sfx.setVolume(s.focusMode ? 0 : 0.7);
      if (s.paused) this.music.pause();
      else this.music.resume();
    };
    sync(useAmbientStore.getState());
    this.storeUnsub = useAmbientStore.subscribe(sync);
    return () => {
      this.storeUnsub?.();
      this.storeUnsub = null;
    };
  }
}

let instance: SoundManager | null = null;
export function getSoundManager(): SoundManager {
  if (!instance) instance = new SoundManager();
  return instance;
}
