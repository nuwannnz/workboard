// Creates the local notes body bucket in LocalStack S3 for fully-local dev.
//
// LocalStack runs with ephemeral storage, so the bucket must be (re)created on every start.
// Mirrors apps/infra/lib/notes-bucket-stack.ts (a private bucket) but with a fixed, known name
// for local dev. Idempotent — a pre-existing bucket (BucketAlreadyOwnedByYou) is treated as
// success.
//
// Usage (standalone): S3_ENDPOINT=http://localhost:4566 node tools/scripts/bootstrap-s3.mjs
// Also imported by tools/scripts/dev-local.mjs and tools/scripts/local-stack.mjs.

import {
  S3Client,
  CreateBucketCommand,
  BucketAlreadyOwnedByYou,
  BucketAlreadyExists,
} from '@aws-sdk/client-s3';

/** @param {{ endpoint?: string, region?: string, bucket?: string }} [opts] */
export async function bootstrapS3(opts = {}) {
  const endpoint = opts.endpoint ?? process.env.S3_ENDPOINT ?? 'http://localhost:4566';
  const region = opts.region ?? process.env.AWS_REGION ?? 'us-east-1';
  const bucket = opts.bucket ?? process.env.WORKBOARD_NOTES_BUCKET ?? 'workboard-notes-local';

  const client = new S3Client({
    endpoint,
    region,
    // LocalStack uses path-style addressing; credentials are ignored but must be present.
    forcePathStyle: true,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    return { bucket, created: true };
  } catch (err) {
    if (err instanceof BucketAlreadyOwnedByYou || err instanceof BucketAlreadyExists) {
      return { bucket, created: false };
    }
    throw err;
  } finally {
    client.destroy();
  }
}

// Allow running directly: `node tools/scripts/bootstrap-s3.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrapS3()
    .then(({ bucket, created }) =>
      console.log(`LocalStack S3: bucket "${bucket}" ${created ? 'created' : 'already exists'}.`),
    )
    .catch((err) => {
      console.error('Failed to bootstrap LocalStack S3 bucket:', err);
      process.exit(1);
    });
}
