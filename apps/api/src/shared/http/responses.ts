/**
 * HTTP response helpers for the `/resources` handlers.
 *
 * Each helper returns an `APIGatewayProxyStructuredResultV2` with a
 * `Content-Type: application/json` header and a JSON-stringified body, so
 * handlers describe intent (`created(...)`, `ok(...)`) rather than repeating
 * the proxy-result shape (R1, R4).
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const JSON_CONTENT_TYPE = 'application/json';

/**
 * Build a JSON API Gateway (HTTP API v2) proxy result for an arbitrary status.
 *
 * The `body` is serialized with `JSON.stringify` and the `Content-Type` header
 * is set to `application/json`.
 *
 * @param statusCode - The HTTP status code to return.
 * @param body - The value to serialize as the JSON response body.
 */
export function json(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': JSON_CONTENT_TYPE },
    body: JSON.stringify(body),
  };
}

/**
 * Build a `201 Created` JSON response (e.g. a newly created resource) (R1).
 *
 * @param body - The value to serialize as the JSON response body.
 */
export function created(body: unknown): APIGatewayProxyStructuredResultV2 {
  return json(201, body);
}

/**
 * Build a `200 OK` JSON response (e.g. the caller's resource list) (R4).
 *
 * @param body - The value to serialize as the JSON response body.
 */
export function ok(body: unknown): APIGatewayProxyStructuredResultV2 {
  return json(200, body);
}
