import { customAlphabet } from 'nanoid';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnpqrstuvwxyz';
const generate = customAlphabet(ALPHABET, 21);

/** Prefixed-nanoid IDs. Opaque, URL-safe, ~125 bits of entropy. */
export const ID_PREFIX = {
  USER: 'usr',
  OAUTH: 'oa',
  REFRESH: 'rft',
  PWD_RESET: 'pwr',
  EMAIL_VERIFY: 'ev',
  PET: 'pet',
  DOC: 'doc',
  CHUNK: 'chk',
  HIGHLIGHT: 'hl',
  BOOKMARK: 'bm',
  POMODORO: 'pmd',
  CHAT: 'cmsg',
  USER_QUEST: 'uq',
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${generate()}`;
}
