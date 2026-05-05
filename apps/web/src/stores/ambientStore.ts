import { createStore } from './createStore';

export type TimeOfDayMode = 'auto' | 'morning' | 'afternoon' | 'evening' | 'night';

export type LofiTrackId =
  | 'rainy-night'
  | 'sunny-morning'
  | 'late-library'
  | 'snow-outside'
  | 'cozy-cafe';

export const LOFI_TRACKS: ReadonlyArray<{
  id: LofiTrackId;
  title: string;
  artist: string;
  src: string; // /assets/audio/music/<file>.ogg
  attribution: string; // shown in /credits.html
}> = [
  {
    id: 'rainy-night',
    title: 'Rainy Night',
    artist: 'TBD',
    src: '/assets/audio/music/rainy-night.ogg',
    attribution: 'CC-BY (replace before launch)',
  },
  {
    id: 'sunny-morning',
    title: 'Sunny Morning',
    artist: 'TBD',
    src: '/assets/audio/music/sunny-morning.ogg',
    attribution: 'CC-BY (replace before launch)',
  },
  {
    id: 'late-library',
    title: 'Late Library',
    artist: 'TBD',
    src: '/assets/audio/music/late-library.ogg',
    attribution: 'CC-BY (replace before launch)',
  },
  {
    id: 'snow-outside',
    title: 'Snow Outside',
    artist: 'TBD',
    src: '/assets/audio/music/snow-outside.ogg',
    attribution: 'CC-BY (replace before launch)',
  },
  {
    id: 'cozy-cafe',
    title: 'Cozy Café',
    artist: 'TBD',
    src: '/assets/audio/music/cozy-cafe.ogg',
    attribution: 'CC-BY (replace before launch)',
  },
];

interface AmbientState {
  /** Currently playing lofi track. null = silence. */
  currentTrackId: LofiTrackId | null;
  /** Music volume 0-1. */
  musicVolume: number;
  /** Ambience layer volume (rain on window, fireplace, etc.) 0-1. */
  ambienceVolume: number;
  /** Has the user paused playback explicitly. */
  paused: boolean;
  /** Focus mode: dims UI, mutes notification sounds, swaps to focus track. */
  focusMode: boolean;
  /** TOD mode: 'auto' uses real-world clock; otherwise user-pinned. */
  timeOfDayMode: TimeOfDayMode;

  // actions
  setTrack: (id: LofiTrackId | null) => void;
  setMusicVolume: (v: number) => void;
  setAmbienceVolume: (v: number) => void;
  togglePaused: () => void;
  toggleFocusMode: () => void;
  setTimeOfDayMode: (m: TimeOfDayMode) => void;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

type AmbientPersisted = Pick<
  AmbientState,
  'currentTrackId' | 'musicVolume' | 'ambienceVolume' | 'timeOfDayMode'
>;

export const useAmbientStore = createStore<AmbientState, AmbientPersisted>(
  (set) => ({
    currentTrackId: 'rainy-night',
    musicVolume: 0.4,
    ambienceVolume: 0.5,
    paused: false,
    focusMode: false,
    timeOfDayMode: 'auto',

    setTrack: (id) => set({ currentTrackId: id, paused: false }),
    setMusicVolume: (v) => set({ musicVolume: clamp01(v) }),
    setAmbienceVolume: (v) => set({ ambienceVolume: clamp01(v) }),
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
    setTimeOfDayMode: (m) => set({ timeOfDayMode: m }),
  }),
  {
    name: 'shizuku-ambient',
    persist: {
      partialize: (state) => ({
        currentTrackId: state.currentTrackId,
        musicVolume: state.musicVolume,
        ambienceVolume: state.ambienceVolume,
        timeOfDayMode: state.timeOfDayMode,
        // intentionally NOT persisting paused or focusMode (per-session)
      }),
    },
  },
);
