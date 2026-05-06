import gsap from 'gsap';

/**
 * Animation primitives — the ONLY sanctioned channel for DOM animation in
 * this app. ESLint forbids raw `gsap.to` outside this module.
 *
 * Why presets and not free-form gsap calls everywhere:
 *   - Consistency. All cards fade in the same way; all modals slide the
 *     same; all bursts use the same easing. Branding stays coherent.
 *   - `prefers-reduced-motion` honor. Each preset checks the user's
 *     setting and shortens / skips when set. Implementing this once here
 *     means every animation is reduced-motion-friendly by construction.
 *   - React-18 strict-mode safety. Use these from inside `useGSAP` (from
 *     `@gsap/react`) — see the hook re-export below — so double-mount in
 *     dev doesn't duplicate animations.
 *
 * Usage:
 *   import { useGSAP } from '../../lib/gsap/useGsap';
 *   import { fadeIn } from '../../lib/gsap/presets';
 *   const ref = useRef<HTMLDivElement>(null);
 *   useGSAP(() => fadeIn(ref.current), { scope: ref });
 */

const REDUCED_MOTION_QUERY =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** True when the user has asked the OS to minimize motion. */
function prefersReducedMotion(): boolean {
  return REDUCED_MOTION_QUERY?.matches ?? false;
}

/**
 * 250ms upward fade. Use on route-content reveals, card mounts, anything
 * that wants a soft entrance without being pushy.
 *
 * Reduced-motion: collapses to a 1-frame instant set (no animation).
 */
export function fadeIn(target: gsap.TweenTarget | null): gsap.core.Tween | null {
  if (!target) return null;
  if (prefersReducedMotion()) {
    gsap.set(target, { opacity: 1, y: 0 });
    return null;
  }
  return gsap.fromTo(
    target,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' },
  );
}

/**
 * Modal entry: 280ms slide up + opacity. Used by `<Modal>` primitive.
 *
 * Reduced-motion: opacity-only, no translate.
 */
export function slideUpModal(target: gsap.TweenTarget | null): gsap.core.Tween | null {
  if (!target) return null;
  if (prefersReducedMotion()) {
    return gsap.fromTo(target, { opacity: 0 }, { opacity: 1, duration: 0.15 });
  }
  return gsap.fromTo(
    target,
    { opacity: 0, y: 24 },
    { opacity: 1, y: 0, duration: 0.28, ease: 'power3.out' },
  );
}

/**
 * Level-up flourish: pop + glow. Used by the LevelUpToast (P14).
 * Total duration: 0.6s.
 *
 * Reduced-motion: fade-only.
 */
