/**
 * DynamoDB access for Saved Resources.
 *
 * This repository owns every DynamoDB call for the `/resources` feature and is
 * the only module that knows the table's key layout. It exposes exactly the two
 * access patterns the feature needs (R6):
 *
 * - **AP1 — create a resource for the caller**: {@link putResource} (`PutCommand`).
 * - **AP2 — list the caller's resources**: {@link listResourcesByOwner}
 *   (`QueryCommand` on the owner partition — never a `Scan`, R6.3).
 *
 * Querying by the `ownerUserId` partition structurally enforces ownership
 * isolation: a caller can only ever read their own partition (R4.2, R7).
 */
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { documentClient, getResourcesTableName } from './client';

/**
 * A persisted Saved Resources item.
 *
 * Mirrors the single-table key design: `ownerUserId` is the partition key and
 * `resourceId` the sort key, alongside the stored attributes. The full item
 * (including `ownerUserId`) is what lives in DynamoDB; API responses project a
 * client-facing view that omits `ownerUserId`.
 */
export interface ResourceItem {
  /** Partition key — the Cognito `sub` of the owning user. */
  ownerUserId: string;
  /** Sort key — the server-generated unique id within the owner's partition. */
  resourceId: string;
  /** The trimmed resource title. */
  title: string;
  /** The validated absolute `http(s)` resource URL. */
  url: string;
  /** Server-generated ISO-8601 UTC creation timestamp. */
  createdAt: string;
}

/**
 * Persist a Saved Resources item (AP1).
 *
 * Writes the full item — including `ownerUserId` — to the table using a
 * `PutCommand`. The caller is responsible for supplying a server-derived owner,
 * a server-generated `resourceId`, and a server-generated `createdAt`.
 *
 * @param item - The complete item to store.
 */
export async function putResource(item: ResourceItem): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: getResourcesTableName(),
      Item: item,
    }),
  );
}

/**
 * List all resources owned by a single user (AP2).
 *
 * Runs a `QueryCommand` scoped to the owner's partition
 * (`ownerUserId = :ownerUserId`) — never a `Scan` (R6.3) — so only the caller's
 * items are ever returned (R4.2). Pagination is not part of this feature's
 * scope; the first page of query results is returned.
 *
 * @param ownerUserId - The Cognito `sub` whose partition to query.
 * @returns The owner's resource items (an empty array when none exist).
 */
export async function listResourcesByOwner(
  ownerUserId: string,
): Promise<ResourceItem[]> {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: getResourcesTableName(),
      KeyConditionExpression: 'ownerUserId = :ownerUserId',
      ExpressionAttributeValues: {
        ':ownerUserId': ownerUserId,
      },
    }),
  );

  return (result.Items ?? []) as ResourceItem[];
}
