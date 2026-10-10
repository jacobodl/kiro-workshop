/**
 * Error model and HTTP mapping for the `/resources` handlers.
 *
 * Every error response uses the standard shape
 * `{ "error": { "code": string, "message": string } }` with a stable,
 * machine-readable `code` (R5.4). Known failures are modeled as `AppError`
 * (validation, unauthenticated); any unexpected error maps to a generic
 * `500 INTERNAL_ERROR` that never leaks internals, tokens, or stack traces
 * (R5.5).
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

import { MissingOwnerIdentityError } from '../auth/claims';
import { json } from '../http/responses';

/** The standard, machine-readable error body returned by `/resources`. */
export interface ErrorBody {
  error: {
    /** Stable, machine-readable error code (e.g. `INVALID_TITLE`). */
    code: string;
    /** Safe, human-readable message. Never contains internals or tokens. */
    message: string;
  };
}

/**
 * An application error carrying an HTTP status, a stable `code`, and a safe
 * `message`.
 *
 * Handlers and shared helpers throw `AppError` for expected failures (for
 * example validation errors with `400` codes like `INVALID_BODY`,
 * `INVALID_TITLE`, `INVALID_URL`). The `message` is always safe to surface to
 * clients — it must not include internal details, tokens, or stack traces.
 */
export class AppError extends Error {
  /** The HTTP status code to return for this error. */
  readonly statusCode: number;
  /** The stable, machine-readable error code. */
  readonly code: string;

  /**
   * @param statusCode - The HTTP status code to return.
   * @param code - A stable, machine-readable error code.
   * @param message - A safe, human-readable message (no internals/tokens).
   */
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Generic message used for unexpected failures — never leaks internals. */
const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred.';

/** Message used when the request lacks a usable validated identity. */
const UNAUTHORIZED_MESSAGE = 'Unauthorized.';

/**
 * Build the standard error body `{ error: { code, message } }` (R5.4).
 *
 * @param code - A stable, machine-readable error code.
 * @param message - A safe, human-readable message.
 */
export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

/**
 * Map an unknown error to a standard-shaped API Gateway proxy result.
 *
 * Mapping rules:
 * - `AppError` → its own `statusCode` / `code` / `message` (e.g. `400`
 *   validation errors).
 * - `MissingOwnerIdentityError` → `401 UNAUTHORIZED` with a generic message
 *   (should not happen behind the JWT authorizer).
 * - anything else → `500 INTERNAL_ERROR` with a generic message.
 *
 * The result never includes internal details, tokens, or stack traces (R5.5).
 *
 * @param err - The caught error of unknown type.
 */
export function toErrorResponse(
  err: unknown,
): APIGatewayProxyStructuredResultV2 {
  if (err instanceof AppError) {
    return json(err.statusCode, errorBody(err.code, err.message));
  }

  if (err instanceof MissingOwnerIdentityError) {
    return json(401, errorBody('UNAUTHORIZED', UNAUTHORIZED_MESSAGE));
  }

  return json(500, errorBody('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE));
}
