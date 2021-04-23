import { Construct, Duration } from "@aws-cdk/core";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as lambda from "@aws-cdk/aws-lambda";
import path = require("path");
import * as iam from "@aws-cdk/aws-iam";
import { LayerVersion } from "@aws-cdk/aws-lambda";
import { RegionalStack } from "../global-management-stack";
import { RegionalData } from "../global-model-stepfunction-stack";
import { Topic } from "@aws-cdk/aws-sns";

export interface StopModelStepfunctionProps {
  maximumModelBuildTime: Number;
  RegionalStacks: RegionalStack[];
  buildModelFunctionLayer: LayerVersion;
  regionalData: RegionalData[];
  buildModelResultTopic: Topic;
}

export class StopModelStepfunctionConstruct extends Construct {
  constructor(scope: Construct, id: string, props: StopModelStepfunctionProps) {
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

    const stopModelVersionFunction = new lambda.Function(
      this,
      "StopModelVersionFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.lambdaHandler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda", "stop-model-version"),
          { exclude: ["node_modules"] }
        ),
        layers: [props.buildModelFunctionLayer],
      }
    );
    stopModelVersionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: ["rekognition:StopProjectVersion"],
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

    const stopModelVersion = new tasks.LambdaInvoke(
      this,
      "Stop Model Version",
      {
        lambdaFunction: stopModelVersionFunction,
        inputPath: "$",
        outputPath: "$.Payload",
      }
    );

    const setRegionalData = new sfn.Pass(this, "Set Regional Data", {
      comment: "Set Regional Data",
      result: { value: sfn.Result.fromArray(props.regionalData) },
      resultPath: "$.regions",
    });
    const jobFailed = new sfn.Fail(this, "Stop Model Verison Failed", {
      cause: "Project Verison Error.",
      error: "DescribeJob returned FAILED",
    });
    const waitX = new sfn.Wait(this, "Wait 5 minutes", {
      time: sfn.WaitTime.duration(Duration.minutes(5)),
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

    const stopVersionMap = new sfn.Map(this, "Stop Version Map State", {
      comment: "Parallel Map to stop regional model versions.",
      inputPath: "$",
      parameters: {
        "ProjectName.$": "$.ProjectName",
        "VersionNames.$": "$.VersionNames",
        "Region.$": "$.Region",
        "ProjectVersionArns.$": "$.ProjectVersionArns",
        "ProjectArn.$": "$.ProjectArn",
        "ProjectVersionArn.$": "$$.Map.Item.Value",
      },
      itemsPath: sfn.JsonPath.stringAt("$.ProjectVersionArns"),
    });
    const versionStatus = new sfn.Pass(this, "Version Stoped", {
      comment: "Version Stoped",
    });
    const pass = new sfn.Pass(this, "Pass", {
      comment: "Pass",
    });
    const completeParallel = new sfn.Pass(
      this,
      "Complete Parallel Stop Version",
      {
        comment: "Complete Parallel Stop Version",
      }
    );

    const notifyBuildModelCompletedTask = new tasks.SnsPublish(
      this,
      "Notify Global Custom Labels Model Task",
      {
        topic: props.buildModelResultTopic,
        subject: "Global Rekognition Custom Label Stop Version Result",
        message: sfn.TaskInput.fromJsonPathAt("$"),
      }
    );

    const stopVersionTasks = stopModelVersion
      .next(waitX)
      .next(getStatus)
      .next(
        new sfn.Choice(this, "Stop Version Complete?")
          .when(sfn.Condition.stringEquals("$.Status", "FAILED"), jobFailed)
          .when(
            sfn.Condition.numberGreaterThanEquals("$.Counter", 50),
            jobFailed
          )
          .when(
            sfn.Condition.stringEquals("$.Status", "STOPPED"),
            versionStatus
          )
          .otherwise(waitX)
      );

    stopVersionMap.iterator(stopVersionTasks);

    const parallel = new sfn.Parallel(this, "Parallel Stop Model Version", {
      outputPath: "$.[0]",
    });
    parallel.branch(pass);
    parallel.branch(stopVersionMap);
    parallel.next(completeParallel);

    const regionalTasks = getModelDetails.next(parallel);

    modelMap.iterator(regionalTasks);
    const stopModelVersionDefinition = setRegionalData
      .next(modelMap)
      .next(notifyBuildModelCompletedTask);

    const stoplobalCustomLabelsModelStateMachine = new sfn.StateMachine(
      this,
      "StopGlobalCustomLabelsModelVersionStateMachine",
      {
        stateMachineName: "StopGlobalCustomLabelsModelVersionStateMachine",
        definition: stopModelVersionDefinition,
        timeout: Duration.hours(12),
      }
    );
  }
}
