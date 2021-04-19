# Welcome to your CDK TypeScript project!

This is a blank project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
# global-rekognition-custom-labels


## Sample Command to copy dataset into management dataset bucket
Dataset will replicate to all regional dataset bucket.

aws s3 sync s3://cyrus-datasets s3://global-custom-labels-management111964674713-us-east-1 --source-region ap-east-1 


## Sample Input Data for deplying Global Rekognition Custom Labels Model

{
    "ProjectName": "DeepRacer",
  	"ManifestKey":"assets/deepracerv1r/output.manifest",
  	"VersionName": "first"
}
