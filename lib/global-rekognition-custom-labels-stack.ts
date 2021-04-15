import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import { CfnOutput } from "@aws-cdk/core";
import { S3EventSource } from "@aws-cdk/aws-lambda-event-sources";
import * as lambda from "@aws-cdk/aws-lambda";
import * as path from "path";

export class GlobalRekognitionCustomLabelsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const bucket = new s3.Bucket(this, "TrainingDataBucket");
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetBucketAcl", "s3:GetBucketLocation"],
        resources: [bucket.bucketArn],
        principals: [new iam.ServicePrincipal("rekognition.amazonaws.com")],
      })
    );
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:GetObjectAcl",
          "s3:GetObjectVersion",
          "s3:GetObjectTagging",
        ],
        resources: [bucket.arnForObjects("*")],
        principals: [new iam.ServicePrincipal("rekognition.amazonaws.com")],
      })
    );

    const processManifestFunctionLayer = new lambda.LayerVersion(
      this,
      "ProcessManifestFunctionLayer",
      {
        code: lambda.Code.fromAsset(
          path.join(__dirname, "lambda", "process-manifest-layer")
        ),
        compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
        license: "Apache-2.0",
        description: "A layer to test the L2 construct",
      }
    );
    const processManifestFunction = new lambda.Function(
      this,
      "ProcessManifestFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "lambda", "process-manifest"),
          { exclude: ["node_modules"] }
        ),
        layers: [processManifestFunctionLayer],
      }
    );

    processManifestFunction.addEventSource(
      new S3EventSource(bucket, {
        events: [s3.EventType.OBJECT_CREATED_PUT],
        filters: [{ suffix: ".manifest" }],
      })
    );
    bucket.grantReadWrite(processManifestFunction);

    new CfnOutput(this, "TrainingDataBucketName", {
      value: bucket.bucketName,
      description: "Training Data Bucket",
    });
  }
}
