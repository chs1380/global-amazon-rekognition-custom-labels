import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import { CfnOutput, RemovalPolicy } from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as path from "path";
import { HttpApi, HttpMethod } from "@aws-cdk/aws-apigatewayv2";
import { LambdaProxyIntegration } from "@aws-cdk/aws-apigatewayv2-integrations";
import { ManagedPolicy } from "@aws-cdk/aws-iam";

export interface RegionalStack {
  region: string;
  stackName: string;
  trainingDataBucket: s3.Bucket;
}
interface GlobalRekognitionCustomLabelsManagementStackProps
  extends cdk.StackProps {
  regionalStacks: RegionalStack[];
}

export class GlobalRekognitionCustomLabelsManagementStack extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: GlobalRekognitionCustomLabelsManagementStackProps
  ) {
    super(scope, id, props);

    console.log(props.regionalStacks[1].trainingDataBucket.bucketArn);
    new CfnOutput(this, "testing", {
      value: props.regionalStacks[1].trainingDataBucket.bucketArn,
      description: "Training Data Bucket",
    });

    // The code that defines your stack goes here
    const trainingBucket = new s3.Bucket(this, "TrainingDataBucket", {
      bucketName:
        "global-custom-labels-management" + this.account + "-" + this.region,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const outputBucket = new s3.Bucket(this, "outputBucket", {
      bucketName:
        "global-custom-labels-management" +
        this.account +
        "-" +
        this.region +
        "-output",
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    outputBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetBucketAcl"],
        resources: [outputBucket.bucketArn],
        principals: [new iam.ServicePrincipal("rekognition.amazonaws.com")],
      })
    );
    outputBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [outputBucket.arnForObjects("*")],
        principals: [new iam.ServicePrincipal("rekognition.amazonaws.com")],
        conditions: {
          StringEquals: {
            "s3:x-amz-acl": "bucket-owner-full-control",
          },
        },
      })
    );

    trainingBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetBucketAcl", "s3:GetBucketLocation"],
        resources: [trainingBucket.bucketArn],
        principals: [new iam.ServicePrincipal("rekognition.amazonaws.com")],
      })
    );
    trainingBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:GetObjectAcl",
          "s3:GetObjectVersion",
          "s3:GetObjectTagging",
        ],
        resources: [trainingBucket.arnForObjects("*")],
        principals: [new iam.ServicePrincipal("rekognition.amazonaws.com")],
      })
    );

    const buildModelFunctionLayer = new lambda.LayerVersion(
      this,
      "BuildModelFunctionLayer",
      {
        code: lambda.Code.fromAsset(
          path.join(__dirname, "lambda", "build-model-layer")
        ),
        compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
        license: "Apache-2.0",
        description: "A layer to test the L2 construct",
      }
    );
    const buildModelFunction = new lambda.Function(this, "BuildModelFunction", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.lambdaHandler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "lambda", "build-model"),
        { exclude: ["node_modules"] }
      ),
      layers: [buildModelFunctionLayer],
      environment: {
        trainingBucket: trainingBucket.bucketName,
        outputBucket: outputBucket.bucketName,
      },
    });

    buildModelFunction.role!.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonRekognitionCustomLabelsFullAccess"
      )
    );
    buildModelFunction.role!.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
    );

    const buildModelDefaultIntegration = new LambdaProxyIntegration({
      handler: buildModelFunction,
    });
    const httpApi = new HttpApi(this, "HttpApi");
    httpApi.addRoutes({
      path: "/build",
      methods: [HttpMethod.GET],
      integration: buildModelDefaultIntegration,
    });

    // create lambda to describe model
    const describeFunction = new lambda.Function(
      this,
      "CheckProjectVersionFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_7,
        handler: "lambda_function.lambda_handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "lambda", "describe-model")
        ),
      }
    );
    describeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: [
          "rekognition:DescribeProjects",
          "rekognition:DescribeProjectVersions",
        ],
      })
    );

    new CfnOutput(this, "TrainingDataBucketName", {
      value: trainingBucket.bucketName,
      description: "Training Data Bucket",
    });
    new CfnOutput(this, "RunModelHttpApiUrl", {
      value: httpApi.url!,
      description: "Run Model Http Api Url",
    });
  }
}
