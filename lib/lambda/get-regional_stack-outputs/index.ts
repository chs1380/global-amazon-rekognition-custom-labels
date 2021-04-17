import {} from "aws-lambda";

import { Readable } from "stream";

// export const lambdaHandler = async (event: S3CreateEvent): Promise<String> => {
//   const bucketName = event.Records[0].s3.bucket.name;
//   const objectkey = event.Records[0].s3.object.key;
//   console.log(bucketName, objectkey);

//   // async/await.
//   try {
//     // process data.
//   } catch (error) {
//     console.error(error);
//     return error;
//     // error handling.
//   } finally {
//     // finally.
//     return "OK";
//   }
// };
