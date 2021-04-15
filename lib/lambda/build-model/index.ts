import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  RekognitionClient,
  CreateProjectCommand,
  CreateProjectCommandOutput,
  CreateProjectVersionCommand,
  CreateProjectVersionCommandOutput,
} from "@aws-sdk/client-rekognition";

export const lambdaHandler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  // async/await.
  console.log(event);
  const projectName = event.queryStringParameters!["ProjectName"];
  const manifestKey = event.queryStringParameters!["ManifestKey"];
  try {
    const rekognitionClient = new RekognitionClient({
      region: process.env.AWS_REGION,
    });

    const createProjectCommand = new CreateProjectCommand({
      ProjectName: projectName,
    });
    const createProjectCommandOutput: CreateProjectCommandOutput = await rekognitionClient.send(
      createProjectCommand
    );

    console.log(createProjectCommandOutput);
    const createProjectVersionCommand = new CreateProjectVersionCommand({
      ProjectArn: createProjectCommandOutput.ProjectArn!,
      VersionName: "first",
      OutputConfig: {
        S3Bucket: process.env.outputBucket,
        S3KeyPrefix: "output/",
      },
      TestingData: {
        AutoCreate: true,
      },
      TrainingData: {
        Assets: [
          {
            GroundTruthManifest: {
              S3Object: {
                Bucket: process.env.trainingBucket,
                Name: manifestKey,
              },
            },
          },
        ],
      },
    });

    const createProjectVersionCommandOutput: CreateProjectVersionCommandOutput = await rekognitionClient.send(
      createProjectVersionCommand
    );
    console.log(createProjectVersionCommandOutput);
    return {
      statusCode: 200,
      body: JSON.stringify(createProjectVersionCommandOutput),
    };
    // process data.
  } catch (error) {
    console.error(error);
    return {
      statusCode: 200,
      body: JSON.stringify(error),
    };
  } finally {
    // finally.
    return "OK";
  }
};
