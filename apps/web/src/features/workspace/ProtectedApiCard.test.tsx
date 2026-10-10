/**
 * Tests for the automatic protected-API verification card (tasks 6.1 / 6.2,
 * task 9.3).
 *
 * Verifies (Requirements 22.5, 22.6, 22.7, 22.8):
 * - On mount the card automatically issues a single authenticated
 *   `GET /hello` carrying `Authorization: Bearer <access_token>` (R22.5).
 * - While the request is idle or in flight nothing is rendered in the status
 *   region (no loading text); the result surfaces asynchronously only once the
 *   response arrives (R22.6).
 * - A successful response renders the `/hello` items plus the connected label,
 *   for BOTH the new bare-array response shape and the legacy
 *   `{ message, data }` object shape (R22.7).
 * - A failed request never renders success; it shows an error, and the
 *   `Reintentar` button re-issues the authenticated request, which can then
 *   succeed (R22.8). A 401/403 surfaces the unauthorized-flavored error.
 *
 * Strategy: the global `fetch` is mocked so the assertions can inspect the real
 * URL + `Authorization` header produced by `fetchHello`, and `VITE_API_URL` is
 * stubbed so `resolveApiBaseUrl()` succeeds without a real environment.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProtectedApiCard } from './ProtectedApiCard';

// --- Mocks ---

const ACCESS_TOKEN = 'test-token';

// Minimal controllable auth mock providing the Cognito access token the card
// reads on mount via `useAuth()`.
const authState = {
  user: { access_token: ACCESS_TOKEN as string | undefined },
};

vi.mock('react-oidc-context', () => ({
  useAuth: () => authState,
}));

const API_BASE = 'https://api.example.test';

// Build a Response-like object for the mocked fetch using the LEGACY object
// shape `{ message, data, timestamp }`. Callers can pass a `data` array to
// exercise the item rendering; it defaults to a non-empty list so the common
// success path covers the elements grid.
const okResponse = (
  message: string,
  data: Array<{ id: number; name: string }> = [
    { id: 1, name: 'Elemento 1' },
    { id: 2, name: 'Elemento 2' },
  ],
) => ({
  ok: true,
  status: 200,
  json: async () => ({
    message,
    data,
    timestamp: '2024-01-01T00:00:00.000Z',
  }),
});

// Build a Response-like object for the mocked fetch using the NEW bare-array
// shape: the items live at the root with no wrapping object, so the resolved
// message is the empty string.
const okArrayResponse = (
  items: Array<{ id: number; name: string }> = [
    { id: 1, name: 'Elemento 1' },
    { id: 2, name: 'Elemento 2' },
    { id: 3, name: 'Elemento 3' },
  ],
) => ({
  ok: true,
  status: 200,
  json: async () => items,
});

const errorResponse = (status: number) => ({
  ok: false,
  status,
  json: async () => ({}),
});

describe('ProtectedApiCard - automatic protected /hello verification', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authState.user = { access_token: ACCESS_TOKEN };
    vi.stubEnv('VITE_API_URL', API_BASE);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('automatically issues a single GET /hello with Authorization: Bearer <token> on load (R22.5)', async () => {
    fetchMock.mockResolvedValue(okResponse('Hola desde el backend protegido'));

    render(<ProtectedApiCard />);

    // The verification fires exactly once on mount.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/hello`);
    expect((init.method ?? 'GET').toUpperCase()).toBe('GET');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.Accept).toBe('application/json');

    // Settle the resulting success state update.
    await screen.findByText('Hola desde el backend protegido');
  });

  it('renders nothing in the status region while the request is in flight (R22.6)', async () => {
    // Hold the request open so the in-flight (loading) phase is observable.
    let resolveFetch: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<ProtectedApiCard />);

    // While pending, the status region is empty: no loading text, and neither
    // the success label nor any error text is shown.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Verificando…')).not.toBeInTheDocument();
    expect(screen.queryByText('API protegida conectada')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No se pudo conectar con la API protegida'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No autorizado para acceder a la API protegida'),
    ).not.toBeInTheDocument();

    // Resolve and let the success state settle so no act() warning escapes.
    await act(async () => {
      resolveFetch(okResponse('Hola desde el backend protegido'));
      await Promise.resolve();
    });

    // Once resolved, the success label and items appear.
    expect(await screen.findByText('API protegida conectada')).toBeInTheDocument();
    expect(screen.getByText('Elemento 1')).toBeInTheDocument();
    expect(screen.queryByText('Verificando…')).not.toBeInTheDocument();
  });

  it('renders the items and the connected label on a NEW bare-array response (R22.7)', async () => {
    fetchMock.mockResolvedValue(
      okArrayResponse([
        { id: 1, name: 'Elemento 1' },
        { id: 2, name: 'Elemento 2' },
        { id: 3, name: 'Elemento 3' },
      ]),
    );

    render(<ProtectedApiCard />);

    // The connected label renders even though the bare-array shape carries no
    // message.
    expect(
      await screen.findByText('API protegida conectada'),
    ).toBeInTheDocument();

    // All three items render with their names and ids.
    expect(screen.getByText('Elementos recibidos')).toBeInTheDocument();
    expect(screen.getByText('Elemento 1')).toBeInTheDocument();
    expect(screen.getByText('Elemento 2')).toBeInTheDocument();
    expect(screen.getByText('Elemento 3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // No error branch rendered.
    expect(
      screen.queryByRole('button', { name: /Reintentar/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the message and the connected label on a successful response (R22.7)', async () => {
    fetchMock.mockResolvedValue(okResponse('Hola desde el backend protegido'));

    render(<ProtectedApiCard />);

    expect(
      await screen.findByText('API protegida conectada'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Hola desde el backend protegido'),
    ).toBeInTheDocument();
    // The factual HTTP success status is surfaced in the compact readout.
    expect(await screen.findByText('HTTP 200')).toBeInTheDocument();
    // The `data` items live inside the "Ver respuesta" disclosure (compact
    // id/name rows), still queryable by text while collapsed.
    expect(screen.getByText('Ver respuesta')).toBeInTheDocument();
    expect(screen.getByText('Elementos recibidos')).toBeInTheDocument();
    expect(screen.getByText('Elemento 1')).toBeInTheDocument();
    expect(screen.getByText('Elemento 2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // No error branch rendered.
    expect(
      screen.queryByRole('button', { name: /Reintentar/i }),
    ).not.toBeInTheDocument();
  });

  it('does not render success on failure, and Reintentar re-issues the request and can then succeed (R22.8)', async () => {
    // First attempt fails (non-ok 500), retry succeeds.
    fetchMock
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(okResponse('Hola desde el backend protegido'));

    render(<ProtectedApiCard />);

    // Error branch shown; success never rendered.
    expect(
      await screen.findByText('No se pudo conectar con la API protegida'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('API protegida conectada'),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Retry re-issues the authenticated request.
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, retryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );

    // On success the message now renders.
    expect(
      await screen.findByText('Hola desde el backend protegido'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('API protegida conectada'),
    ).toBeInTheDocument();
    // The elements grid renders from the retried response's `data` items.
    expect(await screen.findByText('Elemento 1')).toBeInTheDocument();
    expect(screen.getByText('Elemento 2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('resolves to the error state (not a perpetual loading) when fetch rejects (R22.8)', async () => {
    // A rejected fetch (e.g. transport-level failure) must still drive the card
    // to a terminal error state instead of leaving it stuck on `Verificando…`.
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<ProtectedApiCard />);

    expect(
      await screen.findByText('No se pudo conectar con la API protegida'),
    ).toBeInTheDocument();
    // The loading indicator must not persist.
    expect(screen.queryByText('Verificando…')).not.toBeInTheDocument();
    // Success is never rendered on failure.
    expect(
      screen.queryByText('API protegida conectada'),
    ).not.toBeInTheDocument();
    // The retry affordance is offered.
    expect(
      screen.getByRole('button', { name: /Reintentar/i }),
    ).toBeInTheDocument();
  });

  it('surfaces the unauthorized-flavored error on a 401 response (R22.5/401)', async () => {
    fetchMock.mockResolvedValue(errorResponse(401));

    render(<ProtectedApiCard />);

    expect(
      await screen.findByText('No autorizado para acceder a la API protegida'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('API protegida conectada'),
    ).not.toBeInTheDocument();
  });
});
