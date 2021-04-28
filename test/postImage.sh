baseUrl=acf56c5c79f82ce12.awsglobalaccelerator.com
curl -i -X POST -H "Content-Type: multipart/form-data" -F "image=@DeepRacer.jpg" "http://$baseUrl?ProjectName=DeepRacer&VersionName=first"
# curl -X POST --data-binary @DeepRacer.jpg http://Globa-Image-1Y2KX2UBPHOL6-617453797.us-east-1.elb.amazonaws.com/DeeprRacer/first