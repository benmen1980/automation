#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME=""
RUNTIME="lambda"
BRANCH="${BRANCH:-master}"
GITHUB_OWNER="${GITHUB_OWNER:-benmen1980}"
GITHUB_REPO="${GITHUB_REPO:-automation}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
CODECONNECTION_ARN="${CODECONNECTION_ARN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --integration) INTEGRATION_NAME="${2:?}"; shift 2 ;;
    --runtime) RUNTIME="${2:?}"; shift 2 ;;
    --branch) BRANCH="${2:?}"; shift 2 ;;
    --github-owner) GITHUB_OWNER="${2:?}"; shift 2 ;;
    --github-repo) GITHUB_REPO="${2:?}"; shift 2 ;;
    --codeconnection-arn) CODECONNECTION_ARN="${2:?}"; shift 2 ;;
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

echo "Create independent pipeline automation-${INTEGRATION_NAME}:"
echo "- Source: ${GITHUB_OWNER}/${GITHUB_REPO}, branch ${BRANCH}"
echo "- Region: ${AWS_REGION}"
echo "- CodeConnection ARN: ${CODECONNECTION_ARN:-<provide account-specific ARN>}"
echo "- Path filter: integrations/${INTEGRATION_NAME}/**, packages/shared/**, buildspec-${RUNTIME}-integration.yml"
echo "- Runtime: ${RUNTIME}"
echo "- Queue: ${INTEGRATION_NAME}-queue"
echo "- DLQ: ${INTEGRATION_NAME}-dlq"
echo "- CloudWatch log group: /automation/integrations/${INTEGRATION_NAME}"
echo
echo "Next commands:"
echo "  infra/aws/scripts/create-sqs-for-integration.sh ${INTEGRATION_NAME}"
if [[ "${RUNTIME}" == "lambda" ]]; then
  echo "  infra/aws/scripts/create-lambda-integration.sh ${INTEGRATION_NAME}"
else
  echo "  infra/aws/scripts/create-fargate-integration.sh ${INTEGRATION_NAME}"
fi
echo "  infra/aws/scripts/create-pipeline-integration.sh ${INTEGRATION_NAME}"
