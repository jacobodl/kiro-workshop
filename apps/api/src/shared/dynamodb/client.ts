/**
 * Shared DynamoDB Document client for the `/resources` handlers.
 *
 * A single `DynamoDBDocumentClient` is created at module load and reused across
 * handler invocations (and across the create/list repositories), so warm Lambda
 * containers avoid reconstructing the client per request. The document client
 * marshals/unmarshals plain JavaScript objects to/from the DynamoDB attribute
 * wire format.
 *
 * The target table name is read exclusively from the `RESOURCES_TABLE_NAME`
 * environment variable injected by CDK — it is never hardcoded (R6, R7).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * The shared, lazily-reusable DynamoDB Document client.
 *
 * Created once per container from a base `DynamoDBClient`. Repositories import
 * this instance rather than constructing their own, keeping a single connection
 * pool across the backend.
 */
export const documentClient: DynamoDBDocumentClient =
  DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Resolve the Saved Resources table name from the environment.
 *
 * The name is provided by CDK via the `RESOURCES_TABLE_NAME` environment
 * variable (R6, R7); it is never hardcoded. Reading it lazily (rather than at
 * module load) keeps unit tests able to set the variable before the first call.
 *
 * @throws {Error} when `RESOURCES_TABLE_NAME` is unset or empty.
 */
export function getResourcesTableName(): string {
  const tableName = process.env.RESOURCES_TABLE_NAME;

  if (typeof tableName !== 'string' || tableName.trim().length === 0) {
    throw new Error('RESOURCES_TABLE_NAME environment variable is not set.');
  }

  return tableName;
}
