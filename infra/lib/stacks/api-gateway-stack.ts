import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';

export interface ApiGatewayStackProps extends cdk.StackProps {
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly allowedOrigins: string[];
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly apiUrl: string;

  private readonly savedResourcesTable: dynamodb.Table;

  private readonly createResourceFn: NodejsFunction;

  private readonly listResourcesFn: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, {
      ...props,
      synthesizer: new cdk.DefaultStackSynthesizer({
        generateBootstrapVersionRule: false,
      }),
    });

    // DynamoDB table for saved resources
    // PK ownerUserId / SK resourceId — queried by owner; no GSIs
    this.savedResourcesTable = new dynamodb.Table(this, 'SavedResourcesTable', {
      partitionKey: {
        name: 'ownerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'resourceId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda Function with inline code
    const helloHandler = new lambda.Function(this, 'HelloHandler', {
      functionName: 'kiro-essentials-hello-handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  try {
    const body = {
      message: "Hola desde el backend protegido",
      data: [
        { id: 1, name: "Elemento 1" },
        { id: 2, name: "Elemento 2" },
        { id: 3, name: "Elemento 3" }
      ],
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: "Error interno del servicio" })
    };
  }
};
      `.trim()),
    });

    // Saved Resources handlers sourced from apps/api (not inline).
    // NodejsFunction bundles each TypeScript entry via esbuild at synth time,
    // keeping business logic in the application workspace (R7, R9).
    // The handler entries live outside `infra`, so projectRoot/depsLockFilePath
    // point at the monorepo root (where the shared package-lock.json lives) so
    // the entries resolve under the bundling project root.
    const monorepoRoot = path.join(__dirname, '../../..');
    const apiHandlersDir = path.join(
      monorepoRoot,
      'apps/api/src/features/resources',
    );
    const depsLockFilePath = path.join(monorepoRoot, 'package-lock.json');

    this.createResourceFn = new NodejsFunction(this, 'CreateResourceFn', {
      entry: path.join(apiHandlersDir, 'create-resource.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      projectRoot: monorepoRoot,
      depsLockFilePath,
      environment: {
        RESOURCES_TABLE_NAME: this.savedResourcesTable.tableName,
      },
    });

    this.listResourcesFn = new NodejsFunction(this, 'ListResourcesFn', {
      entry: path.join(apiHandlersDir, 'list-resources.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      projectRoot: monorepoRoot,
      depsLockFilePath,
      environment: {
        RESOURCES_TABLE_NAME: this.savedResourcesTable.tableName,
      },
    });

    // JWT Authorizer configured with Cognito User Pool
    const jwtAuthorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPoolId}`,
      {
        jwtAudience: [props.userPoolClientId],
      },
    );

    // HTTP API with CORS enabled
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'kiro-essentials-api',
      corsPreflight: {
        allowOrigins: props.allowedOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.PUT, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.PATCH, apigwv2.CorsHttpMethod.DELETE],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    // Lambda integration
    const lambdaIntegration = new HttpLambdaIntegration(
      'HelloIntegration',
      helloHandler,
    );

    // Route GET /hello with JWT authorizer — demonstrates Cognito-protected access
    httpApi.addRoutes({
      path: '/hello',
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
      authorizer: jwtAuthorizer,
    });

    // Protected Saved Resources routes behind the existing Cognito JWT authorizer (R3, R12)
    httpApi.addRoutes({
      path: '/resources',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateResourceIntegration',
        this.createResourceFn,
      ),
      authorizer: jwtAuthorizer,
    });

    httpApi.addRoutes({
      path: '/resources',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'ListResourceIntegration',
        this.listResourcesFn,
      ),
      authorizer: jwtAuthorizer,
    });

    // Least-privilege IAM: create writes, list only queries (R9.3)
    this.savedResourcesTable.grantWriteData(this.createResourceFn);
    this.savedResourcesTable.grant(this.listResourcesFn, 'dynamodb:Query');

    // Store the API URL
    this.apiUrl = httpApi.url ?? '';

    // Export the API URL as CfnOutput
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url ?? '',
      description: 'URL base del API Gateway HTTP API',
    });

    // Tags on all resources (exclude IAM to avoid permission issues with PowerUserAccess)
    cdk.Tags.of(this).add('Project', 'kiro-essentials', {
      excludeResourceTypes: ['AWS::IAM::Role', 'AWS::IAM::Policy'],
    });
    cdk.Tags.of(this).add('ManagedBy', 'cdk', {
      excludeResourceTypes: ['AWS::IAM::Role', 'AWS::IAM::Policy'],
    });
  }
}
