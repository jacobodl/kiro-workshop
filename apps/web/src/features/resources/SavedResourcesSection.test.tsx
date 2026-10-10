/**
 * Component tests for the Saved Resources surface (`SavedResourcesSection`),
 * the first real business experience in the authenticated workspace
 * (task 9.1, Requirements R10, R13).
 *
 * These exercise the full section — `CreateResourceForm` + `ResourceList`
 * composed inside `SavedResourcesSection` — against the REAL
 * `resources-client`, driving the API boundary via stubbed `VITE_API_URL`
 * (`vi.stubEnv`) and a stubbed global `fetch` (`vi.stubGlobal`), per the
 * established repository patterns. Authentication is provided by the shared
 * `vi.mock('react-oidc-context')` pattern with a controllable `authState`
 * exposing `user.access_token` and `user.profile`.
 *
 * Covered states (R10):
 * - loading → empty: `GET /resources` resolves to `{ items: [] }`; a loading
 *   indicator appears, then the empty state renders (NOT an error, R10.4/R10.5).
 * - loading → list: `GET /resources` resolves with items; titles render as
 *   links to their URLs with a readable `createdAt` (R10).
 * - create success prepends: a valid submit `POST`s and resolves `201`; the new
 *   item appears at the TOP of the list without a reload (R10.6).
 * - list failure: `GET` resolves non-2xx; a clear error is shown and no list /
 *   false success is rendered (R10.7).
 * - create failure: list ok, then `POST` resolves `400`; an error is shown and
 *   the new item does NOT appear — no false success (R10.7).
 * - token privacy: the Cognito access token never appears in the DOM (R10.10).
 *
 * Since `GET` and `POST` share the `${base}/resources` URL, the fetch stub is
 * driven by the request `method` so it is resilient to call order.
 */
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SavedResourcesSection } from './SavedResourcesSection';
import type { Resource } from '../../lib/api/resources-client';

// --- Auth mock (shared controllable state) -------------------------------

const SECRET_ACCESS_TOKEN =
  'super-secret-access-token-value-should-never-render';

const authState = {
  isAuthenticated: true,
  isLoading: false,
  user: undefined as
    | undefined
    | {
        expired?: boolean;
        access_token?: string;
        profile?: {
          email?: string;
          preferred_username?: string;
          sub: string;
        };
      },
  removeUser: vi.fn(),
};

vi.mock('react-oidc-context', () => ({
  useAuth: () => authState,
}));

// --- Fetch stub helpers ---------------------------------------------------

const API_BASE = 'https://api.example.test';

type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const jsonResponse = (status: number, body: unknown): JsonResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const methodOf = (init?: RequestInit): string =>
  (init?.method ?? 'GET').toUpperCase();

/**
 * Builds a fetch stub that returns distinct responses for the GET (list) and
 * POST (create) calls against the shared `/resources` URL. Driven by the
 * request method so it is resilient to call order.
 */
const makeFetchStub = (handlers: {
  get: () => Promise<JsonResponse> | JsonResponse;
  post?: () => Promise<JsonResponse> | JsonResponse;
}) =>
  vi.fn((_url: string, init?: RequestInit) => {
    const method = methodOf(init);
    if (method === 'POST') {
      if (!handlers.post) {
        throw new Error('Unexpected POST /resources in this test');
      }
      return Promise.resolve(handlers.post());
    }
    return Promise.resolve(handlers.get());
  });

const sampleResource: Resource = {
  resourceId: 'r-1',
  title: 'Documentación de Kiro',
  url: 'https://example.com/docs',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const secondResource: Resource = {
  resourceId: 'r-2',
  title: 'Repositorio del taller',
  url: 'https://example.com/repo',
  createdAt: '2024-02-02T12:00:00.000Z',
};

const renderSection = () =>
  render(
    <MemoryRouter>
      <SavedResourcesSection />
    </MemoryRouter>,
  );

/** Types `title` + `url` into the create form and submits "Guardar". */
const fillAndSubmit = (title: string, url: string): void => {
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: title } });
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
};

