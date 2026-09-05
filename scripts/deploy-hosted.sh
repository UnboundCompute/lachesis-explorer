#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'HELP'
Deploy the hosted Lachesis worker and SAM stack from immutable release inputs.

Required environment:
  WHEEL_URL          Immutable HTTPS URL for lachesis_cpg-${LACHESIS_VERSION}.whl
  WHEEL_SHA256       64-character lowercase SHA-256 for that wheel

Optional environment:
  LACHESIS_VERSION   Lachesis version (default: 0.5.1)
  AWS_REGION         AWS region (default: us-east-1)
  STACK_NAME         CloudFormation stack (default: lachesis-bundle-service)
  EXPLORER_ORIGIN    Exact Explorer origin
  ECR_REPOSITORY     Existing ECR repository (default: lachesis-worker)
  ALERT_TOPIC_ARN    SNS alarm topic ARN (default: empty)
  IMAGE_TAG          Temporary image tag (default: deploy-<git-sha>)
  RUN_HOSTED_SMOKE   Set true to run the hosted smoke test (default: false)
  SMOKE_REPOSITORY   Optional public repository URL for the smoke build

Example:
  LACHESIS_VERSION=0.5.1 \
  WHEEL_URL=https://files.pythonhosted.org/.../lachesis_cpg-0.5.1.whl \
  WHEEL_SHA256=<64-lowercase-hex> \
  ./scripts/deploy-hosted.sh
HELP
}

if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  usage
  exit 0
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
LACHESIS_VERSION="${LACHESIS_VERSION:-0.5.1}"
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-lachesis-bundle-service}"
EXPLORER_ORIGIN="${EXPLORER_ORIGIN:-https://lachesis.unboundcompute.com}"
ECR_REPOSITORY="${ECR_REPOSITORY:-lachesis-worker}"
ALERT_TOPIC_ARN="${ALERT_TOPIC_ARN:-}"
RUN_HOSTED_SMOKE="${RUN_HOSTED_SMOKE:-false}"
SMOKE_REPOSITORY="${SMOKE_REPOSITORY:-}"
IMAGE_TAG="${IMAGE_TAG:-deploy-$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)}"

: "${WHEEL_URL:?WHEEL_URL is required}"
: "${WHEEL_SHA256:?WHEEL_SHA256 is required}"

for command_name in aws docker sam; do
  command -v "$command_name" >/dev/null || {
    echo "Required command not found: $command_name" >&2
    exit 1
  }
done

case "$WHEEL_URL" in
  https://*) ;;
  *) echo "WHEEL_URL must use HTTPS" >&2; exit 1 ;;
esac
case "$WHEEL_URL" in
  *latest*|*LATEST*) echo "WHEEL_URL must identify an immutable artifact" >&2; exit 1 ;;
esac
if [[ ! "$WHEEL_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "WHEEL_SHA256 must be 64 lowercase hexadecimal characters" >&2
  exit 1
fi
if [[ "$WHEEL_URL" != *"lachesis_cpg-${LACHESIS_VERSION}"* ]]; then
  echo "WHEEL_URL does not contain Lachesis version ${LACHESIS_VERSION}" >&2
  exit 1
fi

cd "$ROOT_DIR"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_TAG="${IMAGE_TAG:-deploy-$(git rev-parse --short=12 HEAD)}"

echo "Authenticating to ECR in ${AWS_REGION}..."
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$REGISTRY"

echo "Building Lachesis ${LACHESIS_VERSION} worker image..."
docker build \
  --platform linux/amd64 \
  --provenance=false \
  --build-arg "LACHESIS_WHEEL_URL=$WHEEL_URL" \
  --build-arg "LACHESIS_WHEEL_SHA256=$WHEEL_SHA256" \
  -f services/bundle-service/worker/Dockerfile \
  -t "$REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" \
  services/bundle-service

echo "Pushing temporary image ${IMAGE_TAG}..."
docker push "$REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >/dev/null
IMAGE_DIGEST="$(aws ecr describe-images \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY" \
  --image-ids "imageTag=$IMAGE_TAG" \
  --query 'imageDetails[0].imageDigest' \
  --output text)"
if [[ -z "$IMAGE_DIGEST" || "$IMAGE_DIGEST" == "None" ]]; then
  echo "ECR did not return an image digest" >&2
  exit 1
fi
WORKER_IMAGE_URI="$REGISTRY/$ECR_REPOSITORY@${IMAGE_DIGEST}"
echo "Resolved immutable worker: $WORKER_IMAGE_URI"

echo "Building and validating SAM..."
sam build --template-file services/bundle-service/template.yaml
sam validate \
  --template-file .aws-sam/build/template.yaml \
  --region "$AWS_REGION" \
  --lint

echo "Deploying ${STACK_NAME}..."
parameter_overrides=(
  "ExplorerOrigin=$EXPLORER_ORIGIN"
  "WorkerImageUri=$WORKER_IMAGE_URI"
)
if [[ -n "$ALERT_TOPIC_ARN" ]]; then
  parameter_overrides+=("AlertTopicArn=$ALERT_TOPIC_ARN")
fi
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --resolve-image-repos \
  --parameter-overrides "${parameter_overrides[@]}" \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

API_URL="$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)"
echo "Deployed API: $API_URL"

if [[ "$RUN_HOSTED_SMOKE" == "true" ]]; then
  smoke_args=("$API_URL")
  if [[ -n "$SMOKE_REPOSITORY" ]]; then
    smoke_args+=(--build-url "$SMOKE_REPOSITORY")
  fi
  node services/bundle-service/smoke-hosted.mjs "${smoke_args[@]}"
fi

echo "Deployment complete: Lachesis ${LACHESIS_VERSION}"
