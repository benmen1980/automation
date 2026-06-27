#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-lambda-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"
: "${LAMBDA_ROLE_ARN:?Set LAMBDA_ROLE_ARN to an IAM role that can read secrets, write logs, and poll SQS.}"
: "${SQS_QUEUE_ARN:=}"

PACKAGE_DIR="integrations/${INTEGRATION_NAME}"
ZIP_FILE="dist/${INTEGRATION_NAME}-lambda.zip"
BUILD_DIR="dist/lambda-${INTEGRATION_NAME}"

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}/node_modules/@automation"
cp -R "${PACKAGE_DIR}/package.json" "${PACKAGE_DIR}/src" "${PACKAGE_DIR}/fixtures" "${BUILD_DIR}/"
cp -R "packages/shared" "${BUILD_DIR}/node_modules/@automation/shared"
(cd "${BUILD_DIR}" && zip -r "../${INTEGRATION_NAME}-lambda.zip" . >/dev/null)

aws lambda create-function \
  --function-name "${INTEGRATION_NAME}" \
  --runtime nodejs22.x \
  --handler src/lambda.handler \
  --zip-file "fileb://${ZIP_FILE}" \
  --role "${LAMBDA_ROLE_ARN}" \
  --region "${AWS_REGION}"

if [[ -n "${SQS_QUEUE_ARN}" ]]; then
  aws lambda create-event-source-mapping \
    --function-name "${INTEGRATION_NAME}" \
    --event-source-arn "${SQS_QUEUE_ARN}" \
    --batch-size 10 \
    --region "${AWS_REGION}"
  echo "Connected ${INTEGRATION_NAME} to SQS event source ${SQS_QUEUE_ARN}"
else
  echo "Skipped SQS event source mapping. Set SQS_QUEUE_ARN to connect the queue to Lambda."
fi

echo "Created Lambda integration: ${INTEGRATION_NAME}"
