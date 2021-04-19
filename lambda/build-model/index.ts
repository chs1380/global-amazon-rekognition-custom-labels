import {
  RekognitionClient,
  DescribeProjectsCommand,
  CreateProjectCommand,
  CreateProjectCommandOutput,
  CreateProjectVersionCommand,
  CreateProjectVersionCommandOutput,
  ProjectDescription,
  DescribeProjectsCommandInput,
  ProjectVersionDescription,
  DescribeProjectVersionsCommandInput,
  DescribeProjectVersionsCommand,
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
  projectVersionArn: string;
  Status: string;
}

async function getAllProjects(
  rekognitionClient: RekognitionClient
): Promise<ProjectDescription[]> {
  let projects: ProjectDescription[] = Array<ProjectDescription>();
  let params: DescribeProjectsCommandInput = { MaxResults: 50 };
  let describeProjectsCommand = new DescribeProjectsCommand(params);

  let response = await rekognitionClient.send(describeProjectsCommand);
  projects = [...projects, ...response.ProjectDescriptions!];

  while (response.NextToken) {
    params.NextToken = response.NextToken;
    describeProjectsCommand = new DescribeProjectsCommand(params);
    response = await rekognitionClient.send(describeProjectsCommand);
    projects = [...projects, ...response.ProjectDescriptions!];
  }

  return projects;
}

async function getAllVerions(
  rekognitionClient: RekognitionClient,
  projectArn: string
): Promise<ProjectVersionDescription[]> {
  let versions: ProjectVersionDescription[] = Array<ProjectVersionDescription>();
  let params: DescribeProjectVersionsCommandInput = {
    ProjectArn: projectArn,
    MaxResults: 50,
  };
  let describeProjectVersionsCommand = new DescribeProjectVersionsCommand(
    params
  );

  let response = await rekognitionClient.send(describeProjectVersionsCommand);
  versions = [...versions, ...response.ProjectVersionDescriptions!];

  while (response.NextToken) {
    params.NextToken = response.NextToken;
    describeProjectVersionsCommand = new DescribeProjectVersionsCommand(params);
    response = await rekognitionClient.send(describeProjectVersionsCommand);
    versions = [...versions, ...response.ProjectVersionDescriptions!];
  }
  console.log(versions);
  return versions;
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

    const getProjectName = (arn: string) => {
      let matches = arn.match(/:project\/[\s\S]*?\//);
      return matches![0];
    };

    const existingProject = (await getAllProjects(rekognitionClient)).find(
      (c) => getProjectName(c.ProjectArn!) === ":project/" + projectName + "/"
    );
    let projectArn: string | undefined;

    if (!existingProject) {
      const createProjectCommand = new CreateProjectCommand({
        ProjectName: projectName,
      });
      const createProjectCommandOutput: CreateProjectCommandOutput = await rekognitionClient.send(
        createProjectCommand
      );

      console.log(createProjectCommandOutput);
    } else {
      projectArn = existingProject.ProjectArn;
      const getProjectVersionName = (arn: string) => {
        let matches = arn.match(/version\/[\s\S]*?\//);
        return matches![0];
      };
      const projectVerion = (
        await getAllVerions(rekognitionClient, projectArn!)
      ).find(
        (c) =>
          getProjectVersionName(c.ProjectVersionArn!) ===
          "version/" + event.VersionName + "/"
      );
      if (projectVerion != null) {
        resultEvent.Status = projectVerion.Status!;
        resultEvent.projectVersionArn = projectVerion.ProjectVersionArn!;
        return resultEvent;
      }
    }

    const createProjectVersionCommand = new CreateProjectVersionCommand({
      ProjectArn: projectArn,
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

    resultEvent.Status = "STARTING";
    resultEvent.projectVersionArn = createProjectVersionCommandOutput.ProjectVersionArn!;
    return resultEvent;

    // process data.
  } catch (error) {
    console.error(error);
    resultEvent.Status = "FAILED";
    return resultEvent;
  }
};
