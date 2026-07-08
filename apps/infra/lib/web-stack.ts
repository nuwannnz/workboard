import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Annotations, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

// The built PWA that gets uploaded to the bucket. Must be built (`nx build frontend`) with the
// production env BEFORE `cdk deploy` — synth reads this directory as an asset.
const frontendDist = fileURLToPath(new URL('../../frontend/dist', import.meta.url));

/**
 * Static hosting for the frontend build: a private S3 bucket fronted by
 * CloudFront (FR-009). SPA routing falls back to index.html.
 */
export class WebStack extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    // Upload the built frontend into the bucket and invalidate the CDN on each deploy.
    // Without this the bucket is empty and CloudFront returns S3 "AccessDenied" for every path.
    // Guarded so `cdk synth` / infra unit tests still run when the build hasn't been produced
    // yet (e.g. CI); a real deploy without a build gets a loud warning instead of a silent skip.
    if (existsSync(frontendDist)) {
      new s3deploy.BucketDeployment(this, 'WebDeployment', {
        sources: [s3deploy.Source.asset(frontendDist)],
        destinationBucket: this.bucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
      });
    } else {
      Annotations.of(this).addWarning(
        `Frontend build not found at ${frontendDist}; skipping S3 upload. Run "nx build frontend" ` +
          'before deploy, or CloudFront will return AccessDenied.',
      );
    }
  }
}