export function levelUpFlourish(target: gsap.TweenTarget | null): gsap.core.Timeline | null {
  if (!target) return null;
  if (prefersReducedMotion()) {
    gsap.fromTo(target, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    return null;
  }
  const tl = gsap.timeline();
  tl.fromTo(
    target,
    { scale: 0.9, opacity: 0 },
    { scale: 1.15, opacity: 1, duration: 0.25, ease: 'back.out(2.5)' },
  );
  tl.to(target, { scale: 1, duration: 0.18, ease: 'power2.inOut' });
  tl.to(target, { opacity: 0.95, duration: 0.17 }, '<');
  return tl;
}

/**
 * Quest-claim burst: scale-pop + (caller-provided) particle/checkmark
 * children. The preset only animates the wrapper; the JSX provides the
 * burst sparkles as separate elements.
 *
 * Reduced-motion: scale-pop only, no overshoot.
 */
export function questClaimedBurst(target: gsap.TweenTarget | null): gsap.core.Timeline | null {
  if (!target) return null;
  const tl = gsap.timeline();
  if (prefersReducedMotion()) {
    tl.fromTo(target, { scale: 1 }, { scale: 1.05, duration: 0.12 });
    tl.to(target, { scale: 1, duration: 0.12 });
    return tl;
  }
  tl.fromTo(target, { scale: 1 }, { scale: 1.18, duration: 0.18, ease: 'back.out(3)' });
  tl.to(target, { scale: 1, duration: 0.22, ease: 'elastic.out(1, 0.5)' });
  return tl;
}

/**
 * Pomodoro "focus complete" flourish: stroke-dash sweep on a timer ring
 * + a subtle scale pulse + bell-wobble. Caller passes the ring SVG path
 * via `target.ring` and the bell icon via `target.bell`.
 *
 * Reduced-motion: instant ring fill, no bell wobble.
 */
export function pomodoroComplete(args: {
  ring?: SVGPathElement | null;
  card?: HTMLElement | null;
  bell?: HTMLElement | null;
}): gsap.core.Timeline | null {
  const tl = gsap.timeline();
  if (prefersReducedMotion()) {
    if (args.ring) gsap.set(args.ring, { strokeDashoffset: 0 });
    return null;
  }
  if (args.ring) {
    tl.to(args.ring, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut' });
  }
  if (args.card) {
    tl.fromTo(
      args.card,
      { scale: 1 },
      { scale: 1.04, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 },
      '<',
    );
  }
  if (args.bell) {
    tl.fromTo(
      args.bell,
      { rotate: 0 },
      { rotate: 12, duration: 0.08, ease: 'power1.inOut', yoyo: true, repeat: 5 },
      '<0.1',
    );
  }
  return tl;
}

/**
 * Evolution cutscene — full 4.5s timeline. Used by EvolutionScene (P14).
 * Caller passes refs to the elements involved:
 *   - `silhouette` — the pet sprite container; flashes white at peak.
 *   - `particles` — particle ring container; expands outward.
 *   - `nameBanner` — the new-stage name banner; slides in at end.
 *
 * The Phaser scene MUST be paused while this runs (see `EvolutionScene`).
 *
 * Reduced-motion: condenses to a 1-second cross-fade between sprites.
 */
export function evolutionSequence(refs: {
  silhouette?: HTMLElement | null;
  particles?: HTMLElement | null;
  nameBanner?: HTMLElement | null;
}): gsap.core.Timeline | null {
  const tl = gsap.timeline();
  if (prefersReducedMotion()) {
    if (refs.silhouette) tl.fromTo(refs.silhouette, { opacity: 0 }, { opacity: 1, duration: 1 });
    if (refs.nameBanner)
      tl.fromTo(refs.nameBanner, { opacity: 0 }, { opacity: 1, duration: 0.3 }, '-=0.2');
    return tl;
  }

  // Stage 1: zoom + bloom (0.8s)
  if (refs.silhouette) {
    tl.fromTo(
      refs.silhouette,
      { scale: 1, filter: 'brightness(1)' },
      { scale: 1.4, filter: 'brightness(2)', duration: 0.8, ease: 'power2.out' },
    );
  }
  // Stage 2: silhouette flash (0.3s)
  if (refs.silhouette) {
    tl.to(refs.silhouette, {
      filter: 'brightness(8) saturate(0)',
      duration: 0.3,
      ease: 'power3.in',
    });
  }
  // Stage 3: particle ring (1.2s, overlaps with sprite swap below)
  if (refs.particles) {
    tl.fromTo(
      refs.particles,
      { scale: 0, opacity: 0 },
      { scale: 3, opacity: 1, duration: 1.2, ease: 'power2.out' },
      '<',
    );
  }
  // Stage 4: sprite swap — caller subscribes to `tl.eventCallback('onUpdate', ...)`
  // at progress 0.55 to switch the sprite atlas, since GSAP can't hand off DOM swaps.
  // Stage 5: settle (1.0s)
  if (refs.silhouette) {
    tl.to(refs.silhouette, {
      scale: 1,
      filter: 'brightness(1)',
      duration: 1,
      ease: 'power3.out',
    });
  }
  if (refs.particles) {
    tl.to(refs.particles, { opacity: 0, duration: 0.5 }, '<0.3');
  }
  // Stage 6: name banner (0.7s, ends with the timeline)
  if (refs.nameBanner) {
    tl.fromTo(
      refs.nameBanner,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: 'back.out(1.6)' },
      '-=0.3',
    );
  }
  return tl;
}

/**
 * Stagger-in helper — used by quest panels, dashboard rows, anywhere a
 * list of items wants to land in sequence rather than all at once.
 *
 * Reduced-motion: instant set, no stagger.
 */
export function staggerIn(
  targets: gsap.TweenTarget | null,
  opts: { delayBetween?: number } = {},
): gsap.core.Tween | null {
  if (!targets) return null;
  if (prefersReducedMotion()) {
    gsap.set(targets, { opacity: 1, y: 0 });
    return null;
  }
  return gsap.fromTo(
    targets,
    { opacity: 0, y: 8 },
    {
      opacity: 1,
      y: 0,
      duration: 0.25,
      ease: 'power2.out',
      stagger: opts.delayBetween ?? 0.05,
    },
  );
}
