import { APIGatewayEvent, ALBResult, Context } from "aws-lambda";
import {
  PutObjectCommand,
  PutObjectCommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  RekognitionClient,
  DetectCustomLabelsCommand,
  DetectCustomLabelsCommandInput,
  DetectCustomLabelsCommandOutput,
} from "@aws-sdk/client-rekognition";

import {
  LambdaClient,
  InvokeCommand,
  InvokeCommandOutput,
} from "@aws-sdk/client-lambda";

import * as parser from "lambda-multipart-parser";

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION,
});
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

const localCache = [];

export const lambdaHandler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<ALBResult> => {
  console.log(event);
  const result = await parser.parse(event);
  console.log(result.files);

  const bucketName = process.env.tempImageBucket;
  const s3Client = new S3Client({ region: process.env.AWS_REGION });
  const putObjectCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: result.files[0].filename,
    Body: result.files[0].content,
    ContentType: result.files[0].contentType,
  });

  const putObjectCommandOutput: PutObjectCommandOutput = await s3Client.send(
    putObjectCommand
  );

  const getModelEvent = {
    ProjectName: event.queryStringParameters!.ProjectName,
    VersionNames: [event.queryStringParameters!.VersionName],
    Region: process.env.AWS_REGION,
  };
  const enc = new TextEncoder();

  const invokeCommand = new InvokeCommand({
    FunctionName: process.env.getModelDetailsFunctionArn,
    Payload: enc.encode(JSON.stringify(getModelEvent)),
  });

  const InvokeCommandOutput: InvokeCommandOutput = await lambdaClient.send(
    invokeCommand
  );

  const decoder = new TextDecoder("utf-8");
  console.log(decoder.decode(InvokeCommandOutput.Payload));
  const r = JSON.parse(decoder.decode(InvokeCommandOutput.Payload));
  console.log(r);

  const detectCustomLabelsCommand: DetectCustomLabelsCommand = new DetectCustomLabelsCommand(
    {
      ProjectVersionArn: "",
      Image: { Bytes: Uint8Array.from(result.files[0].content) },
    }
  );

  const deleteProjectCommandOutput: DetectCustomLabelsCommandOutput = await rekognitionClient.send(
    detectCustomLabelsCommand
  );
  return {
    statusCode: 200,
    body: "ok",
  };
};
