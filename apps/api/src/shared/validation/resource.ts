/**
 * Create-resource input validation for `POST /resources`.
 *
 * `parseCreateResourceInput` parses and validates the raw Lambda event body
 * itself: it must be present, valid JSON, and a JSON object (else
 * `400 INVALID_BODY`); `title` must be non-empty after trimming (else
 * `400 INVALID_TITLE`); and `url` must parse via `new URL(url)` with an
 * `http:`/`https:` protocol (else `400 INVALID_URL`). Only the trimmed `title`
 * and validated `url` are returned; every other field — including any
 * client-supplied `resourceId`, `createdAt`, or `ownerUserId` — is ignored
 * (R1, R2, R3, R5).
 */
import { AppError } from '../errors/errors';

/** The validated, server-trusted inputs for creating a resource. */
export interface CreateResourceInput {
  /** The trimmed, non-empty resource title. */
  title: string;
  /** The validated absolute `http(s)` resource URL. */
  url: string;
}

/**
 * Parse and validate the raw Lambda event body into a `CreateResourceInput`.
 *
 * Validation rules (each failure throws an `AppError` with status `400`):
 * - missing, non-JSON, or non-object body → `INVALID_BODY`;
 * - `title` missing or empty after trimming whitespace → `INVALID_TITLE`;
 * - `url` not a valid absolute `http:`/`https:` URL → `INVALID_URL`.
 *
 * Only `title` (trimmed) and `url` (validated) are returned. Every other field
 * is ignored, and a client-supplied `resourceId`, `createdAt`, or
 * `ownerUserId` is never read (R1.3, R2.3, R3.2).
 *
 * @param rawBody - The raw API Gateway event body (`string | undefined`).
 * @throws {AppError} `400 INVALID_BODY` / `INVALID_TITLE` / `INVALID_URL`.
 */
export function parseCreateResourceInput(
  rawBody: string | undefined,
): CreateResourceInput {
  if (typeof rawBody !== 'string' || rawBody.trim().length === 0) {
    throw new AppError(400, 'INVALID_BODY', 'Request body is required.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new AppError(400, 'INVALID_BODY', 'Request body must be valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AppError(
      400,
      'INVALID_BODY',
      'Request body must be a JSON object.',
    );
  }

  const body = parsed as Record<string, unknown>;

  const rawTitle = body.title;
  if (typeof rawTitle !== 'string' || rawTitle.trim().length === 0) {
    throw new AppError(400, 'INVALID_TITLE', 'A non-empty title is required.');
  }
  const title = rawTitle.trim();

  const rawUrl = body.url;
  if (typeof rawUrl !== 'string') {
    throw new AppError(
      400,
      'INVALID_URL',
      'A valid http(s) url is required.',
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(
      400,
      'INVALID_URL',
      'A valid http(s) url is required.',
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(
      400,
      'INVALID_URL',
      'A valid http(s) url is required.',
    );
  }

  return { title, url: rawUrl };
}
