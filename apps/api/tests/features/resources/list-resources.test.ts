/**
 * Tests for the `GET /resources` handler — list + ownership isolation.
 *
 * Covers R4 (list only the caller's resources) and R13 (ownership isolation
 * proven by a backend test):
 * - Empty store → `200` with `{ items: [] }` (R4.3).
 * - With both user A's and user B's data, a request as user A returns only A's
 *   items and never B's (R4.1, R4.2) — proven via an in-memory store keyed by
 *   `ownerUserId`.
 * - `listResourcesByOwner` is invoked with the caller's JWT `sub`.
 * - Returned items carry no `ownerUserId` key (R4.4).
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handler } from '../../../src/features/resources/list-resources';
import type { ResourceItem } from '../../../src/shared/dynamodb/resources-repo';

// Mock the DynamoDB boundary. The handler calls `listResourcesByOwner(sub)`;
// we back it with an in-memory store keyed by `ownerUserId` so a call as one
// user can only ever surface that user's partition — a true isolation check.
const store = new Map<string, ResourceItem[]>();

const listResourcesByOwner = vi.fn(
  async (ownerUserId: string): Promise<ResourceItem[]> =>
    store.get(ownerUserId) ?? [],
);

vi.mock('../../../src/shared/dynamodb/resources-repo', () => ({
  listResourcesByOwner: (ownerUserId: string) =>
    listResourcesByOwner(ownerUserId),
}));

const USER_A = 'user-a-sub-1111';
const USER_B = 'user-b-sub-2222';

/** Build a minimal HTTP API v2 event carrying the given JWT `sub`. */
function eventForSub(sub: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: {
      authorizer: { jwt: { claims: { sub } } },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

/** A persisted item for a given owner. */
function itemFor(
  ownerUserId: string,
  resourceId: string,
  title: string,
): ResourceItem {
  return {
    ownerUserId,
    resourceId,
    title,
    url: `https://example.com/${resourceId}`,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  store.clear();
  listResourcesByOwner.mockClear();
  process.env.RESOURCES_TABLE_NAME = 'test-resources-table';
});

describe('GET /resources handler', () => {
  it('returns 200 with an empty list when the caller has no resources', async () => {
    const response = await handler(eventForSub(USER_A));

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ items: [] });

    expect(listResourcesByOwner).toHaveBeenCalledTimes(1);
    expect(listResourcesByOwner).toHaveBeenCalledWith(USER_A);
  });

  it("returns only the caller's items and never another user's (ownership isolation)", async () => {
    store.set(USER_A, [
      itemFor(USER_A, 'a-1', 'A first'),
      itemFor(USER_A, 'a-2', 'A second'),
    ]);
    store.set(USER_B, [
      itemFor(USER_B, 'b-1', 'B first'),
      itemFor(USER_B, 'b-2', 'B second'),
    ]);

    const response = await handler(eventForSub(USER_A));

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body as string);
    const resourceIds = body.items.map(
      (item: { resourceId: string }) => item.resourceId,
    );

    // Only user A's items come back.
    expect(resourceIds).toEqual(['a-1', 'a-2']);

    // User B's items never appear.
    expect(resourceIds).not.toContain('b-1');
    expect(resourceIds).not.toContain('b-2');

    // The query was scoped to the caller's JWT sub, not any other owner.
    expect(listResourcesByOwner).toHaveBeenCalledTimes(1);
    expect(listResourcesByOwner).toHaveBeenCalledWith(USER_A);
    expect(listResourcesByOwner).not.toHaveBeenCalledWith(USER_B);
  });

  it('projects each item to the client view without the owner identifier', async () => {
    store.set(USER_A, [itemFor(USER_A, 'a-1', 'A first')]);

    const response = await handler(eventForSub(USER_A));
    const body = JSON.parse(response.body as string);

    expect(body.items).toHaveLength(1);
    const [item] = body.items;

    expect(item).toEqual({
      resourceId: 'a-1',
      title: 'A first',
      url: 'https://example.com/a-1',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    // The internal owner identifier is never exposed (R4.4).
    expect(item).not.toHaveProperty('ownerUserId');
    expect(Object.keys(item)).not.toContain('ownerUserId');
  });
});
