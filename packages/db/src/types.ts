import { customType } from 'drizzle-orm/pg-core';

/**
 * citext — case-insensitive text. Requires `CREATE EXTENSION citext` on the DB.
 * Used for users.email so case-insensitive uniqueness is enforced at the type level.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});
