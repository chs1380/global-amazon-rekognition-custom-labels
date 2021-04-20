npm install -g npm-check-updates
find . -name package.json -not -path "*/node_modules/*" -not -path "*/cdk.out/*" -exec bash -c "ncu -u --packageFile {}" \;
# find . -name package.json -not -path "*/node_modules/*" -not -path "*/cdk.out/*" -exec bash -c "ncu -u --packageFile \$({})" \;