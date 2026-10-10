import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { FrontendHostingStack } from '../lib/stacks/frontend-hosting-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { ApiGatewayStack } from '../lib/stacks/api-gateway-stack';

/**
 * Least-privilege IAM assertions for the Saved Resources handlers (task 5.2).
 *
 * The create handler is granted `table.grantWriteData(...)` (write actions,
 * including dynamodb:PutItem, and NOT dynamodb:Query) while the list handler is
 * granted `table.grant(..., 'dynamodb:Query')` (query only, no write). This file
 * proves each function receives only the permissions it needs (R9.3) and adds a
 * lightweight regression check that the existing API surface (ApiUrl output and
 * GET /hello route) is undisturbed (R11). Full stack-name / output / CORS /
 * dependency regression lives in stack-dependencies.test.ts and runs alongside
 * this suite.
 *
 * Stacks are instantiated the same way as stack-dependencies.test.ts
 * (FrontendHostingStack → AuthStack → ApiGatewayAuthorizerStack); if that wiring
 * introduced a dependency cycle, Template.fromStack would throw in beforeAll.
 */

const WRITE_ACTIONS = [
  'dynamodb:PutItem',
  'dynamodb:UpdateItem',
  'dynamodb:DeleteItem',
  'dynamodb:BatchWriteItem',
];

/** Normalize an IAM statement Action (string or array) to a string[]. */
function toActionList(action: unknown): string[] {
  if (typeof action === 'string') {
    return [action];
  }
  if (Array.isArray(action)) {
    return action.filter((a): a is string => typeof a === 'string');
  }
  return [];
}

/** Collect the Action lists of every statement across every IAM policy. */
function collectStatementActions(template: Template): string[][] {
  const policies = template.findResources('AWS::IAM::Policy');
  const statementActions: string[][] = [];

  for (const policy of Object.values(policies)) {
    const statements = policy.Properties?.PolicyDocument?.Statement ?? [];
    for (const statement of statements) {
      statementActions.push(toActionList(statement.Action));
    }
  }

  return statementActions;
}

describe('ApiGatewayStack - Saved Resources least-privilege IAM', () => {
  let template: Template;
  let statementActions: string[][];

  beforeAll(() => {
    const app = new App();

    const frontendHostingStack = new FrontendHostingStack(
      app,
      'FrontendHostingStack',
      {},
    );

    const authStack = new AuthStack(app, 'AuthStack', {
      callbackUrls: ['http://localhost:5173/callback'],
      logoutUrls: ['http://localhost:5173/login'],
      allowedOrigins: ['http://localhost:5173'],
      domainPrefix: 'kiro-essentials-dev',
      frontendDomain: frontendHostingStack.distributionDomainName,
    });
    authStack.addDependency(frontendHostingStack);

    const apiGatewayStack = new ApiGatewayStack(
      app,
      'ApiGatewayAuthorizerStack',
      {
        userPoolId: authStack.userPool.userPoolId,
        userPoolClientId: authStack.userPoolClient.userPoolClientId,
        allowedOrigins: authStack.allowedOrigins,
      },
    );
    apiGatewayStack.addDependency(authStack);

    template = Template.fromStack(apiGatewayStack);
    statementActions = collectStatementActions(template);
  });

  /**
   * Validates: Requirement 9.3
   * The create handler is granted write access (dynamodb:PutItem present) and
   * is NOT granted dynamodb:Query — write, not query-only.
   */
  it('grants the create handler write access without dynamodb:Query', () => {
    const writeStatement = statementActions.find(
      (actions) =>
        actions.includes('dynamodb:PutItem') &&
        !actions.includes('dynamodb:Query'),
    );

    expect(
      writeStatement,
      'expected an IAM policy statement with dynamodb:PutItem and no dynamodb:Query (create fn write grant)',
    ).toBeDefined();
  });

  /**
   * Validates: Requirement 9.3
   * The list handler is granted dynamodb:Query only and NOT any write action —
   * query, not write.
   */
  it('grants the list handler query-only access without write actions', () => {
    const queryStatement = statementActions.find(
      (actions) =>
        actions.includes('dynamodb:Query') &&
        !WRITE_ACTIONS.some((writeAction) => actions.includes(writeAction)),
    );

    expect(
      queryStatement,
      'expected an IAM policy statement with dynamodb:Query and no write actions (list fn query-only grant)',
    ).toBeDefined();

    // The query-only grant should carry exactly dynamodb:Query.
    expect(queryStatement).toEqual(['dynamodb:Query']);
  });

  /**
   * Validates: Requirement 9.3
   * The two grants are distinct: no single statement mixes write access with
   * dynamodb:Query, confirming the handlers are not both given broad read/write.
   */
  it('does not grant any handler both write access and dynamodb:Query', () => {
    const overlappingStatement = statementActions.find(
      (actions) =>
        actions.includes('dynamodb:Query') &&
        WRITE_ACTIONS.some((writeAction) => actions.includes(writeAction)),
    );

    expect(
      overlappingStatement,
      'no IAM statement should combine dynamodb:Query with write actions',
    ).toBeUndefined();
  });

  /**
   * Validates: Requirement 11.4
   * Regression: the existing ApiUrl output remains present after the additions.
   */
  it('still exports the ApiUrl output', () => {
    template.hasOutput('ApiUrl', {});
  });

  /**
   * Validates: Requirement 11.2
   * Regression: the existing GET /hello route is undisturbed by the additions.
   */
  it('still defines the GET /hello route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /hello',
    });
  });
});
