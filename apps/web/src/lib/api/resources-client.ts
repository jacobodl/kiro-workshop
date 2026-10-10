import { resolveApiBaseUrl } from './api-config';

/**
 * A single saved resource as projected by the API. The persisted item also
 * carries an internal `ownerUserId`, but that owner key is never part of the
 * API projection and therefore never appears in this type (R1.4, R4.4).
 */
export type Resource = {
  resourceId: string;
  title: string;
  url: string;
  createdAt: string;
};

/**
 * Discriminated result of an authenticated `POST /resources` request.
 *
 * On success, the created `Resource` projection is surfaced to the UI — the
 * access token and the `Authorization` header are never returned.
 *
 * On failure, `kind` distinguishes a validation problem (`validation`, from
 * HTTP 400, carrying the backend `code`/`message` for inline field feedback),
 * an authentication/authorization problem (`unauthorized`, from HTTP 401/403),
 * and any other failure (`error`, covering other non-2xx responses, an
 * unreadable 2xx body, and network/transport errors). `status` carries the HTTP
 * status code when one is available.
 */
export type CreateResourceResult =
  | { ok: true; resource: Resource }
  | {
      ok: false;
      kind: 'validation' | 'unauthorized' | 'error';
      status?: number;
      code?: string;
      message?: string;
    };

/**
 * Discriminated result of an authenticated `GET /resources` request.
 *
 * On success, the caller's `items` (each a `Resource` projection) are surfaced.
 * On failure, `kind` distinguishes an authentication/authorization problem
 * (`unauthorized`, from HTTP 401/403) from any other failure (`error`, covering
 * other non-2xx responses, an unreadable 2xx body, and network/transport
 * errors). `status` carries the HTTP status code when one is available.
 */
export type ListResourcesResult =
  | { ok: true; items: Resource[] }
  | { ok: false; kind: 'unauthorized' | 'error'; status?: number };

/**
 * The input accepted when creating a resource. Only `title` and `url` are sent;
 * no identity/ownership field (owner is derived server-side from the validated
 * JWT) and no client secret are ever included (R12.4).
 */
export type CreateResourceInput = { title: string; url: string };

/**
 * Narrows an unknown value to a `Resource` projection, keeping it only when it
 * carries the four string fields the API guarantees. Malformed entries degrade
 * to being dropped rather than failing the request.
 */
const isResource = (entry: unknown): entry is Resource =>
  typeof entry === 'object' &&
  entry !== null &&
  typeof (entry as { resourceId?: unknown }).resourceId === 'string' &&
  typeof (entry as { title?: unknown }).title === 'string' &&
  typeof (entry as { url?: unknown }).url === 'string' &&
  typeof (entry as { createdAt?: unknown }).createdAt === 'string';

/**
 * Extracts the backend `error.code`/`error.message` from a standard error body
 * (`{ error: { code, message } }`) for inline validation feedback. Missing or
 * malformed fields degrade to `undefined` so a 400 is still surfaced.
 */
const parseErrorFields = (
  body: unknown,
): { code?: string; message?: string } => {
  if (typeof body !== 'object' || body === null) {
    return {};
  }
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) {
    return {};
  }
  const { code, message } = error as { code?: unknown; message?: unknown };
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
};

/**
 * Performs an authenticated `POST ${baseUrl}/resources`, injecting the Cognito
 * access token as a Bearer credential and sending `{ title, url }` as the JSON
 * body. Identity is derived server-side from the validated JWT, so no
 * identity/ownership field and no client secret are sent (R12.4).
 *
 * Security: the token and the `Authorization` header are never logged, never
 * persisted, and never returned to the caller (R10.10). Only the created
 * `Resource` projection from a successful response is surfaced.
 *
 * Mapping: `201` → `{ ok: true, resource }`; `400` → `validation` (surfacing
 * the backend `error.code`/`message`); `401`/`403` → `unauthorized`; any other
 * non-2xx → `error` with status; a 2xx with an unreadable body → `error`;
 * network/transport failure → `error` with no status.
 */
export const createResource = async (
  accessToken: string,
  input: CreateResourceInput,
): Promise<CreateResourceResult> => {
  // Outer guard: the ENTIRE body — including `resolveApiBaseUrl()`, which throws
  // when `VITE_API_URL` is missing — is wrapped so that ANY thrown error or
  // rejected promise degrades to a returned failure result rather than a
  // rejected promise. Callers (and the UI) always reach a terminal state.
  try {
    const baseUrl = resolveApiBaseUrl();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/resources`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: input.title, url: input.url }),
      });
    } catch {
      // Network/transport failure: no HTTP status is available.
      return { ok: false, kind: 'error' };
    }

    if (response.status === 400) {
      // Surface the backend code/message for inline field feedback. A body that
      // cannot be read still yields a validation result without those fields.
      let fields: { code?: string; message?: string } = {};
      try {
        fields = parseErrorFields(await response.json());
      } catch {
        fields = {};
      }
      return {
        ok: false,
        kind: 'validation',
        status: response.status,
        ...fields,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, kind: 'unauthorized', status: response.status };
    }

    if (!response.ok) {
      return { ok: false, kind: 'error', status: response.status };
    }

    try {
      const body: unknown = await response.json();
      if (isResource(body)) {
        return { ok: true, resource: body };
      }
      // 2xx with a body that is not a valid Resource projection.
      return { ok: false, kind: 'error', status: response.status };
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

/**
 * Performs an authenticated `GET ${baseUrl}/resources`, injecting the Cognito
 * access token as a Bearer credential. Identity is derived server-side from the
 * validated JWT, so the response is already scoped to the caller's own items;
 * no identity/ownership field is sent.
 *
 * Security: the token and the `Authorization` header are never logged, never
 * persisted, and never returned to the caller (R10.10). Only the caller's
 * `Resource` projections from a successful response are surfaced.
 *
 * Mapping: `200` → `{ ok: true, items }` (empty array when none); `401`/`403` →
 * `unauthorized`; any other non-2xx → `error` with status; a 2xx with an
 * unreadable body → `error`; network/transport failure → `error` with no
 * status.
 */
export const listResources = async (
  accessToken: string,
): Promise<ListResourcesResult> => {
  // Outer guard mirrors `createResource`: any thrown error or rejected promise
  // degrades to a returned failure result so the promise never rejects.
  try {
    const baseUrl = resolveApiBaseUrl();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/resources`, {
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
      // The list endpoint returns `{ items: Resource[] }`. Keep only entries
      // that match the `Resource` projection; malformed entries are dropped.
      const rawItems: unknown[] =
        typeof body === 'object' &&
        body !== null &&
        Array.isArray((body as { items?: unknown }).items)
          ? ((body as { items: unknown[] }).items)
          : [];
      const items: Resource[] = rawItems.filter(isResource);
      return { ok: true, items };
    } catch {
      // 2xx with an unreadable/invalid body is treated as a generic failure.
      return { ok: false, kind: 'error', status: response.status };
    }
  } catch {
    // Any other unexpected failure still resolves to a generic failure so the
    // promise never rejects. The token / Authorization header are never
    // surfaced.
    return { ok: false, kind: 'error' };
  }
};
