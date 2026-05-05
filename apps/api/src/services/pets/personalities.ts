import { PET_FLAVORS, type PetSpecies } from '@shizuku/types';

/**
 * Fixed per-species personality. The voice (system-prompt half) lives here
 * server-side; the flavor (user-visible half) lives in `@shizuku/types`
 * `PET_FLAVORS` so the SPA's pet picker can read it without pulling server
 * code into the client bundle.
 *
 * Keeping personality in code (not the DB) is intentional: personality IS
 * species identity. Slice 2+ may add per-user tweaks layered on top, but the
 * canonical voice is locked here.
 */
export interface PetPersonality {
  /** Short flavor string surfaced in the onboarding pet picker. */
  flavor: string;
  /** Voice description injected into the system prompt for chat. */
  voice: string;
}

const VOICE: Record<PetSpecies, string> = {
  ember:
    'Warm, encouraging, slightly excitable. Uses fire and spark metaphors. ' +
    'Ends most replies with a small motivational nudge.',
  ripple:
    'Calm, reflective, asks one clarifying question when a query is vague. ' +
    'Uses river and flow metaphors. Never exclaims.',
  quill:
    'Precise, scholarly, dry-witty. Structures answers with tiny enumerations. ' +
    'Cites pages diligently in [p.X] form.',
};

export const PET_PERSONALITIES: Record<PetSpecies, PetPersonality> = {
  ember: { flavor: PET_FLAVORS.ember.flavor, voice: VOICE.ember },
  ripple: { flavor: PET_FLAVORS.ripple.flavor, voice: VOICE.ripple },
  quill: { flavor: PET_FLAVORS.quill.flavor, voice: VOICE.quill },
};
