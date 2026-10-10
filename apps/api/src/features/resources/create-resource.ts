/**
 * `POST /resources` handler — create a saved resource for the caller.
 *
 * Responsibilities (R1, R2, R3, R5):
 * 1. Derive the owner identifier from the validated JWT claims via
 *    {@link getOwnerUserId} — never from the request body (R3).
 * 2. Validate the request body via {@link parseCreateResourceInput}, which
 *    accepts only `title` and `url` and ignores every other field, including
 *    any client-supplied `resourceId`, `createdAt`, or `ownerUserId`
 *    (R1.3, R2.3, R3.2).
 * 3. Generate `resourceId` and `createdAt` server-side (R2).
 * 4. Persist the full item via {@link putResource} (R6).
 * 5. Respond `201 Created` with the `Resource` projection — `resourceId`,
 *    `title`, `url`, `createdAt` — and no `ownerUserId` (R1.4).
 *
 * Any thrown error (validation `AppError`, `MissingOwnerIdentityError`, or an
 * unexpected failure) is mapped to the standard error shape via
 * {@link toErrorResponse}: `MissingOwnerIdentityError → 401`, validation
 * `AppError → 400`, and anything else → `500` (R5).
 */
import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import { getOwnerUserId } from '../../shared/auth/claims';
import { putResource } from '../../shared/dynamodb/resources-repo';
import { toErrorResponse } from '../../shared/errors/errors';
import { created } from '../../shared/http/responses';
import { parseCreateResourceInput } from '../../shared/validation/resource';

/**
 * The client-facing resource projection returned by the API.
 *
 * Deliberately omits the internal `ownerUserId` (R1.4).
 */
interface Resource {
  resourceId: string;
  title: string;
  url: string;
  createdAt: string;
}

/**
 * Lambda handler for `POST /resources` (HTTP API v2 with JWT authorizer).
 *
 * @param event - The validated API Gateway (HTTP API v2) event.
 * @returns A `201` response with the created `Resource`, or a standard-shaped
 *   error response.
 */
export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ownerUserId = getOwnerUserId(event);
    const { title, url } = parseCreateResourceInput(event.body);

    const resourceId = randomUUID();
    const createdAt = new Date().toISOString();

    await putResource({ ownerUserId, resourceId, title, url, createdAt });

    const resource: Resource = { resourceId, title, url, createdAt };
    return created(resource);
  } catch (err) {
    return toErrorResponse(err);
  }
}
