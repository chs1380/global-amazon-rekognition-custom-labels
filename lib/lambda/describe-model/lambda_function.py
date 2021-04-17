import boto3
import json

def lambda_handler(event, context):

  client = boto3.client('rekognition')
  response = client.describe_projects()
  outdict = {}

  for i in range(len(response['ProjectDescriptions'])):
    print(response['ProjectDescriptions'][i]['ProjectArn'])
    projectarn = response['ProjectDescriptions'][i]['ProjectArn']
    responseversion = client.describe_project_versions(
      ProjectArn=str(projectarn)
    )
    outlist = []
    outdict.update({projectarn:outlist})

    try:
      for i in range(len(responseversion['ProjectVersionDescriptions'])):        
        VerArn = (responseversion['ProjectVersionDescriptions'][i]['ProjectVersionArn'])
        Status = (responseversion['ProjectVersionDescriptions'][i]['Status'])
        outlist.append({VerArn:Status})

    except:
      print('error') 
    print('========================================')

  return {
    'statusCode': 200,
    'body': json.dumps(outdict),
  }
