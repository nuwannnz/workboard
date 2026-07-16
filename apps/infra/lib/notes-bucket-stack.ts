import { RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * The private S3 bucket holding each note's Markdown body — one object per note keyed
 * `users/<userId>/notes/<noteId>.md` (data-model.md §2, contracts/note-body-store.md, FR-001).
 * Least-privilege and disposable to match the environment posture: all public access blocked,
 * SSE-S3 at rest, TLS enforced in transit, no versioning (no note-history feature — YAGNI), and
 * `RemovalPolicy.DESTROY` + `autoDeleteObjects` so the throwaway environment tears down cleanly
 * like the `WorkBoard` table. The name is CDK-auto-generated and surfaced to the Lambda via the
 * `WORKBOARD_NOTES_BUCKET` env var + a stack output (wired in ApiStack / WorkboardStack).
 */
export class NotesBucketStack extends Construct {
  readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'NotesBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      // Disposable environment — matches the WorkBoard table's RemovalPolicy.DESTROY.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }
}
