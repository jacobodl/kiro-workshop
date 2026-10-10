import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import {
  fetchHello,
  type HelloResult,
  type HelloItem,
} from '../../lib/api/hello-client';

/**
 * Protected-API status card that automatically verifies `GET /hello`
 * (Requirements 8, 10, 11, 19).
 *
 * Behavior (task 6.1):
 * - On mount it automatically issues an authenticated `GET /hello` using the
 *   Cognito access token from `useAuth()` — no button is required for the
 *   initial verification (Requirement 8.1). The request is driven by an
 *   `attempt` counter the mount effect depends on.
 * - The request lifecycle is a small state machine:
 *   `idle → loading → success | error`. A `retry` re-enters `loading`.
 * - React 18 StrictMode double-invokes effects in development. Rather than a
 *   one-shot `started` ref (which would let the first mount's request be
 *   cancelled while the second mount is suppressed, stranding the card in
 *   `loading`), the mount effect PERFORMS the request on every run and uses a
 *   per-run `active` boolean to ignore results from a cleaned-up run. On the
 *   real (second) StrictMode mount the request fires and its result updates
 *   state; the superseded first run's `active` flag is `false`, so its late
 *   result is dropped. The `/hello` GET is idempotent, so firing twice in dev
 *   is harmless; in production the effect runs once. This guarantees the latest
 *   mount's request drives the terminal state (Requirement 10.2 — loading must
 *   not become a stuck/false state).
 * - A manual `Reintentar` re-issues the request by bumping an `attempt`
 *   counter that the effect depends on; each run gets a fresh `active` flag, so
 *   retries update state without any `AbortController` gymnastics.
 * - Status is conveyed with distinct text AND a non-color cue (a shape/weight
 *   marker rendered from CSS), never color alone (Requirement 19.4).
 * - The idle and loading phases render NOTHING in the status region; the
 *   result surfaces asynchronously only once the response arrives. The phases
 *   remain tracked internally for the state transition.
 *
 * Security: the access token and request metadata are never rendered — only the
 * human-facing `message` surfaced by `fetchHello` is shown (Requirement 9).
 *
 * Presentation (task 6.2):
 * - Idle/loading render nothing while success and error are mutually exclusive
 *   branches of a single state value, so a pending verification can never
 *   render success text concurrently (Requirements 10.2, 12.1).
 * - This is a DISCREET SUPPORT panel, not a second page title: the heading
 *   (`Estado del entorno`) is styled as a small, muted section label so it
 *   never competes with the single page `h1`.
 * - Success is a COMPACT, factual status readout rather than a prominent
 *   dashboard. It keeps the restrained positive label (`API protegida
 *   conectada`) with its non-color success marker, then a short list of facts:
 *   the authenticated session, the connected API, the `GET /hello` endpoint,
 *   the factual HTTP success status (e.g. `HTTP 200`), and the backend
 *   `message` when present (Requirements 11.1, 11.2). The received `/hello`
 *   items are tucked into a collapsed `<details>` disclosure ("Ver respuesta")
 *   so they are available on demand without dominating the panel. No raw
 *   token/claim/metadata is rendered; only the factual HTTP status code is
 *   surfaced (Requirements 9, 11.3).
 * - Failure shows a concise label distinguishing an authorization problem
 *   (401/403 → `unauthorized`) from any other failure (`error`) with a short
 *   non-sensitive explanation; the internal HTTP `status` is kept in state for
 *   the branch decision but is never shown, so no stack traces, headers, or
 *   token leak (Requirements 12.1, 12.2, 12.3).
 * - A single `Reintentar` button appears ONLY in the error branch (never after a
 *   success, and there is no permanent `Test API` button); activating it
 *   re-issues the authenticated request by bumping the `attempt` counter, which
 *   re-runs the mount effect (Requirements 12.4, 12.5).
 */

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'success'; message: string; items: HelloItem[]; status: number }
  | { phase: 'error'; kind: 'unauthorized' | 'error'; status?: number };

const SUPPORTING_TEXT =
  'Esta llamada utiliza tu sesión de Cognito para acceder a un endpoint protegido por API Gateway.';

