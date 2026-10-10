/**
 * `GET /resources` handler — list the caller's saved resources.
 *
 * Responsibilities (R4):
 * 1. Derive the owner identifier from the validated JWT claims via
 *    {@link getOwnerUserId} — never from the request body or query (R3, R4).
 * 2. Query only the caller's partition via {@link listResourcesByOwner}, which
 *    structurally returns only resources owned by that user (R4.1, R4.2).
 * 3. Map each stored item to the `Resource` projection, dropping the internal
 *    `ownerUserId` (R4.4).
 * 4. Respond `200 OK` with `{ items }` — an empty array when the caller has no
 *    resources (R4.3).
 *
 * Any thrown error (`MissingOwnerIdentityError` or an unexpected failure) is
 * mapped to the standard error shape via {@link toErrorResponse}:
 * `MissingOwnerIdentityError → 401` and anything else → `500` (R5).
 */
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import { getOwnerUserId } from '../../shared/auth/claims';
import { listResourcesByOwner } from '../../shared/dynamodb/resources-repo';
import { toErrorResponse } from '../../shared/errors/errors';
import { ok } from '../../shared/http/responses';

/**
 * The client-facing resource projection returned by the API.
 *
 * Deliberately omits the internal `ownerUserId` (R4.4).
 */
interface Resource {
  resourceId: string;
  title: string;
  url: string;
  createdAt: string;
}

/**
 * Lambda handler for `GET /resources` (HTTP API v2 with JWT authorizer).
 *
 * @param event - The validated API Gateway (HTTP API v2) event.
 * @returns A `200` response with `{ items }` (empty array when none), or a
 *   standard-shaped error response.
 */
export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ownerUserId = getOwnerUserId(event);

    const items = await listResourcesByOwner(ownerUserId);

    const resources: Resource[] = items.map(
      ({ resourceId, title, url, createdAt }) => ({
        resourceId,
        title,
        url,
        createdAt,
      }),
    );

    return ok({ items: resources });
  } catch (err) {
    return toErrorResponse(err);
  }
}
