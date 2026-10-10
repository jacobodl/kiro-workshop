/**
 * Tests for the authenticated Workshop Workspace page served at `/home`
 * inside `ProtectedRoute` (tasks 3.1 / 3.2, task 9.2).
 *
 * These are focused page-composition tests: they assert that `WorkspacePage`
 * stitches the header, welcome, protected-API card, and the Saved Resources
 * section together correctly, and that route protection and token privacy are
 * preserved. The data-fetching children (`ProtectedApiCard`,
 * `SavedResourcesSection`) are isolated from the network by stubbing their
 * clients, so these tests stay deterministic and free of env/network coupling.
 *
 * Verifies:
 * - `/home` is protected: an unauthenticated visit redirects to `/login`
 *   (ProtectedRoute, R22.1).
 * - An authenticated session renders the workspace with the identifier resolved
 *   by the existing `resolveUserIdentifier` (email → preferred_username → sub);
 *   the email claim is shown (R22.2).
 * - The new composition: the Saved Resources section (replacing the old empty
 *   state) renders alongside the preserved header/account menu, the `/hello`
 *   `ProtectedApiCard`, and the single page `h1` (R10, R11).
 * - The Cognito access token (`auth.user.access_token`) never appears anywhere
 *   in the rendered DOM (R22.9, R10).
 * - Reuses the established `vi.mock('react-oidc-context')` + `MemoryRouter`
 *   patterns used by the other auth tests (R22.12).
 */
import { render, screen, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../../lib/auth/ProtectedRoute';
import { WorkspacePage } from './WorkspacePage';

// --- Mocks ---

const SECRET_ACCESS_TOKEN = 'super-secret-access-token-value-should-never-render';

// Controllable auth mock so each test can toggle authentication state and the
// resolved profile claims. Shared by both `ProtectedRoute` and `WorkspacePage`
// (and the nested `AccountMenu` / `ProtectedApiCard` / `SavedResourcesSection`)
// via `useAuth()`.
const authState = {
  isAuthenticated: false,
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

// Keep the automatic `GET /hello` from `ProtectedApiCard` out of these page
// tests: stub the client so the mounted card never performs a real `fetch`
// (no env/network dependency) and never interferes with the assertions.
vi.mock('../../lib/api/hello-client', () => ({
  fetchHello: vi
    .fn()
    .mockResolvedValue({ ok: true, message: 'Hola', items: [] }),
}));

// Keep the automatic `GET /resources` from the mounted `SavedResourcesSection`
// out of these page tests, the same way `hello-client` is stubbed. Without this
// the section would call `resolveApiBaseUrl()` (reading `VITE_API_URL`) and
// `fetch` on mount, coupling a page-composition test to env/network. The stub
// resolves the list to a deterministic empty state so we can assert the Saved
// Resources empty-state copy renders. `createResource` is stubbed too (the form
// mounts but is never submitted here).
vi.mock('../../lib/api/resources-client', () => ({
  listResources: vi.fn().mockResolvedValue({ ok: true, items: [] }),
  createResource: vi.fn().mockResolvedValue({ ok: false, kind: 'error' }),
}));

// Keep the shared logout helper inert (invoked by the nested AccountMenu only
// on activation, which these tests never trigger).
vi.mock('../../lib/auth/logout', () => ({
  logout: vi.fn(),
}));

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="current-location">{location.pathname}</div>;
};

const renderHomeRoute = () =>
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <WorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-surface">Login</div>} />
      </Routes>
      <LocationDisplay />
    </MemoryRouter>,
  );

const asAuthenticatedUser = () => {
  authState.isAuthenticated = true;
  authState.user = {
    expired: false,
    access_token: SECRET_ACCESS_TOKEN,
    profile: {
      email: 'ada@example.com',
      preferred_username: 'ada',
      sub: 'cognito-sub-123',
    },
  };
};

describe('WorkspacePage - protected /home workspace', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.user = undefined;
    authState.removeUser = vi.fn();
  });

  it('redirects an unauthenticated visit to /login (route protection)', () => {
    authState.isAuthenticated = false;

    renderHomeRoute();

    expect(screen.getByTestId('current-location').textContent).toBe('/login');
    expect(screen.getByTestId('login-surface')).toBeInTheDocument();
    // The workspace must not render for an unauthenticated user.
    expect(
      screen.queryByRole('heading', { name: 'Bienvenido al workspace' }),
    ).not.toBeInTheDocument();
  });

  it('renders the workspace for an authenticated user with the resolved email identifier', async () => {
    asAuthenticatedUser();

    renderHomeRoute();

    // Let the auto `GET /hello` and `GET /resources` state updates from the
    // mounted ProtectedApiCard and SavedResourcesSection settle inside act() so
    // no post-render warning is emitted.
    await act(async () => {
      await Promise.resolve();
    });

    // Stayed on the protected route (no redirect).
    expect(screen.getByTestId('current-location').textContent).toBe('/home');

    // Single page heading from WelcomeSection.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Bienvenido al workspace' }),
    ).toBeInTheDocument();

    // Identifier resolved via resolveUserIdentifier (email wins over
    // preferred_username and sub) and surfaced in the header.
    const header = screen.getByRole('banner');
    expect(within(header).getByText('ada@example.com')).toBeInTheDocument();
    // The lower-priority claims are not used as the displayed identifier.
    expect(within(header).queryByText('cognito-sub-123')).not.toBeInTheDocument();
  });

  it('renders the new composition: Saved Resources section replaces the empty state while the header, account menu, protected-API card, and single h1 are preserved', async () => {
    asAuthenticatedUser();

    renderHomeRoute();

    // Let the mounted sections' on-mount requests resolve.
    await act(async () => {
      await Promise.resolve();
    });

    // Exactly one page-level h1 lives in WelcomeSection.
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Bienvenido al workspace');

    // Preserved header (banner) with the resolved identifier and the account
    // menu trigger (we assert its presence only; we never open it / log out).
    const header = screen.getByRole('banner');
    expect(within(header).getByText('ada@example.com')).toBeInTheDocument();
    expect(
      within(header).getByRole('button', { name: 'Cuenta de usuario' }),
    ).toBeInTheDocument();

    // Preserved `/hello` ProtectedApiCard: its stable section heading renders,
    // and (via the stubbed success result) its connected label resolves.
    expect(
      screen.getByRole('heading', { name: 'API protegida' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('API protegida conectada'),
    ).toBeInTheDocument();

    // New Saved Resources section renders in place of the old empty state.
    expect(
      screen.getByRole('heading', { name: 'Recursos guardados' }),
    ).toBeInTheDocument();
    // The stubbed `listResources` resolves to an empty list, so the section
    // settles on its calm empty state (NOT an error).
    expect(
      await screen.findByText(/Aún no has guardado recursos/i),
    ).toBeInTheDocument();

    // The previous WorkspaceEmptyState ("Listo para construir") is gone.
    expect(screen.queryByText('Listo para construir')).not.toBeInTheDocument();
  });

  it('never renders the access token anywhere in the DOM', async () => {
    asAuthenticatedUser();

    const { container } = renderHomeRoute();

    // Settle the auto `GET /hello` and `GET /resources` state updates inside
    // act(). The resources client is stubbed, so the token is never handed to a
    // real request or surfaced anywhere.
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.innerHTML).not.toContain(SECRET_ACCESS_TOKEN);
    expect(screen.queryByText(SECRET_ACCESS_TOKEN)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bearer/i)).not.toBeInTheDocument();
  });
});
