/**
 * Onboarding form schemas — re-exports the canonical Zod schemas from
 * @shizuku/types so the form components import from a single place
 * (mirrors the auth.ts pattern in the same directory).
 */
export {
  avatarConfigSchema,
  createPetBodySchema,
  PET_SPECIES,
  updatePetBodySchema,
} from '@shizuku/types';

export type { AvatarConfig, CreatePetBody, PetSpecies, UpdatePetBody } from '@shizuku/types';
