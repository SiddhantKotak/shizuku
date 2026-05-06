/**
 * Re-export of `@gsap/react`'s `useGSAP` hook so callers don't need to know
 * which package it lives in. This is the React-18 strict-mode-safe way to
 * run GSAP animations from inside components — `gsap.context` is bound to
 * the component's lifecycle and auto-cleans on unmount.
 *
 * Usage:
 *
 *   import { useGSAP } from '../../lib/gsap/useGsap';
 *   import { fadeIn } from '../../lib/gsap/presets';
 *   const ref = useRef<HTMLDivElement>(null);
 *   useGSAP(() => fadeIn(ref.current), { scope: ref });
 *
 * Without `useGSAP`, double-mount in dev (StrictMode) causes the same
 * animation to fire twice. With it, the second mount cleans up the first.
 *
 * The ESLint rule that blocks raw `gsap.to`/`gsap.from`/`gsap.timeline`
 * outside `lib/gsap/` doesn't apply to this file (we ARE `lib/gsap/`).
 */
export { useGSAP } from '@gsap/react';
