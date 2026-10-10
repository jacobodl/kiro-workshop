/**
 * Tests for the `POST /resources` create handler.
 *
 * Covers the ownership + server-generation guarantees (R1, R2, R3, R13):
 * - the persisted item's owner is the JWT `sub`, never the body value;
 * - `resourceId` and `createdAt` are generated server-side, never the body
 *   values;
 * - client-supplied `ownerUserId` / `resourceId` / `createdAt` are ignored;
 * - the `201` response projection omits `ownerUserId`.
 *
 * The DynamoDB boundary is mocked at `putResource` so the test captures the
 * exact item that would be persisted via `PutCommand`, without touching AWS.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import type { ResourceItem } from '../../../src/shared/dynamodb/resources-repo';

// Mock the repository boundary. The handler calls `putResource(item)`; the mock
// captures that item so we can assert exactly what would be sent in the
// underlying `PutCommand`.
const putResource = vi.fn<(item: ResourceItem) => Promise<void>>();

vi.mock('../../../src/shared/dynamodb/resources-repo', () => ({
  putResource: (item: ResourceItem) => putResource(item),
}));

// Import after the mock is registered so the handler binds the mocked repo.
import { handler } from '../../../src/features/resources/create-resource';

/** A representative RFC-4122 v4 UUID shape (as produced by `randomUUID`). */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const JWT_SUB = 'user-A';

/**
 * Build a representative HTTP API v2 event authenticated as `JWT_SUB`, whose
 * body carries the legitimate fields plus malicious ownership/id/timestamp
 * fields the handler must ignore.
 */
function buildEvent(
  body: Record<string, unknown>,
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: JWT_SUB },
          scopes: [],
        },
      },
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('POST /resources create handler', () => {
  beforeEach(() => {
    process.env.RESOURCES_TABLE_NAME = 'test-resources-table';
    putResource.mockReset();
    putResource.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists the JWT sub as owner and server-generated id/timestamp, ignoring client-supplied fields', async () => {
    const event = buildEvent({
      title: '  Kiro Docs  ',
      url: 'https://example.com/docs',
      // Malicious / forged fields that must be ignored (R2.3, R3.2).
      ownerUserId: 'attacker-B',
      resourceId: 'client-forged-id',
      createdAt: '1999-01-01T00:00:00.000Z',
      extraneous: 'nope',
    });

    const before = Date.now();
    const response = await handler(event);
    const after = Date.now();

    // Exactly one persistence call captured.
    expect(putResource).toHaveBeenCalledTimes(1);
    const persisted = putResource.mock.calls[0][0];

    // Owner comes from the JWT sub, never the forged body value (R3).
    expect(persisted.ownerUserId).toBe(JWT_SUB);
    expect(persisted.ownerUserId).not.toBe('attacker-B');

    // resourceId is server-generated (UUID), never the forged body value (R2).
    expect(persisted.resourceId).toMatch(UUID_V4);
    expect(persisted.resourceId).not.toBe('client-forged-id');

    // createdAt is a server-generated ISO string within the invocation window,
    // never the forged body value (R2).
    expect(persisted.createdAt).not.toBe('1999-01-01T00:00:00.000Z');
    expect(() => new Date(persisted.createdAt).toISOString()).not.toThrow();
    expect(persisted.createdAt).toBe(new Date(persisted.createdAt).toISOString());
    const persistedTime = Date.parse(persisted.createdAt);
    expect(persistedTime).toBeGreaterThanOrEqual(before);
    expect(persistedTime).toBeLessThanOrEqual(after);

    // Validated, trimmed title + url are stored.
    expect(persisted.title).toBe('Kiro Docs');
    expect(persisted.url).toBe('https://example.com/docs');
  });

  it('responds 201 with the resource projection and no ownerUserId', async () => {
    const event = buildEvent({
      title: 'Kiro Docs',
      url: 'https://example.com/docs',
      ownerUserId: 'attacker-B',
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(201);
    expect(response.headers?.['Content-Type']).toBe('application/json');

    const persisted = putResource.mock.calls[0][0];
    const payload = JSON.parse(response.body as string);

    // The response omits the internal owner identifier (R1.4).
    expect(payload).not.toHaveProperty('ownerUserId');

    // The projection mirrors what was persisted (minus ownerUserId).
    expect(payload).toEqual({
      resourceId: persisted.resourceId,
      title: persisted.title,
      url: persisted.url,
      createdAt: persisted.createdAt,
    });
    expect(payload.resourceId).toMatch(UUID_V4);
  });

  it('generates a distinct resourceId per create', async () => {
    const makeEvent = () =>
      buildEvent({ title: 'A', url: 'https://example.com' });

    const first = JSON.parse((await handler(makeEvent())).body as string);
    const second = JSON.parse((await handler(makeEvent())).body as string);

    expect(first.resourceId).not.toBe(second.resourceId);
  });
});
