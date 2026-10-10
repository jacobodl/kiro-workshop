import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { FrontendHostingStack } from '../lib/stacks/frontend-hosting-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { ApiGatewayStack } from '../lib/stacks/api-gateway-stack';

/**
 * Infrastructure assertions for the Saved Resources additions on ApiGatewayStack.
 *
 * Covers task 5.1: the SavedResourcesTable key schema (no GSI), and the two
 * JWT-protected `/resources` routes bound to the Cognito authorizer.
 *
 * The stacks are instantiated the same way as stack-dependencies.test.ts
 * (FrontendHostingStack → AuthStack → ApiGatewayAuthorizerStack).
 */
describe('ApiGatewayStack - Saved Resources infrastructure', () => {
  let template: Template;

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
  });

  /**
   * Validates: Requirements 6.2, 6.4
   * The DynamoDB table uses PK ownerUserId (HASH) / SK resourceId (RANGE),
   * both string-typed, with PAY_PER_REQUEST billing.
   */
  it('defines a DynamoDB table with ownerUserId PK and resourceId SK (string, PAY_PER_REQUEST)', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: Match.arrayWith([
        { AttributeName: 'ownerUserId', KeyType: 'HASH' },
        { AttributeName: 'resourceId', KeyType: 'RANGE' },
      ]),
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'ownerUserId', AttributeType: 'S' },
        { AttributeName: 'resourceId', AttributeType: 'S' },
      ]),
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  /**
   * Validates: Requirement 6.4
   * The saved resources table must not define any secondary indexes.
   */
  it('defines exactly one DynamoDB table with no global secondary indexes', () => {
    const tables = template.findResources('AWS::DynamoDB::Table');
    const tableEntries = Object.values(tables);

    expect(tableEntries).toHaveLength(1);

    const tableProps = tableEntries[0].Properties ?? {};
    expect(tableProps.GlobalSecondaryIndexes).toBeUndefined();
    expect(tableProps.LocalSecondaryIndexes).toBeUndefined();
  });

  /**
   * Validates: Requirements 9.2, 12.1
   * A JWT-type HTTP API authorizer (the Cognito authorizer) exists.
   */
  it('defines a JWT authorizer (Cognito) on the HTTP API', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
    });
  });

  /**
   * Validates: Requirements 9.2, 12.1
   * POST /resources exists and is bound to the JWT authorizer.
   */
  it('defines POST /resources bound to the JWT authorizer', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /resources',
      AuthorizationType: 'JWT',
      AuthorizerId: Match.anyValue(),
    });
  });

  /**
   * Validates: Requirements 9.2, 12.1
   * GET /resources exists and is bound to the JWT authorizer.
   */
  it('defines GET /resources bound to the JWT authorizer', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /resources',
      AuthorizationType: 'JWT',
      AuthorizerId: Match.anyValue(),
    });
  });

  /**
   * Validates: Requirements 9.2, 12.1
   * Both /resources routes reference the same single JWT authorizer id,
   * confirming they reuse the existing Cognito authorizer.
   */
  it('binds both /resources routes to the single JWT authorizer', () => {
    const authorizers = template.findResources(
      'AWS::ApiGatewayV2::Authorizer',
      {
        Properties: { AuthorizerType: 'JWT' },
      },
    );
    expect(Object.keys(authorizers)).toHaveLength(1);
    const authorizerLogicalId = Object.keys(authorizers)[0];

    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    const resourceRoutes = Object.values(routes).filter((route) => {
      const key = route.Properties?.RouteKey;
      return key === 'POST /resources' || key === 'GET /resources';
    });

    expect(resourceRoutes).toHaveLength(2);

    for (const route of resourceRoutes) {
      expect(route.Properties?.AuthorizationType).toBe('JWT');
      // AuthorizerId is a Ref to the authorizer logical id.
      expect(route.Properties?.AuthorizerId).toEqual({
        Ref: authorizerLogicalId,
      });
    }
  });
});
