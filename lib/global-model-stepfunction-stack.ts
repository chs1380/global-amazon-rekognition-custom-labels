import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import path = require("path");
import { RegionalStack } from "./global-management-stack";
import { CreateBuiidModelStepfunctionConstruct } from "./construct/create-build-model-stepfunction";
import { DeleteModelStepfunctionConstruct } from "./construct/delete-model-stepfunction";
import * as sns from "@aws-cdk/aws-sns";

export interface RegionalData {
  region: string;
  trainingDataBucket: string;
  outputBucket: string;
}

export interface GlobalModelStepFunctionProps extends cdk.StackProps {
  maximumModelBuildTime: Number;
  RegionalStacks: RegionalStack[];
}

export class GlobalModelStepFunctionStack extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: GlobalModelStepFunctionProps
  ) {
    super(scope, id, props);
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
    const buildModelResultTopic = new sns.Topic(this, "BuildModelResultTopic", {
      displayName: "Build Model Result Topic",
    });

    const regionalData: RegionalData[] = props.RegionalStacks.map((c) => ({
      region: c.region,
      trainingDataBucket: c.trainingDataBucket.bucketName,
      outputBucket: c.outputBucket.bucketName,
    }));
    const createBuiidModelStepfunction = new CreateBuiidModelStepfunctionConstruct(
      this,
      "CreateBuiidModelStepfunctionConstruct",
      {
        ...props,
        buildModelFunctionLayer: buildModelFunctionLayer,
        regionalData,
        buildModelResultTopic,
      }
    );
    const deleteModelStepfunctionConstruct = new DeleteModelStepfunctionConstruct(
      this,
      "DeleteModelStepfunctionConstruct",
      {
        ...props,
        buildModelFunctionLayer: buildModelFunctionLayer,
        regionalData,
        buildModelResultTopic,
      }
    );
  }
}
/*
  createDeleteGlobalCustomLabelsModelStateMachine(
    regionalData: RegionalData[]
  ) {
    const getModelDetailsFunction = new lambda.Function(
      this,
      "GetModelDetailsFunction (Delete Model)",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../lambda", "get-model-details"),
          { exclude: ["node_modules"] }
        ),
        layers: [this.buildModelFunctionLayer],
      }
    );
    getModelDetailsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: [
          "rekognition:DescribeProjects",
          "rekognition:DescribeProjectVersions",
        ],
      })
    );

    const deleteModelFunction = new lambda.Function(
      this,
      "DeleteModelFunction (Delete Model)",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../lambda", "delete-model"),
          { exclude: ["node_modules"] }
        ),
        layers: [this.buildModelFunctionLayer],
      }
    );
    deleteModelFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: ["rekognition:DeleteProject"],
      })
    );
    const deleteModelVersionFunction = new lambda.Function(
      this,
      "DeleteModelVersionFunction (Delete Model)",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../lambda", "delete-model-version"),
          { exclude: ["node_modules"] }
        ),
        layers: [this.buildModelFunctionLayer],
      }
    );
    deleteModelVersionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: ["rekognition:DeleteProjectVersion"],
      })
    );
    const getModelDetails = new tasks.LambdaInvoke(
      this,
      "Get Model Details (Delete Model)",
      {
        lambdaFunction: getModelDetailsFunction,
        inputPath: "$",
        outputPath: "$.Payload",
      }
    );

    const setRegionalData = new sfn.Pass(
      this,
      "Set Regional Data (Delete Model)",
      {
        comment: "Set Regional Data",
        result: { value: sfn.Result.fromArray(regionalData) },
        resultPath: "$.regions",
      }
    );
    const jobFailed = new sfn.Fail(this, "Delete Model Failed (Delete Model)", {
      cause: "Project Verison Error.",
      error: "DescribeJob returned FAILED",
    });
    const waitX = new sfn.Wait(this, "Wait 5 minutes (Delete Model)", {
      time: sfn.WaitTime.duration(Duration.seconds(5)),
    });
    const getStatus = new tasks.LambdaInvoke(
      this,
      "Get Job Status  (Delete Model)",
      {
        lambdaFunction: this.checkProjectVersionFunction,
        inputPath: "$",
        outputPath: "$.Payload",
      }
    );
    const modelMap = new sfn.Map(this, "Map State (Delete Model)", {
      comment: "Parallel Map to create regional model.",
      inputPath: "$",
      parameters: {
        "ProjectName.$": "$.ProjectName",
        "VersionName.$": "$.VersionName",
        "Region.$": "$$.Map.Item.Value.region",
      },
      itemsPath: sfn.JsonPath.stringAt("$.regions.value"),
    });
    const finalStatus = new sfn.Pass(this, "Final (Delete Model)", {
      comment: "Final Result",
    });
    const regionalTasks = getModelDetails
      .next(waitX)
      .next(getStatus)
      .next(
        new sfn.Choice(this, "Training Complete? (Delete Model)")
          // Look at the "status" field
          .when(sfn.Condition.stringEquals("$.Status", "FAILED"), jobFailed)
          .when(
            sfn.Condition.numberGreaterThanEquals("$.Counter", 50),
            jobFailed
          )
          .when(
            sfn.Condition.stringEquals("$.Status", "TRAINING_COMPLETED"),
            finalStatus
          )
          .otherwise(waitX)
      );
    const deleteModleDefinition = setRegionalData
      .next(modelMap)
      .next(getModelDetails);
    modelMap.iterator(regionalTasks);
    const deleteGlobalCustomLabelsModelStateMachine = new sfn.StateMachine(
      this,
      "DeteleGlobalCustomLabelsModelStateMachine",
      {
        stateMachineName: "DeleteGlobalCustomLabelsModelStateMachine",
        definition: deleteModleDefinition,
        timeout: Duration.hours(12),
      }
    );
  }
}
*/
