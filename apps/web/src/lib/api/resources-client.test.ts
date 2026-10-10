/**
 * Unit tests for `resources-client`: `createResource` and `listResources`.
 *
 * These exercise request shaping (method, URL, Bearer header, JSON body) and
 * response parsing across the documented status mappings:
 * - create: `201` → success; `400` → validation; `401` → unauthorized; a
 *   rejected `fetch` (network/transport failure) → generic `error`;
 * - list: `200` with items and `200` with an empty list → success; `401` →
 *   unauthorized; a rejected `fetch` → generic `error`.
 *
 * `VITE_API_URL` is stubbed via `vi.stubEnv` so `resolveApiBaseUrl()` succeeds
 * without a real environment, and the global `fetch` is stubbed to return the
 * shapes under test. Every test also asserts the access token never leaks into
 * the returned result object (R10.10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createResource, listResources } from './resources-client';
import type { Resource } from './resources-client';

const API_BASE = 'https://api.example.test';
const ACCESS_TOKEN = 'super-secret-access-token';
const RESOURCES_URL = `${API_BASE}/resources`;

const sampleResource: Resource = {
  resourceId: 'r-123',
  title: 'Documentación de Kiro',
  url: 'https://example.com/docs',
  createdAt: '2024-01-01T00:00:00.000Z',
};

/**
 * Serializes a result and asserts the access token never appears anywhere in
 * it (neither as a surfaced field nor an echoed Authorization header).
 */
const assertNoToken = (result: unknown): void => {
  expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
};

describe('createResource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', API_BASE);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('posts { title, url } with a Bearer header and returns the created resource on 201', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => sampleResource,
    });

    const result = await createResource(ACCESS_TOKEN, {
      title: sampleResource.title,
      url: sampleResource.url,
    });

    expect(result).toEqual({ ok: true, resource: sampleResource });

    // Request shaping: method, URL, headers, and body.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(RESOURCES_URL);
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');

    // Body is exactly { title, url } — no ownership/identity field is sent.
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody).toEqual({
      title: sampleResource.title,
      url: sampleResource.url,
    });
    expect(parsedBody).not.toHaveProperty('ownerUserId');
    expect(parsedBody).not.toHaveProperty('resourceId');
    expect(parsedBody).not.toHaveProperty('createdAt');

    assertNoToken(result);
  });

  it('maps a 400 response to a validation failure surfacing code and message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 'INVALID_TITLE', message: 'El título es obligatorio.' },
      }),
    });

    const result = await createResource(ACCESS_TOKEN, { title: '', url: 'https://example.com' });

    expect(result).toEqual({
      ok: false,
      kind: 'validation',
      status: 400,
      code: 'INVALID_TITLE',
      message: 'El título es obligatorio.',
    });
    assertNoToken(result);
  });

  it('maps a 401 response to an unauthorized failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    const result = await createResource(ACCESS_TOKEN, {
      title: sampleResource.title,
      url: sampleResource.url,
    });

    expect(result).toEqual({ ok: false, kind: 'unauthorized', status: 401 });
    assertNoToken(result);
  });

  it('maps a network/transport failure to a generic error with no status', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await createResource(ACCESS_TOKEN, {
      title: sampleResource.title,
      url: sampleResource.url,
    });

    expect(result).toEqual({ ok: false, kind: 'error' });
    expect(result).not.toHaveProperty('status');
    assertNoToken(result);
  });
});

describe('listResources', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', API_BASE);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('gets with a Bearer header and returns items on 200', async () => {
    const secondResource: Resource = {
      resourceId: 'r-456',
      title: 'Repositorio del taller',
      url: 'https://example.com/repo',
      createdAt: '2024-02-02T12:00:00.000Z',
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [sampleResource, secondResource] }),
    });

    const result = await listResources(ACCESS_TOKEN);

    expect(result).toEqual({ ok: true, items: [sampleResource, secondResource] });

    // Request shaping: GET + Bearer header.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(RESOURCES_URL);
    expect(init.method).toBe('GET');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

    assertNoToken(result);
  });

  it('returns an empty list on a 200 with no items', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });

    const result = await listResources(ACCESS_TOKEN);

    expect(result).toEqual({ ok: true, items: [] });
    assertNoToken(result);
  });

  it('maps a 401 response to an unauthorized failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    const result = await listResources(ACCESS_TOKEN);

    expect(result).toEqual({ ok: false, kind: 'unauthorized', status: 401 });
    assertNoToken(result);
  });

  it('maps a network/transport failure to a generic error with no status', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await listResources(ACCESS_TOKEN);

    expect(result).toEqual({ ok: false, kind: 'error' });
    expect(result).not.toHaveProperty('status');
    assertNoToken(result);
  });
});
