import { Construct, Duration } from "@aws-cdk/core";
import { RegionalStack } from "./global-management-stack";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as lambda from "@aws-cdk/aws-lambda";
import path = require("path");
import { ManagedPolicy } from "@aws-cdk/aws-iam";
import * as iam from "@aws-cdk/aws-iam";

export interface GlobalModelStepFunctionProps {
  RegionalStacks: RegionalStack[];
}

export class GlobalModelStepFunction extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: GlobalModelStepFunctionProps
  ) {
    super(scope, id);
    const buildModelFunctionLayer = new lambda.LayerVersion(
      this,
      "BuildModelFunctionLayer",
      {
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../lambda", "build-model-layer")
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
        path.join(__dirname, "../lambda", "build-model"),
        { exclude: ["node_modules"] }
      ),
      layers: [buildModelFunctionLayer],
    });

    buildModelFunction.role!.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonRekognitionCustomLabelsFullAccess"
      )
    );
    buildModelFunction.role!.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
    );

    const checkProjectVersionFunction = new lambda.Function(
      this,
      "CheckProjectVersionFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_7,
        handler: "lambda_function.lambda_handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../lambda", "describe-model")
        ),
      }
    );
    checkProjectVersionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: [
          "rekognition:DescribeProjects",
          "rekognition:DescribeProjectVersions",
        ],
      })
    );

    const regionalData = props.RegionalStacks.map((c) => ({
      region: c.region,
      trainingDataBucket: c.trainingDataBucket.bucketName,
      outputBucket: c.outputBucket.bucketName,
    }));
    const setRegionalData = new sfn.Pass(this, "SetRegionalData", {
      comment: "Set Regional Data",
      result: { value: sfn.Result.fromArray(regionalData) },
      resultPath: "$.regions",
    });
    const map = new sfn.Map(this, "Map State", {
      comment: "Parallel Map to create regional model.",
      inputPath: "$",
      parameters: {
        "ProjectName.$": "$.ProjectName",
        "ManifestKey.$": "$.ManifestKey",
        "VersionName.$": "$.VersionName",
        "Region.$": "$$.Map.Item.Value.region",
        "TrainingDataBucket.$": "$$.Map.Item.Value.trainingDataBucket",
        "OutputBucket.$": "$$.Map.Item.Value.outputBucket",
      },
      itemsPath: sfn.JsonPath.stringAt("$.regions.value"),
    });
    const buildModelLambdaTask = new tasks.LambdaInvoke(
      this,
      "Build Model Lambda Task.",
      {
        lambdaFunction: buildModelFunction,
        inputPath: "$",
        outputPath: "$",
      }
    );
    map.iterator(buildModelLambdaTask);

    const definition = setRegionalData.next(map);
    new sfn.StateMachine(this, "GlobalCustomLabelsModelStateMachine", {
      definition,
      timeout: Duration.hours(12),
    });
  }
}
