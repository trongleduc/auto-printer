import "server-only";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | undefined;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
      // SDK >= 3.729 adds a CRC32 checksum by default. In a presigned PUT that is the
      // checksum of an empty body, so R2 rejects the real upload. Only send it when required.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return _client;
}

/** The browser must send exactly this header with the PUT, because it is part of the signature. */
export const UPLOAD_CACHE_CONTROL = "private, max-age=604800, immutable";

export function signPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: env("R2_BUCKET"),
      Key: key,
      ContentType: contentType,
      CacheControl: UPLOAD_CACHE_CONTROL,
    }),
    { expiresIn: 600 },
  );
}

const HOUR = 3600_000;

/**
 * Signing time is rounded down to the hour so the URL for a key stays identical
 * for an hour. The dashboard polls every few seconds, and stable URLs let the
 * browser reuse cached images instead of downloading them again.
 */
export function signGet(key: string): Promise<string> {
  const signingDate = new Date(Math.floor(Date.now() / HOUR) * HOUR);
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }), {
    signingDate,
    expiresIn: 3 * 3600,
  });
}

export async function signGetMany(keys: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(keys)];
  const urls = await Promise.all(unique.map((k) => signGet(k)));
  return new Map(unique.map((k, i) => [k, urls[i]]));
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await client().send(
    new DeleteObjectsCommand({
      Bucket: env("R2_BUCKET"),
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
}
