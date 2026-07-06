import { RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * DynamoDB single-table design (data-model.md, FR-011). One table `WorkBoard`
 * with partition key `PK` and sort key `SK`; ownership/entity prefixes are
 * applied by the backend repository layer in later stages.
 */
export class DataStack extends Construct {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'WorkBoardTable', {
      tableName: 'WorkBoard',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Stage 1 is a disposable skeleton environment.
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
