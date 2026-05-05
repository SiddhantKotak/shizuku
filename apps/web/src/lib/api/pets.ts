import type { CreatePetBody, Pet, UpdatePetBody } from '@shizuku/types';
import { apiFetch } from './client';

export { fetchPet } from './pet';

export function postPet(body: CreatePetBody): Promise<Pet> {
  return apiFetch<Pet>('/v1/pets', { method: 'POST', body });
}

export function patchPet(body: UpdatePetBody): Promise<Pet> {
  return apiFetch<Pet>('/v1/pets/me', { method: 'PATCH', body });
}

export function postEvolvePet(): Promise<Pet> {
  return apiFetch<Pet>('/v1/pets/me/evolve', { method: 'POST' });
}
