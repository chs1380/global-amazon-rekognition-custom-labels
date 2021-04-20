import { Construct, Duration } from "@aws-cdk/core";
import { RegionalStack } from "./global-management-stack";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as lambda from "@aws-cdk/aws-lambda";
import path = require("path");
import { ManagedPolicy } from "@aws-cdk/aws-iam";
import * as iam from "@aws-cdk/aws-iam";
import * as sns from "@aws-cdk/aws-sns";

export interface GlobalModelStepFunctionProps {
  maximumModelBuildTime: Number;
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

    const checkProjectVersion = new lambda.Function(
      this,
      "CheckProjectVersionFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../lambda", "check-project-version"),
          { exclude: ["node_modules"] }
        ),
        layers: [buildModelFunctionLayer],
      }
    );
    checkProjectVersion.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: ["rekognition:DescribeProjectVersions"],
      })
    );

    const buildModelResultTopic = new sns.Topic(this, "BuildModelResultTopic", {
      displayName: "Build Model Result Topic",
    });

    const regionalData = props.RegionalStacks.map((c) => ({
      region: c.region,
      trainingDataBucket: c.trainingDataBucket.bucketName,
      outputBucket: c.outputBucket.bucketName,
    }));
    const setRegionalData = new sfn.Pass(this, "Set Regional Data", {
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
    const jobFailed = new sfn.Fail(this, "Build Model Failed", {
      cause: "Project Verison Error.",
      error: "DescribeJob returned FAILED",
    });
    const waitX = new sfn.Wait(this, "Wait 5 minutes", {
      time: sfn.WaitTime.duration(Duration.minutes(5)),
    });
    const buildModelLambdaTask = new tasks.LambdaInvoke(
      this,
      "Build Model Lambda Task.",
      {
        lambdaFunction: buildModelFunction,
        inputPath: "$",
        outputPath: "$.Payload",
      }
    );
    const getStatus = new tasks.LambdaInvoke(this, "Get Job Status", {
      lambdaFunction: checkProjectVersion,
      // Pass just the field named "guid" into the Lambda, put the
      // Lambda's result in a field called "status" in the response
      inputPath: "$",
      outputPath: "$.Payload",
    });
    const finalStatus = new sfn.Pass(this, "Final", {
      comment: "Set Regional Data",
    });
    const regionalTasks = buildModelLambdaTask
      .next(waitX)
      .next(getStatus)
      .next(
        new sfn.Choice(this, "Training Complete?")
          // Look at the "status" field
          .when(sfn.Condition.stringEquals("$.Status", "FAILED"), jobFailed)
          .when(
            sfn.Condition.numberGreaterThanEquals(
              "$.Counter",
              Math.floor(+props.maximumModelBuildTime / 5)
            ),
            jobFailed
          )
          .when(
            sfn.Condition.stringEquals("$.Status", "TRAINING_COMPLETED"),
            finalStatus
          )
          .otherwise(waitX)
      );
    map.iterator(regionalTasks);

    const notifyBuildModelCompletedTask = new tasks.SnsPublish(
      this,
      "Notify Build Model Completed Task",
      {
        topic: buildModelResultTopic,
        subject:
          "Global Rekognition Custom Label Model Result for Project: " +
          sfn.TaskInput.fromJsonPathAt("$.[0].ProjectName") +
          ", Version: " +
          sfn.TaskInput.fromJsonPathAt("$.[0].VersionName"),
        message: sfn.TaskInput.fromJsonPathAt("$"),
      }
    );
    const definition = setRegionalData
      .next(map)
      .next(notifyBuildModelCompletedTask);
    new sfn.StateMachine(this, "GlobalCustomLabelsModelStateMachine", {
      definition,
      timeout: Duration.hours(12),
    });
  }
}