describe('SavedResourcesSection', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', API_BASE);
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.user = {
      expired: false,
      access_token: SECRET_ACCESS_TOKEN,
      profile: {
        email: 'ada@example.com',
        preferred_username: 'ada',
        sub: 'cognito-sub-123',
      },
    };
    authState.removeUser = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows a loading indicator then the empty state when the list resolves empty', async () => {
    // Defer the GET resolution so the loading state is observable first.
    let resolveGet: (value: JsonResponse) => void = () => {};
    const getPromise = new Promise<JsonResponse>((resolve) => {
      resolveGet = resolve;
    });
    const fetchStub = vi.fn((_url: string, init?: RequestInit) => {
      expect(methodOf(init)).toBe('GET');
      return getPromise;
    });
    vi.stubGlobal('fetch', fetchStub);

    renderSection();

    // Loading indicator is present before the request resolves.
    expect(screen.getByText('Cargando tus recursos…')).toBeInTheDocument();

    // Resolve the GET with an empty list.
    resolveGet(jsonResponse(200, { items: [] }));

    // Terminal state is the empty state — NOT an error.
    expect(
      await screen.findByText(/Aún no has guardado recursos/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No se pudieron cargar tus recursos.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Cargando tus recursos…'),
    ).not.toBeInTheDocument();
  });

  it('renders the caller resources as links with a readable date when the list resolves with items', async () => {
    const fetchStub = makeFetchStub({
      get: () => jsonResponse(200, { items: [sampleResource, secondResource] }),
    });
    vi.stubGlobal('fetch', fetchStub);

    renderSection();

    // Both items render; titles are links pointing at their URLs.
    const firstLink = await screen.findByRole('link', {
      name: sampleResource.title,
    });
    expect(firstLink).toHaveAttribute('href', sampleResource.url);

    const secondLink = screen.getByRole('link', { name: secondResource.title });
    expect(secondLink).toHaveAttribute('href', secondResource.url);

    // A readable createdAt is shown (prefixed by the saved-on copy).
    expect(screen.getAllByText(/Guardado el/i)).toHaveLength(2);

    // The empty state is not shown when items exist.
    expect(
      screen.queryByText(/Aún no has guardado recursos/i),
    ).not.toBeInTheDocument();
  });

  it('prepends a newly created resource to the top of the list without a reload', async () => {
    const createdResource: Resource = {
      resourceId: 'r-new',
      title: 'Nuevo recurso',
      url: 'https://example.com/nuevo',
      createdAt: '2024-03-03T09:30:00.000Z',
    };
    const fetchStub = makeFetchStub({
      get: () => jsonResponse(200, { items: [sampleResource] }),
      post: () => jsonResponse(201, createdResource),
    });
    vi.stubGlobal('fetch', fetchStub);

    renderSection();

    // Wait for the initial list to settle.
    await screen.findByRole('link', { name: sampleResource.title });

    // Fill the form with a valid title + http(s) URL and submit.
    fillAndSubmit(createdResource.title, createdResource.url);

    // The new item appears without reload.
    const newLink = await screen.findByRole('link', {
      name: createdResource.title,
    });
    expect(newLink).toHaveAttribute('href', createdResource.url);

    // It is PREPENDED: the created item is the first list entry.
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const [firstItem, secondItem] = items;
    expect(
      within(firstItem as HTMLElement).getByRole('link', {
        name: createdResource.title,
      }),
    ).toBeInTheDocument();
    expect(
      within(secondItem as HTMLElement).getByRole('link', {
        name: sampleResource.title,
      }),
    ).toBeInTheDocument();

    // No create error / false success is shown.
    expect(
      screen.queryByText(/No se pudo guardar el recurso/i),
    ).not.toBeInTheDocument();
  });

  it('shows an error and no list when the list request fails', async () => {
    const fetchStub = makeFetchStub({
      get: () => jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    });
    vi.stubGlobal('fetch', fetchStub);

    renderSection();

    expect(
      await screen.findByText('No se pudieron cargar tus recursos.'),
    ).toBeInTheDocument();

    // No list and no false "empty" success is rendered on a failure.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Aún no has guardado recursos/i),
    ).not.toBeInTheDocument();
  });

  it('shows an error and does not add the item when the create request fails', async () => {
    const fetchStub = makeFetchStub({
      get: () => jsonResponse(200, { items: [sampleResource] }),
      post: () =>
        jsonResponse(400, {
          error: { code: 'INVALID_URL', message: 'URL no válida.' },
        }),
    });
    vi.stubGlobal('fetch', fetchStub);

    renderSection();

    await screen.findByRole('link', { name: sampleResource.title });

    // Submit a client-valid title + url so the request reaches the (failing) POST.
    fillAndSubmit('Un título válido', 'https://example.com/no-sirve');

    // A clear, non-sensitive error is announced.
    expect(
      await screen.findByText(
        /Revisa los campos: el título y la URL deben ser válidos\./i,
      ),
    ).toBeInTheDocument();

    // No false success: only the original item remains; the attempted title is
    // not rendered as a saved resource link.
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
    expect(
      screen.queryByRole('link', { name: 'Un título válido' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: sampleResource.title }),
    ).toBeInTheDocument();
  });

  it('never renders the access token anywhere in the DOM', async () => {
    const fetchStub = makeFetchStub({
      get: () => jsonResponse(200, { items: [sampleResource] }),
    });
    vi.stubGlobal('fetch', fetchStub);

    const { container } = renderSection();

    // Let the list resolve to a rendered state.
    await screen.findByRole('link', { name: sampleResource.title });

    expect(container.innerHTML).not.toContain(SECRET_ACCESS_TOKEN);
    expect(screen.queryByText(SECRET_ACCESS_TOKEN)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bearer/i)).not.toBeInTheDocument();
  });
});
