import { APIGatewayEvent, ALBResult, Context } from "aws-lambda";
import {
  PutObjectCommand,
  PutObjectCommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";

import * as parser from "lambda-multipart-parser";

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
  return {
    statusCode: 200,
    body: "ok",
  };
};
