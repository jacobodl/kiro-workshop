import { resolveApiBaseUrl } from './api-config';

/**
 * A single item from the `/hello` response `data` array.
 */
export type HelloItem = { id: number; name: string };

/**
 * Discriminated result of an authenticated `GET /hello` request.
 *
 * On success, the human-facing `message` AND the `data` items (each an
 * `id`/`name` pair) are surfaced to the UI, now alongside the HTTP success
 * `status` code (e.g. 200) so callers can present a factual environment-status
 * line — the access token, the `Authorization` header, and the `timestamp`
 * field of the `/hello` response are never returned.
 *
 * On failure, `kind` distinguishes an authentication/authorization problem
 * (`unauthorized`, from HTTP 401/403) from any other failure (`error`, covering
 * other non-2xx responses and network/transport errors). `status` carries the
 * HTTP status code when one is available.
 */
export type HelloResult =
  | { ok: true; message: string; items: HelloItem[]; status: number }
  | { ok: false; kind: 'unauthorized' | 'error'; status?: number };

/**
 * Performs an authenticated `GET ${baseUrl}/hello`, injecting the Cognito
 * access token as a Bearer credential. Identity is derived server-side from the
 * validated JWT, so no identity/ownership fields and no client secret are sent.
 *
 * Security: the token and the `Authorization` header are never logged, never
 * persisted, and never returned to the caller. Only the human-facing `message`
 * and the items (id/name) from a successful response are surfaced; the
 * `timestamp` and any raw token/claim/metadata are not.
 *
 * The `/hello` endpoint may return either shape, and BOTH are supported:
 *   (a) a bare JSON array of items at the root — `[{ id, name }, ...]` — in
 *       which case those entries are the items and the message is empty; or
 *   (b) a legacy object — `{ message?, data?: [{ id, name }], timestamp? }` —
 *       in which case items come from `data` and the message from `message`.
 *
 * This client only consumes the existing `/hello` endpoint; it does not change
 * its runtime contract.
 */
export const fetchHello = async (accessToken: string): Promise<HelloResult> => {
  // Outer guard: the ENTIRE body — including `resolveApiBaseUrl()`, which
  // throws when `VITE_API_URL` is missing — is wrapped so that ANY thrown error
  // or rejected promise degrades to a returned failure result rather than a
  // rejected promise. This guarantees callers (and the UI) always reach a
  // terminal state instead of hanging on an unexpected rejection.
  try {
    const baseUrl = resolveApiBaseUrl();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/hello`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
    } catch {
      // Network/transport failure: no HTTP status is available.
      return { ok: false, kind: 'error' };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, kind: 'unauthorized', status: response.status };
    }

    if (!response.ok) {
      return { ok: false, kind: 'error', status: response.status };
    }

    try {
      const body: unknown = await response.json();

      // The endpoint may return either a bare array of items at the root or a
      // legacy `{ message, data, timestamp }` object. Normalize both into a
      // raw item list plus a message before filtering.
      let rawItems: unknown[];
      let message: string;
      if (Array.isArray(body)) {
        rawItems = body;
        message = '';
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as { message?: unknown; data?: unknown };
        rawItems = Array.isArray(obj.data) ? obj.data : [];
        message = typeof obj.message === 'string' ? obj.message : '';
      } else {
        rawItems = [];
        message = '';
      }

      // Keep each entry only when it carries a numeric `id` and a string
      // `name`. Malformed entries degrade to being dropped rather than failing
      // the request.
      const items: HelloItem[] = rawItems.filter(
        (entry): entry is HelloItem =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { id?: unknown }).id === 'number' &&
          typeof (entry as { name?: unknown }).name === 'string',
      );
      return { ok: true, message, items, status: response.status };
    } catch {
      // 2xx with an unreadable/invalid body is treated as a generic failure.
      return { ok: false, kind: 'error', status: response.status };
    }
  } catch {
    // Any other unexpected failure (e.g. a missing `VITE_API_URL` making
    // `resolveApiBaseUrl()` throw) still resolves to a generic failure so the
    // promise never rejects. No status is available in this path, and the token
    // / Authorization header are never surfaced.
    return { ok: false, kind: 'error' };
  }
};
