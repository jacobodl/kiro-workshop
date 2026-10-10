/**
 * Unit tests for `fetchHello` response parsing.
 *
 * Covers both supported `/hello` success shapes and the unauthorized failure:
 * - a bare JSON array at the root yields the items with an empty message;
 * - a legacy `{ message, data }` object yields items from `data` and the
 *   message from `message`;
 * - a 401 yields an `unauthorized` failure result.
 *
 * `VITE_API_URL` is stubbed via `vi.stubEnv` so `resolveApiBaseUrl()` succeeds
 * without a real environment, and the global `fetch` is stubbed to return the
 * shapes under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchHello } from './hello-client';

const API_BASE = 'https://api.example.test';
const ACCESS_TOKEN = 'test-token';

describe('fetchHello - response parsing', () => {
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

  it('parses a bare-array 200 response into items with an empty message', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: 1, name: 'Elemento 1' },
        { id: 2, name: 'Elemento 2' },
        { id: 3, name: 'Elemento 3' },
      ],
    });

    const result = await fetchHello(ACCESS_TOKEN);

    expect(result).toEqual({
      ok: true,
      message: '',
      items: [
        { id: 1, name: 'Elemento 1' },
        { id: 2, name: 'Elemento 2' },
        { id: 3, name: 'Elemento 3' },
      ],
      status: 200,
    });
  });

  it('parses a legacy { message, data } 200 response into items and message', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: 'Hola desde el backend protegido',
        data: [
          { id: 1, name: 'Elemento 1' },
          { id: 2, name: 'Elemento 2' },
        ],
        timestamp: '2024-01-01T00:00:00.000Z',
      }),
    });

    const result = await fetchHello(ACCESS_TOKEN);

    expect(result).toEqual({
      ok: true,
      message: 'Hola desde el backend protegido',
      items: [
        { id: 1, name: 'Elemento 1' },
        { id: 2, name: 'Elemento 2' },
      ],
      status: 200,
    });
  });

  it('maps a 401 response to an unauthorized failure result', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    const result = await fetchHello(ACCESS_TOKEN);

    expect(result).toEqual({ ok: false, kind: 'unauthorized', status: 401 });
  });
});
