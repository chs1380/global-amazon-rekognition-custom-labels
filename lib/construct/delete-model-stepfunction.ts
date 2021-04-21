import { Construct, Duration } from "@aws-cdk/core";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as lambda from "@aws-cdk/aws-lambda";
import path = require("path");
import { ManagedPolicy } from "@aws-cdk/aws-iam";
import * as iam from "@aws-cdk/aws-iam";
import * as sns from "@aws-cdk/aws-sns";
import { LayerVersion } from "@aws-cdk/aws-lambda";
import { RegionalStack } from "../global-management-stack";
import { RegionalData } from "../global-model-stepfunction-stack";
import { Topic } from "@aws-cdk/aws-sns";

export interface DeleteModelStepfunctionProps {
  maximumModelBuildTime: Number;
  RegionalStacks: RegionalStack[];
  buildModelFunctionLayer: LayerVersion;
  regionalData: RegionalData[];
  buildModelResultTopic: Topic;
}

export class DeleteModelStepfunctionConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: DeleteModelStepfunctionProps
  ) {
    super(scope, id);
    const getModelDetailsFunction = new lambda.Function(
      this,
      "GetModelDetailsFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda", "get-model-details"),
          { exclude: ["node_modules"] }
        ),
        layers: [props.buildModelFunctionLayer],
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
      "DeleteModelFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda", "delete-model"),
          { exclude: ["node_modules"] }
        ),
        layers: [props.buildModelFunctionLayer],
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
      "DeleteModelVersionFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda", "delete-model-version"),
          { exclude: ["node_modules"] }
        ),
        layers: [props.buildModelFunctionLayer],
      }
    );
    deleteModelVersionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: ["rekognition:DeleteProjectVersion"],
      })
    );

    const checkProjectVersionFunction = new lambda.Function(
      this,
      "CheckProjectVersionFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda", "check-project-version"),
          { exclude: ["node_modules"] }
        ),
        layers: [props.buildModelFunctionLayer],
      }
    );
    checkProjectVersionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: ["rekognition:DescribeProjectVersions"],
      })
    );
    const getModelDetails = new tasks.LambdaInvoke(this, "Get Model Details", {
      lambdaFunction: getModelDetailsFunction,
      inputPath: "$",
      outputPath: "$.Payload",
    });

    const setRegionalData = new sfn.Pass(this, "Set Regional Data", {
      comment: "Set Regional Data",
      result: { value: sfn.Result.fromArray(props.regionalData) },
      resultPath: "$.regions",
    });
    const jobFailed = new sfn.Fail(this, "Delete Model Failed", {
      cause: "Project Verison Error.",
      error: "DescribeJob returned FAILED",
    });
    const waitX = new sfn.Wait(this, "Wait 5 minutes", {
      time: sfn.WaitTime.duration(Duration.seconds(5)),
    });
    const getStatus = new tasks.LambdaInvoke(this, "Get Job Status ", {
      lambdaFunction: checkProjectVersionFunction,
      inputPath: "$",
      outputPath: "$.Payload",
    });
    const modelMap = new sfn.Map(this, "Map State", {
      comment: "Parallel Map to create regional model.",
      inputPath: "$",
      parameters: {
        "ProjectName.$": "$.ProjectName",
        "VersionNames.$": "$.VersionNames",
        "Region.$": "$$.Map.Item.Value.region",
      },
      itemsPath: sfn.JsonPath.stringAt("$.regions.value"),
    });

    /*
{
  "ProjectName": "DeepRacer",
  "VersionNames": [
    "first"
  ],
  "Region": "us-east-1",
  "ProjectArn": "arn:aws:rekognition:us-east-1:111964674713:project/DeepRacer/1618824849431",
  "ProjectVersionArns": [
    "arn:aws:rekognition:us-east-1:111964674713:project/DeepRacer/version/first/1618824849554"
  ]
}
*/
    const deleteVersionMap = new sfn.Map(this, "Delete Version Map State", {
      comment: "Parallel Map to delete regional model versions.",
      inputPath: "$",
      parameters: {
        "ProjectName.$": "$.ProjectName",
        "VersionNames.$": "$.VersionNames",
        "ProjectVersionArns.$": "$.ProjectVersionArns",
        "ProjectArn.$": "$.ProjectArn",
        "ProjectVersionArn.$": "$$.Map.Item.Value.$",
      },
      itemsPath: sfn.JsonPath.stringAt("$.ProjectVersionArns"),
    });
    const finalStatus = new sfn.Pass(this, "Final", {
      comment: "Final Result",
    });
    const regionalTasks = getModelDetails
      .next(waitX)
      .next(getStatus)
      .next(
        new sfn.Choice(this, "Delete Versions Complete?")
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

    const notifyBuildModelCompletedTask = new tasks.SnsPublish(
      this,
      "Notify Global Custom Labels Model Task",
      {
        topic: props.buildModelResultTopic,
        subject:
          "Global Rekognition Custom Label Model Build Result for Project: " +
          sfn.TaskInput.fromJsonPathAt("$.[0].ProjectName") +
          ", Version: " +
          sfn.TaskInput.fromJsonPathAt("$.[0].VersionNames"),
        message: sfn.TaskInput.fromJsonPathAt("$"),
      }
    );
    modelMap.iterator(regionalTasks);
    const deleteModleDefinition = setRegionalData
      .next(modelMap)
      .next(notifyBuildModelCompletedTask);

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
