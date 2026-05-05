import type {
  AvatarConfig,
  DeleteUserBody,
  UpdateAvatarBody,
  UpdateUserBody,
  User,
} from '@shizuku/types';
import { apiFetch } from './client';

/** Already lives in `me.ts`; re-exported for symmetry alongside the mutations. */
export { fetchMe } from './me';

export function patchMe(body: UpdateUserBody): Promise<User> {
  return apiFetch<User>('/v1/users/me', { method: 'PATCH', body });
}

export function patchAvatar(body: UpdateAvatarBody): Promise<AvatarConfig> {
  return apiFetch<AvatarConfig>('/v1/users/me/avatar', { method: 'PATCH', body });
}

export function deleteMe(body: DeleteUserBody): Promise<void> {
  return apiFetch<void>('/v1/users/me', { method: 'DELETE', body });
}
