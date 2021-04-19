import {
  RekognitionClient,
  CreateProjectCommand,
  CreateProjectCommandOutput,
  CreateProjectVersionCommand,
  CreateProjectVersionCommandOutput,
} from "@aws-sdk/client-rekognition";

interface BuildModelEvent {
  ProjectName: string;
  ManifestKey: string;
  VersionName: string;
  Region: string;
  TrainingDataBucket: string;
  OutputBucket: string;
}

interface BuildModelResult extends BuildModelEvent {
  Status: string;
}

export const lambdaHandler = async (
  event: BuildModelEvent
): Promise<BuildModelResult> => {
  // async/await.
  console.log(event);
  const projectName = event.ProjectName;
  const manifestKey = event.ManifestKey;
  const resultEvent = event as BuildModelResult;
  try {
    const rekognitionClient = new RekognitionClient({
      region: event.Region,
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
      VersionName: event.VersionName,
      OutputConfig: {
        S3Bucket: event.OutputBucket,
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
                Bucket: event.TrainingDataBucket,
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

    // process data.
  } catch (error) {
    console.error(error);
    resultEvent.Status = "error";
    return resultEvent;
  } finally {
    // finally.
    resultEvent.Status = "ok";
    return resultEvent;
  }
};
