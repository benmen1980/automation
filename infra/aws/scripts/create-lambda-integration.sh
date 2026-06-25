#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-lambda-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"
: "${LAMBDA_ROLE_ARN:?Set LAMBDA_ROLE_ARN to an IAM role that can read secrets, write logs, and poll SQS.}"

PACKAGE_DIR="integrations/${INTEGRATION_NAME}"
ZIP_FILE="dist/${INTEGRATION_NAME}-lambda.zip"

mkdir -p dist
(cd "${PACKAGE_DIR}" && zip -r "../../${ZIP_FILE}" package.json src fixtures >/dev/null)

aws lambda create-function \
  --function-name "${INTEGRATION_NAME}" \
  --runtime nodejs22.x \
  --handler src/lambda.handler \
  --zip-file "fileb://${ZIP_FILE}" \
  --role "${LAMBDA_ROLE_ARN}" \
  --region "${AWS_REGION}"

echo "Created Lambda integration: ${INTEGRATION_NAME}"
