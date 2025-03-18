import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';

export class LmsInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'LMSVpc', { maxAzs: 2 });

    // RDS (PostgreSQL)
    const db = new rds.DatabaseInstance(this, 'LMSDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_14 }),
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      allocatedStorage: 20,
      databaseName: 'lmsdb',
      credentials: rds.Credentials.fromGeneratedSecret('admin'),
    });

    // DynamoDB (NoSQL for course progress, etc.)
    const courseProgressTable = new dynamodb.Table(this, 'CourseProgress', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'courseId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // S3 (Course Material Storage)
    const courseMaterialBucket = new s3.Bucket(this, 'CourseMaterialBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Cognito (User Authentication)
    const userPool = new cognito.UserPool(this, 'LMSUserPool', {
      selfSignUpEnabled: true,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
    });

    // Lambda (Backend Service)
    const backendLambda = new lambda.Function(this, 'LMSLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
    });

    // API Gateway (Expose APIs)
    const api = new apigateway.LambdaRestApi(this, 'LMSApi', {
      handler: backendLambda,
      proxy: true,
    });

    // IAM Role for Lambda to access DynamoDB & S3
    backendLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:*', 's3:*'],
        resources: [courseProgressTable.tableArn, courseMaterialBucket.bucketArn],
      })
    );
  }
}
