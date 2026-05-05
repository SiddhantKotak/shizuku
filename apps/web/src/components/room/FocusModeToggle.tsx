import { useAmbientStore } from '../../stores/ambientStore';

/**
 * Focus-mode toggle. When enabled:
 *   - SoundManager auto-mutes ambience + sfx, raises music to 60% min.
 *   - The page's GSAP `dimEverythingExceptReader` overlay applies (P14+).
 *   - Notifications sounds suppressed.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "P15 ·
 * FocusModeToggle" for the spec (icon button, animated label, optional
 * `Cmd/Ctrl-Shift-F` keyboard shortcut, GSAP slow dim transition).
 */
export function FocusModeToggle(): React.JSX.Element {
  const enabled = useAmbientStore((s) => s.focusMode);
  const toggle = useAmbientStore((s) => s.toggleFocusMode);
  return (
    <button
      type="button"
      onClick={toggle}
      data-todo-antigravity="room-focus-mode-toggle"
      className={`rounded-cozy border px-2 py-1 text-xs ${enabled ? 'bg-ember-100 text-ember-700' : ''}`}
      aria-pressed={enabled}
      title="Focus mode (mutes ambient + dims UI)"
    >
      {enabled ? 'Focus on' : 'Focus off'}
    </button>
  );
}
