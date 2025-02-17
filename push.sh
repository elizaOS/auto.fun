ECR_REPO="autofun-backend-repository"
GITHASH=$(git rev-parse HEAD)
REPO_AND_TAG="${ECR_REPO}:${GITHASH}"
REGION="us-east-1"
PROFILE="elizaos"

# Pull AWS account from the local AWS creds/config
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile $PROFILE)
echo "AWS Account ID: $AWS_ACCOUNT_ID"

aws ecr get-login-password --region $REGION --profile $PROFILE | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
DOCKER_BUILDKIT=1 docker buildx build --platform linux/amd64 --ssh default --no-cache -t $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_AND_TAG .
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_AND_TAG

echo "${REPO_AND_TAG}"
