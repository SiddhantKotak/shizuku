import { randomBytes } from 'node:crypto';

const RUN_ID = randomBytes(4).toString('hex');

/**
 * Test email factory — unique per call, prefixed for after-test cleanup.
 * Format: test-<runId>-<random>@shizuku.test
 */
export function uniqueEmail(): string {
  const tail = randomBytes(4).toString('hex');
  return `test-${RUN_ID}-${tail}@shizuku.test`;
}

export const TEST_EMAIL_PREFIX = 'test-';
export const TEST_EMAIL_DOMAIN = '@shizuku.test';
