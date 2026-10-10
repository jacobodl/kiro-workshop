/**
 * Validation tests for `POST /resources` (task 3.2).
 *
 * Covers R5 (input validation + consistent errors) and R13.4: an
 * empty-after-trim `title`, a non-`http(s)`/invalid `url`, and a
 * missing/invalid/non-object JSON body each produce a `400 Bad Request` with
 * the standard error shape `{ error: { code, message } }` and the expected
 * stable `code`.
 *
 * Tested at two levels:
 * - `parseCreateResourceInput(rawBody)` directly — asserts the thrown
 *   `AppError` status (400) and `code`.
 * - the `POST /resources` handler — asserts the full `400` response
 *   (`statusCode` + parsed body shape), which is what clients observe. The
 *   event always carries a valid JWT `sub` so validation (not auth) is the
 *   failing concern.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { handler } from '../../../src/features/resources/create-resource';
import { AppError } from '../../../src/shared/errors/errors';
import { parseCreateResourceInput } from '../../../src/shared/validation/resource';

/** A stable Cognito `sub` so every event authenticates successfully. */
const OWNER_SUB = 'owner-sub-123';

/**
 * Build a minimal HTTP API v2 event carrying a valid JWT `sub` claim and the
 * given raw `body`, so the only thing that can fail is body validation.
 */
function buildEvent(
  body: string | undefined,
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    body,
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: OWNER_SUB },
          scopes: [],
        },
      },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

/** Parse a handler response body into the standard error shape. */
function parseErrorBody(
  rawBody: string | undefined,
): { error: { code: string; message: string } } {
  expect(typeof rawBody).toBe('string');
  return JSON.parse(rawBody as string);
}

beforeAll(() => {
  // Not actually needed for the 400 paths (validation throws before any
  // DynamoDB access), but set it so the handler module environment is complete.
  process.env.RESOURCES_TABLE_NAME = 'test-resources-table';
});

describe('parseCreateResourceInput — thrown AppError codes (R5)', () => {
  it('throws 400 INVALID_TITLE when title is whitespace-only (empty after trim)', () => {
    const raw = JSON.stringify({ title: '   ', url: 'https://example.com' });

    try {
      parseCreateResourceInput(raw);
      expect.unreachable('expected parseCreateResourceInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('INVALID_TITLE');
      expect(typeof appErr.message).toBe('string');
      expect(appErr.message.length).toBeGreaterThan(0);
    }
  });

  it('throws 400 INVALID_URL for a non-http(s) scheme (ftp://x)', () => {
    const raw = JSON.stringify({ title: 'Valid title', url: 'ftp://x' });

    try {
      parseCreateResourceInput(raw);
      expect.unreachable('expected parseCreateResourceInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('INVALID_URL');
    }
  });

  it('throws 400 INVALID_URL for a string that is not a URL (not-a-url)', () => {
    const raw = JSON.stringify({ title: 'Valid title', url: 'not-a-url' });

    try {
      parseCreateResourceInput(raw);
      expect.unreachable('expected parseCreateResourceInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('INVALID_URL');
    }
  });

  it('throws 400 INVALID_BODY when the body is missing (undefined)', () => {
    try {
      parseCreateResourceInput(undefined);
      expect.unreachable('expected parseCreateResourceInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('INVALID_BODY');
    }
  });

  it('throws 400 INVALID_BODY when the body is not valid JSON', () => {
    try {
      parseCreateResourceInput('not json');
      expect.unreachable('expected parseCreateResourceInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('INVALID_BODY');
    }
  });

  it('throws 400 INVALID_BODY when the JSON body is an array (non-object)', () => {
    try {
      parseCreateResourceInput('[]');
      expect.unreachable('expected parseCreateResourceInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('INVALID_BODY');
    }
  });

  it('throws 400 INVALID_BODY when the JSON body is a bare string (non-object)', () => {
    try {
      parseCreateResourceInput('"str"');
      expect.unreachable('expected parseCreateResourceInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('INVALID_BODY');
    }
  });
});

describe('POST /resources handler — 400 responses with standard error shape (R5, R13.4)', () => {
  it('returns 400 INVALID_TITLE for a whitespace-only title', async () => {
    const event = buildEvent(
      JSON.stringify({ title: '   ', url: 'https://example.com' }),
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = parseErrorBody(result.body);
    expect(body).toEqual({
      error: { code: 'INVALID_TITLE', message: expect.any(String) },
    });
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it('returns 400 INVALID_URL for a non-http(s) scheme (ftp://x)', async () => {
    const event = buildEvent(
      JSON.stringify({ title: 'Valid title', url: 'ftp://x' }),
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = parseErrorBody(result.body);
    expect(body).toEqual({
      error: { code: 'INVALID_URL', message: expect.any(String) },
    });
  });

  it('returns 400 INVALID_URL for a string that is not a URL (not-a-url)', async () => {
    const event = buildEvent(
      JSON.stringify({ title: 'Valid title', url: 'not-a-url' }),
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = parseErrorBody(result.body);
    expect(body).toEqual({
      error: { code: 'INVALID_URL', message: expect.any(String) },
    });
  });

  it('returns 400 INVALID_BODY when the body is missing (undefined)', async () => {
    const event = buildEvent(undefined);

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = parseErrorBody(result.body);
    expect(body).toEqual({
      error: { code: 'INVALID_BODY', message: expect.any(String) },
    });
  });

  it('returns 400 INVALID_BODY when the body is not valid JSON', async () => {
    const event = buildEvent('not json');

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = parseErrorBody(result.body);
    expect(body).toEqual({
      error: { code: 'INVALID_BODY', message: expect.any(String) },
    });
  });

  it('returns 400 INVALID_BODY when the JSON body is an array (non-object)', async () => {
    const event = buildEvent('[]');

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = parseErrorBody(result.body);
    expect(body).toEqual({
      error: { code: 'INVALID_BODY', message: expect.any(String) },
    });
  });

  it('returns 400 INVALID_BODY when the JSON body is a bare string (non-object)', async () => {
    const event = buildEvent('"str"');

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = parseErrorBody(result.body);
    expect(body).toEqual({
      error: { code: 'INVALID_BODY', message: expect.any(String) },
    });
  });

  it('sets Content-Type: application/json on the 400 response', async () => {
    const event = buildEvent('[]');

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});
