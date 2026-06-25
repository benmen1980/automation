#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-pipeline-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"
: "${REPO_ID:=benmen1980/automation}"
: "${BRANCH:=master}"

echo "Create a CodePipeline named automation-${INTEGRATION_NAME} with:"
echo "- Source: GitHub connection, ${REPO_ID}, branch ${BRANCH}"
echo "- Path filter: integrations/${INTEGRATION_NAME}/** and packages/shared/**"
echo "- Build: buildspec-lambda-integration.yml with INTEGRATION_NAME=${INTEGRATION_NAME}"
echo "- Deploy: Lambda ${INTEGRATION_NAME} or Fargate service for heavy workers"
echo "packages/shared/** changes should trigger all integration pipelines."
