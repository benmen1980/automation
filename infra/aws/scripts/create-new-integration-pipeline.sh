#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME=""
RUNTIME="lambda"
BRANCH="${BRANCH:-master}"
GITHUB_OWNER="${GITHUB_OWNER:-benmen1980}"
GITHUB_REPO="${GITHUB_REPO:-automation}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
CODECONNECTION_ARN="${CODECONNECTION_ARN:-}"
API_QUEUE_ENV_SUFFIX="${API_QUEUE_ENV_SUFFIX:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --integration) INTEGRATION_NAME="${2:?}"; shift 2 ;;
    --runtime) RUNTIME="${2:?}"; shift 2 ;;
    --branch) BRANCH="${2:?}"; shift 2 ;;
    --github-owner) GITHUB_OWNER="${2:?}"; shift 2 ;;
    --github-repo) GITHUB_REPO="${2:?}"; shift 2 ;;
    --codeconnection-arn) CODECONNECTION_ARN="${2:?}"; shift 2 ;;
    --api-queue-env-suffix) API_QUEUE_ENV_SUFFIX="${2:?}"; shift 2 ;;
    --region) AWS_REGION="${2:?}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${INTEGRATION_NAME}" ]]; then
  echo "Usage: create-new-integration-pipeline.sh --integration <name> [--runtime lambda|fargate] [--branch master]" >&2
  exit 2
fi

if [[ "${RUNTIME}" != "lambda" && "${RUNTIME}" != "fargate" ]]; then
  echo "--runtime must be lambda or fargate" >&2
  exit 2
fi

: "${CODECONNECTION_ARN:?Pass --codeconnection-arn or set CODECONNECTION_ARN.}"
: "${PIPELINE_ROLE_ARN:?Set PIPELINE_ROLE_ARN.}"
: "${CODEBUILD_ROLE_ARN:?Set CODEBUILD_ROLE_ARN.}"
: "${ARTIFACT_BUCKET:?Set ARTIFACT_BUCKET.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ID="${GITHUB_OWNER}/${GITHUB_REPO}"
export AWS_REGION BRANCH CODECONNECTION_ARN PIPELINE_ROLE_ARN CODEBUILD_ROLE_ARN ARTIFACT_BUCKET REPO_ID
export API_QUEUE_ENV_SUFFIX="${API_QUEUE_ENV_SUFFIX:-$(echo "${INTEGRATION_NAME}" | tr '[:lower:]-' '[:upper:]_')}"

"${SCRIPT_DIR}/create-sqs-for-integration.sh" "${INTEGRATION_NAME}"
"${SCRIPT_DIR}/create-dynamodb-finalization-for-integration.sh" "${INTEGRATION_NAME}"

if [[ "${RUNTIME}" == "lambda" ]]; then
  : "${LAMBDA_ROLE_ARN:?Set LAMBDA_ROLE_ARN.}"
  : "${WORKER_CALLBACK_TOKEN_SECRET_ID:?Set WORKER_CALLBACK_TOKEN_SECRET_ID.}"
  QUEUE_URL=$(aws sqs get-queue-url --queue-name "${INTEGRATION_NAME}-queue" --region "${AWS_REGION}" --query QueueUrl --output text)
  export SQS_QUEUE_ARN
  SQS_QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "${QUEUE_URL}" --attribute-names QueueArn --region "${AWS_REGION}" --query 'Attributes.QueueArn' --output text)
  "${SCRIPT_DIR}/create-lambda-integration.sh" "${INTEGRATION_NAME}"
else
  "${SCRIPT_DIR}/create-fargate-integration.sh" "${INTEGRATION_NAME}"
fi

"${SCRIPT_DIR}/create-pipeline-integration.sh" "${INTEGRATION_NAME}"
echo "Provisioned independent ${RUNTIME} resources and pipeline for ${INTEGRATION_NAME}."
