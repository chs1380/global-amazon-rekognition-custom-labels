arn=$(aws rekognition describe-projects | jq -r ".ProjectDescriptions[0].ProjectArn")
aws rekognition delete-project --project-arn $arn