export const ProtectedApiCard = () => {
  const auth = useAuth();
  const accessToken = auth.user?.access_token;

  const [status, setStatus] = useState<Status>({ phase: 'idle' });

  // A monotonically increasing counter that identifies the current request
  // attempt. The mount effect depends on it, so bumping it (via `Reintentar`)
  // re-runs the effect and issues a fresh request. The initial value drives the
  // automatic on-mount verification.
  const [attempt, setAttempt] = useState(0);

  // Issue the authenticated verification whenever `attempt` changes (initial
  // mount and every retry). React 18 StrictMode runs this twice on mount in
  // dev; the per-run `active` flag makes that safe — a cleaned-up run marks
  // itself inactive so its late result is ignored, while the live run always
  // updates state. The request is re-performed on each run (no one-shot guard),
  // so the real mount's request always resolves into a terminal state.
  useEffect(() => {
    // Without a token we cannot authenticate the request; surface an error
    // state rather than issuing an unauthenticated call.
    if (!accessToken) {
      setStatus({ phase: 'error', kind: 'unauthorized' });
      return;
    }

    let active = true;

    setStatus({ phase: 'loading' });

    void fetchHello(accessToken)
      .then((result: HelloResult) => {
        // A superseded (cleaned-up) run must never flip the visible state.
        if (!active) {
          return;
        }
        if (result.ok) {
          setStatus({
            phase: 'success',
            message: result.message,
            items: result.items,
            status: result.status,
          });
        } else {
          setStatus({ phase: 'error', kind: result.kind, status: result.status });
        }
      })
      .catch(() => {
        // Belt-and-suspenders: `fetchHello` is designed to always resolve, but
        // an unexpected rejection must still move us out of `loading` into a
        // terminal error state rather than hanging on `Verificando…`.
        if (!active) {
          return;
        }
        setStatus({ phase: 'error', kind: 'error' });
      });

    // Cleanup only marks this run inactive; it does NOT cancel the fetch, so a
    // StrictMode remount's own request is free to run and update state.
    return () => {
      active = false;
    };
  }, [accessToken, attempt]);

  const handleRetry = () => {
    setAttempt((a) => a + 1);
  };

  return (
    <section className="protected-api-card" aria-labelledby="protected-api-heading">
      <h2 id="protected-api-heading">Estado del entorno</h2>
      <p className="protected-api-card__supporting">{SUPPORTING_TEXT}</p>

      <div className="protected-api-card__status" aria-live="polite">
        {/*
          The idle and loading phases intentionally render nothing: the result
          appears asynchronously only once the response arrives. The phases are
          still tracked internally for the success/error state transition and
          are announced via the `aria-live` region when they resolve.
        */}

        {status.phase === 'success' && (
          <div className="protected-api-card__state protected-api-card__state--success">
            <p className="protected-api-card__label">
              <span className="protected-api-card__marker protected-api-card__marker--success" aria-hidden="true" />
              API protegida conectada
            </p>
            <ul className="env-status">
              <li className="env-status__row">
                <span className="env-status__term">Sesión</span>
                <span className="env-status__value">Autenticada</span>
              </li>
              <li className="env-status__row">
                <span className="env-status__term">Endpoint</span>
                <span className="env-status__value">GET /hello</span>
              </li>
              <li className="env-status__row">
                <span className="env-status__term">Estado HTTP</span>
                <span className="env-status__value">HTTP {status.status}</span>
              </li>
              {status.message && (
                <li className="env-status__row">
                  <span className="env-status__term">Mensaje</span>
                  <span className="env-status__value">{status.message}</span>
                </li>
              )}
            </ul>
            {status.items.length > 0 && (
              <details className="protected-api-card__details">
                <summary className="protected-api-card__details-summary">
                  Ver respuesta
                </summary>
                <p className="protected-api-card__items-caption">
                  Elementos recibidos
                </p>
                <ul className="protected-api-card__items-list">
                  {status.items.map((item) => (
                    <li key={item.id} className="protected-api-card__items-row">
                      <span className="protected-api-card__items-id">
                        {item.id}
                      </span>
                      <span className="protected-api-card__items-name">
                        {item.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {status.phase === 'error' && (
          <div className="protected-api-card__state protected-api-card__state--error">
            <p className="protected-api-card__label">
              <span className="protected-api-card__marker protected-api-card__marker--error" aria-hidden="true" />
              {status.kind === 'unauthorized'
                ? 'No autorizado para acceder a la API protegida'
                : 'No se pudo conectar con la API protegida'}
            </p>
            <p className="protected-api-card__note">
              {status.kind === 'unauthorized'
                ? 'Tu sesión no autoriza esta llamada. Vuelve a intentarlo o inicia sesión de nuevo.'
                : 'No se pudo completar la llamada. Comprueba tu conexión y vuelve a intentarlo.'}
            </p>
            <button
              type="button"
              className="protected-api-card__retry"
              onClick={handleRetry}
              aria-label="Reintentar la llamada a la API protegida"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
