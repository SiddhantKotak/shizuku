/**
 * R2 object key conventions.
 *
 * Keep keys collision-free per user, easy to grep, and tied to the DB
 * `documents.r2_key` column. The `user-` prefix means a future "delete
 * everything for user" sweep is a single `ListObjectsV2` + batch delete.
 */

export const documentKey = (userId: string, documentId: string): string =>
  `user-${userId}/documents/${documentId}.pdf`;

export const avatarKey = (userId: string, hash: string): string =>
  `user-${userId}/avatars/${hash}.png`;
