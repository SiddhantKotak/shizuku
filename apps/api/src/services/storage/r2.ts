import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@shizuku/config';

/**
 * S3-compatible client pinned to Cloudflare R2.
 *
 * We use a path-style endpoint (`forcePathStyle: true`) because R2's host
 * pattern is `<accountid>.r2.cloudflarestorage.com/<bucket>/<key>` rather
 * than virtual-host style. Region is `auto` — R2 doesn't care.
 *
 * The client is lazy-init: until a route actually touches storage, no R2
 * connection is established. Slice 1's auth + onboarding flows never hit
 * this code path, which is helpful when developing without R2 set up yet.
 */

const SIGNED_URL_TTL_SECONDS = 15 * 60;

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'R2 not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.',
    );
  }
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
  return cachedClient;
}

/** Upload an in-memory buffer to R2. Used by the synchronous PDF upload route. */
export async function putObject(args: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    }),
  );
}

/**
 * Generate a 15-minute signed GET URL. Used by the SPA to fetch a PDF for
 * the reader without proxying through the API. Caller MUST verify ownership
 * of the document before calling this — the URL itself confers access.
 */
export async function presignDownloadUrl(key: string): Promise<string> {
  const client = getR2Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}

/** Best-effort delete. Used when a document is removed from the DB. */
export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
