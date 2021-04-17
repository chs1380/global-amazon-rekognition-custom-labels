import { Construct } from "@aws-cdk/core";
import { RegionalStack } from "./global-rekognition-custom-labels-management-stack";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as lambda from "@aws-cdk/aws-lambda";

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
  }
}
