# Common Prompt — Saved Resources

Copy the following prompt into Kiro.

---

Create a new feature spec called `saved-resources-foundation`.

Before creating the Spec:

1. Read the relevant `.kiro/steering` files.
2. Inspect the current repository implementation.
3. Specifically inspect the current `/home` layout and understand the separation between:
   - the primary workspace area;
   - the secondary `Environment Status` panel;
   - the `Technology Foundation` section.
4. Do not assume architecture, behavior, or dependencies that do not currently exist.

Pay particular attention to:

- the current authenticated workspace;
- the component/container that represents the primary workspace area;
- the current `Ready to evolve` empty state;
- the `Environment Status` panel;
- the current `GET /hello` behavior and representation;
- the existing Cognito/OIDC authentication flow;
- how the access token is used for protected requests;
- the API Gateway JWT Authorizer;
- the current OpenAPI contract;
- `apps/api` as the backend application workspace;
- existing CDK infrastructure and stack boundaries;
- current frontend, styling, and testing patterns.

## Context

This repository is an already functioning AWS starter.

It currently includes React + TypeScript, Cognito Managed Login, Authorization Code + PKCE, API Gateway HTTP API, Cognito JWT Authorizer, Lambda, CloudFront + private S3, AWS CDK, a protected `GET /hello` endpoint, and an authenticated home already prepared to evolve with new features.

The current home establishes a deliberate hierarchy:

```text
Welcome

┌───────────────────────────────┬─────────────────────┐
│                               │                     │
│       PRIMARY WORKSPACE       │ ENVIRONMENT STATUS  │
│                               │                     │
│       Ready to evolve         │ Authenticated       │
│                               │ GET /hello          │
│                               │ API connected       │
│                               │ View response       │
└───────────────────────────────┴─────────────────────┘

Technology Foundation
```

The primary workspace area is reserved for product features. `Environment Status` is secondary technical context and must remain secondary.

## Goal

Allow an authenticated user to save useful resources and retrieve only the resources that belong to them.

A saved resource must contain `resourceId`, `title`, `url`, and `createdAt`. `resourceId` and `createdAt` are backend-generated. Ownership must be derived from the validated Cognito identity, never from an authoritative `ownerUserId` sent by the frontend.

## MVP Scope

Implement:

```http
POST /resources
GET /resources
```

`POST /resources` accepts only `title` and `url`. The backend generates ID, timestamp, and ownership.

`GET /resources` returns only resources owned by the authenticated user.

Use DynamoDB with the simplest access pattern that satisfies this behavior. Do not add indexes, extra tables, or modeling complexity without a concrete need.

Application logic should live in the existing backend workspace, normally under `apps/api`, not as inline business logic inside CDK.

Preserve the current authentication boundary and derive the user from validated JWT claims.

At minimum validate that `title` is non-empty after trimming and that `url` is a valid HTTP/HTTPS URL.

## Frontend and Workspace Layout

Saved Resources must become the **primary content of the existing workspace area**.

Do not append the feature to the bottom of the page.

Do not place Saved Resources below `Environment Status`, below `Technology Foundation`, or after all existing home content.

Instead, **evolve/replace the existing `Ready to evolve` empty state inside the primary workspace area**.

Conceptually on desktop:

```text
Welcome

┌────────────────────────────────────┬─────────────────────┐
│                                    │                     │
│          SAVED RESOURCES           │ ENVIRONMENT STATUS  │
│                                    │                     │
│  Create resource                   │ Authenticated       │
│  [Title]                           │ GET /hello          │
│  [URL] [Save]                      │ API connected       │
│                                    │ View response       │
│  Your resources                    │                     │
│  ...                               │                     │
└────────────────────────────────────┴─────────────────────┘

Technology Foundation
```

Important rules:

- Saved Resources is the primary product feature.
- `Environment Status` remains compact and secondary.
- `GET /hello` continues to work and its details remain accessible.
- `Technology Foundation` remains secondary context.
- Do not create a second dashboard or an independent section at the bottom of the home.
- Do not add a sidebar.

On tablet/mobile:

```text
Welcome
→ Saved Resources
→ Environment Status
→ Technology Foundation
```

The user must have loading, empty, success, and error states; be able to create a resource; and immediately see existing/new resources.

Reuse current components, styles, tokens, spacing, typography, form patterns, and loading/error patterns. Avoid an unnecessarily large form if a more compact arrangement works better.

## OpenAPI and Infrastructure

OpenAPI remains the API contract source of truth and must document both endpoints, schemas, authentication, and relevant errors.

Use the existing CDK architecture. Add only infrastructure required by this feature, likely a DynamoDB table, least-privilege Lambda permissions, protected API routes, and required integrations.

Do not introduce new AWS services without a concrete requirement.

## Testing

Include focused tests for:

- creation and listing;
- backend validation;
- ownership isolation;
- frontend loading/empty/success/error states;
- Saved Resources integration inside the primary workspace area;
- preservation of `Environment Status`;
- regression of `GET /hello`;
- header, user menu, logout;
- correct mobile content order.

## Out of Scope

Do not implement editing, deletion, categories, tags, search, filters, pagination, favorites, sharing, public resources, URL previews, metadata scraping, new authentication methods, new navigation modules, or unrelated infrastructure.

## Acceptance Criteria

The Spec must verify at least that:

1. Authenticated users can create resources with title and URL.
2. IDs/timestamps are backend-generated.
3. Ownership comes from the validated JWT.
4. `GET /resources` returns only the authenticated user's resources.
5. Resources persist in DynamoDB.
6. The UI has loading, empty, success, and error states.
7. Saved Resources occupies/evolves the existing primary workspace area.
8. Saved Resources is NOT appended as a new section at the bottom of the home.
9. `Environment Status` remains visible as secondary technical context.
10. `GET /hello` continues working and its details remain accessible.
11. `Technology Foundation` remains secondary context.
12. On mobile, Saved Resources appears before `Environment Status`.
13. OpenAPI reflects the implemented contract.
14. Required infrastructure is defined with CDK and reasonable least privilege.
15. Existing Cognito, header, user menu, and logout behavior continue working.
16. No out-of-scope capabilities are introduced.

## Output for This Stage

Create only:

- `requirements.md`
- `design.md`
- `tasks.md`

Follow the process defined in `.kiro/steering`.

Do not implement yet.

Stop after generating the Spec and wait for review.
