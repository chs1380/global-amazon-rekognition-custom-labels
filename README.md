# global-rekognition-custom-labels
This project helps you deploy and manage Amazon Rekognition Custom Labels project globally

## Deployment
1. ./install_all_packages.sh
2. ./deploy.sh

## Sample Command to copy dataset into management dataset bucket
Dataset will replicate to all regional dataset bucket.

aws s3 sync s3://cyrus-datasets s3://global-custom-labels-management111964674713-us-east-1 --source-region ap-east-1 

manifest file will be replace the souce bucket name to the distination bucket name.


## Sample Input Data for deplying Global Rekognition Custom Labels Model
# create-build-model-stepfunction
{
    "ProjectName": "DeepRacer",
  	"ManifestKey":"assets/deepracerv1r/output.manifest",
  	"VersionName": "first"
}


# delete-model-stepfunction
{
    "ProjectName": "DeepRacer",  	
  	"VersionName": []
}