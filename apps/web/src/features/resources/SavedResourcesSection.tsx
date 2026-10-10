import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import {
  createResource,
  listResources,
  type Resource,
  type CreateResourceResult,
  type ListResourcesResult,
} from '../../lib/api/resources-client';
import { CreateResourceForm } from './CreateResourceForm';
import { ResourceList } from './ResourceList';
import './SavedResourcesSection.css';

/**
 * Saved Resources section — the first real business surface in the
 * authenticated workspace (Requirements R5, R10, R12).
 *
 * It orchestrates two independent, local-only state machines (no global store,
 * no new state library — R10.9) over the `resources-client`:
 *
 * - list: `idle → loading → success(items) | error`. On mount it issues
 *   `listResources(token)`, reusing the `ProtectedApiCard` per-run `active`-flag
 *   pattern so React 18 StrictMode's double-invoked effect is safe: a
 *   cleaned-up run marks itself inactive and its late result is dropped, while
 *   the live run drives the terminal state (never a stuck `loading`). An empty
 *   list renders the empty state (NOT an error — R10.5).
 * - create: `idle → submitting → error` (success folds back into the list).
 *   On a successful create the returned `Resource` is PREPENDED to the
 *   in-memory `items` so it appears immediately without a reload or manual data
 *   manipulation (R10.6). On failure a clear, non-sensitive error is shown and
 *   no false success is rendered (R10.7); the form keeps the user's input.
 *
 * Security: the Cognito access token (`useAuth().user?.access_token`) is passed
 * to the client as a Bearer credential but is never rendered, logged, or
 * persisted here (R10.10, R12). The client already guarantees the token/header
 * never surface in its results.
 */

type ListState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'success'; items: Resource[] }
  | { phase: 'error'; kind: 'unauthorized' | 'error' };

type CreateState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'error'; kind: 'validation' | 'unauthorized' | 'error'; code?: string };

const SUPPORTING_TEXT =
  'Guarda enlaces útiles con un título y una URL. Solo tú puedes ver tus recursos.';

export const SavedResourcesSection = () => {
  const auth = useAuth();
  const accessToken = auth.user?.access_token;

  const [listState, setListState] = useState<ListState>({ phase: 'idle' });
  const [createState, setCreateState] = useState<CreateState>({ phase: 'idle' });

  // Bumped to re-issue the list request (initial mount + manual retry). The
  // mount effect depends on it; each run gets a fresh `active` flag.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      // Without a token the request cannot be authenticated; surface the
      // unauthorized state rather than issuing an unauthenticated call.
      setListState({ phase: 'error', kind: 'unauthorized' });
      return;
    }

    let active = true;
    setListState({ phase: 'loading' });

    void listResources(accessToken)
      .then((result: ListResourcesResult) => {
        if (!active) {
          return;
        }
        if (result.ok) {
          setListState({ phase: 'success', items: result.items });
        } else {
          setListState({ phase: 'error', kind: result.kind });
        }
      })
      .catch(() => {
        // `listResources` is designed to always resolve, but a defensive catch
        // still moves out of `loading` into a terminal error state.
        if (!active) {
          return;
        }
        setListState({ phase: 'error', kind: 'error' });
      });

    return () => {
      active = false;
    };
  }, [accessToken, attempt]);

  const handleRetryList = () => {
    setAttempt((previous) => previous + 1);
  };

  const handleCreate = async (input: { title: string; url: string }) => {
    if (!accessToken) {
      setCreateState({ phase: 'error', kind: 'unauthorized' });
      return;
    }

    setCreateState({ phase: 'submitting' });

    let result: CreateResourceResult;
    try {
      result = await createResource(accessToken, input);
    } catch {
      setCreateState({ phase: 'error', kind: 'error' });
      return;
    }

    if (!result.ok) {
      // Clear, non-sensitive error; never a false success (R10.7).
      setCreateState({ phase: 'error', kind: result.kind, code: result.code });
      return;
    }

    // Success: prepend the created resource so it appears immediately (R10.6).
    const created = result.resource;
    setCreateState({ phase: 'idle' });
    setListState((previous) => {
      if (previous.phase === 'success') {
        return { phase: 'success', items: [created, ...previous.items] };
      }
      // If the list had not resolved to success yet (e.g. a prior load error),
      // the created item still becomes the visible list so success is honest.
      return { phase: 'success', items: [created] };
    });
  };

  // The server validation code (if any) is forwarded to the form so a 400 maps
  // to the matching inline field hint.
  const serverErrorCode =
    createState.phase === 'error' && createState.kind === 'validation'
      ? createState.code
      : undefined;

  return (
    <section className="saved-resources" aria-labelledby="saved-resources-heading">
      <h2 id="saved-resources-heading">Recursos guardados</h2>
      <p className="saved-resources__supporting">{SUPPORTING_TEXT}</p>

      <CreateResourceForm
        onSubmit={handleCreate}
        submitting={createState.phase === 'submitting'}
        serverErrorCode={serverErrorCode}
      />

      {/* Create outcome announced politely; never renders a false success. */}
      <div aria-live="polite">
        {createState.phase === 'error' && (
          <p className="saved-resources__form-status">
            {createState.kind === 'unauthorized'
              ? 'Tu sesión no autoriza esta acción. Vuelve a intentarlo o inicia sesión de nuevo.'
              : createState.kind === 'validation'
                ? 'Revisa los campos: el título y la URL deben ser válidos.'
                : 'No se pudo guardar el recurso. Comprueba tu conexión y vuelve a intentarlo.'}
          </p>
        )}
      </div>

      <h3 className="saved-resources__list-heading">Tus recursos</h3>

      {/* List status + results announced politely as the state resolves. */}
      <div className="saved-resources__status" aria-live="polite">
        {listState.phase === 'loading' && (
          <p className="saved-resources__status-text">Cargando tus recursos…</p>
        )}

        {listState.phase === 'error' && (
          <>
            <p className="saved-resources__status-text">
              {listState.kind === 'unauthorized'
                ? 'No autorizado para cargar tus recursos.'
                : 'No se pudieron cargar tus recursos.'}
            </p>
            <p className="saved-resources__status-note">
              {listState.kind === 'unauthorized'
                ? 'Tu sesión no autoriza esta llamada. Vuelve a intentarlo o inicia sesión de nuevo.'
                : 'Comprueba tu conexión y vuelve a intentarlo.'}
            </p>
            <button
              type="button"
              className="saved-resources__retry"
              onClick={handleRetryList}
              aria-label="Reintentar la carga de tus recursos"
            >
              Reintentar
            </button>
          </>
        )}

        {listState.phase === 'success' && <ResourceList items={listState.items} />}
      </div>
    </section>
  );
};
