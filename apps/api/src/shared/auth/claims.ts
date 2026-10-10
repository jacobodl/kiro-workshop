/**
 * JWT identity extraction for protected `/resources` handlers.
 *
 * The API Gateway Cognito JWT Authorizer validates the access token before a
 * handler is ever invoked, so handlers read the already-validated identity from
 * the request context — never from the request body or query string (R3, R12).
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

/**
 * Error thrown when the validated JWT claims do not carry a usable `sub`.
 *
 * This should not happen behind the JWT authorizer, but if it does the handler
 * treats it as an unauthenticated condition and maps it to `401`.
 */
export class MissingOwnerIdentityError extends Error {
  constructor(message = 'Missing owner identity in validated JWT claims') {
    super(message);
    this.name = 'MissingOwnerIdentityError';
  }
}

/**
 * Derive the owner identifier (Cognito `sub`) from the validated JWT claims.
 *
 * Reads `sub` exclusively from `event.requestContext.authorizer.jwt.claims`.
 * Identity is never taken from the request body or query parameters (R3.1).
 *
 * @throws {MissingOwnerIdentityError} when `sub` is absent or not a non-empty
 *   string — an unauthenticated condition the handler maps to `401`.
 */
export function getOwnerUserId(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): string {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;

  if (typeof sub !== 'string' || sub.trim().length === 0) {
    throw new MissingOwnerIdentityError();
  }

  return sub;
}
