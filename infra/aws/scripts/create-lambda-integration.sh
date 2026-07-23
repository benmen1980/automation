#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-lambda-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"
: "${LAMBDA_ROLE_ARN:?Set LAMBDA_ROLE_ARN to an IAM role that can read secrets, write logs, and poll SQS.}"
: "${SQS_QUEUE_ARN:=}"
: "${LAMBDA_TIMEOUT_SECONDS:=30}"
: "${LOG_RETENTION_DAYS:=30}"
: "${SQS_BATCH_SIZE:=1}"
: "${MAX_RECEIVE_COUNT:=3}"
: "${WORKER_CALLBACK_TOKEN_SECRET_ID:?Set WORKER_CALLBACK_TOKEN_SECRET_ID to the Secrets Manager ID containing the API worker-callback token.}"
: "${FINALIZATION_TABLE_NAME:=${INTEGRATION_NAME}-finalization}"

PACKAGE_DIR="integrations/${INTEGRATION_NAME}"
ZIP_FILE="dist/${INTEGRATION_NAME}-lambda.zip"
BUILD_DIR="dist/lambda-${INTEGRATION_NAME}"

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}/node_modules/@automation"
cp -R "${PACKAGE_DIR}/package.json" "${PACKAGE_DIR}/src" "${PACKAGE_DIR}/fixtures" "${BUILD_DIR}/"
cp -R "packages/shared" "${BUILD_DIR}/node_modules/@automation/shared"
(cd "${BUILD_DIR}" && npm install --omit=dev --ignore-scripts >/dev/null)
(cd "${BUILD_DIR}" && zip -r "../${INTEGRATION_NAME}-lambda.zip" . >/dev/null)

LOG_GROUP="/aws/lambda/${INTEGRATION_NAME}"
aws logs create-log-group --log-group-name "${LOG_GROUP}" --region "${AWS_REGION}" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "${LOG_GROUP}" --retention-in-days "${LOG_RETENTION_DAYS}" --region "${AWS_REGION}"

if aws lambda get-function --function-name "${INTEGRATION_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  aws lambda update-function-code \
    --function-name "${INTEGRATION_NAME}" \
    --zip-file "fileb://${ZIP_FILE}" \
    --region "${AWS_REGION}" >/dev/null
  aws lambda wait function-updated-v2 --function-name "${INTEGRATION_NAME}" --region "${AWS_REGION}"
  aws lambda update-function-configuration \
    --function-name "${INTEGRATION_NAME}" \
    --runtime nodejs22.x \
    --handler src/lambda.handler \
    --role "${LAMBDA_ROLE_ARN}" \
    --timeout "${LAMBDA_TIMEOUT_SECONDS}" \
    --environment "Variables={AUTOMATION_WORKER_CALLBACK_TOKEN_SECRET_ID=${WORKER_CALLBACK_TOKEN_SECRET_ID},AUTOMATION_FINALIZATION_TABLE_NAME=${FINALIZATION_TABLE_NAME},AUTOMATION_MAX_RECEIVE_COUNT=${MAX_RECEIVE_COUNT}}" \
    --logging-config "LogFormat=JSON,ApplicationLogLevel=INFO,SystemLogLevel=WARN,LogGroup=${LOG_GROUP}" \
    --region "${AWS_REGION}" >/dev/null
else
  aws lambda create-function \
    --function-name "${INTEGRATION_NAME}" \
    --runtime nodejs22.x \
    --handler src/lambda.handler \
    --zip-file "fileb://${ZIP_FILE}" \
    --role "${LAMBDA_ROLE_ARN}" \
    --timeout "${LAMBDA_TIMEOUT_SECONDS}" \
    --environment "Variables={AUTOMATION_WORKER_CALLBACK_TOKEN_SECRET_ID=${WORKER_CALLBACK_TOKEN_SECRET_ID},AUTOMATION_FINALIZATION_TABLE_NAME=${FINALIZATION_TABLE_NAME},AUTOMATION_MAX_RECEIVE_COUNT=${MAX_RECEIVE_COUNT}}" \
    --logging-config "LogFormat=JSON,ApplicationLogLevel=INFO,SystemLogLevel=WARN,LogGroup=${LOG_GROUP}" \
    --region "${AWS_REGION}" >/dev/null
fi

if [[ -n "${SQS_QUEUE_ARN}" ]]; then
  MAPPING_UUID=$(aws lambda list-event-source-mappings \
    --function-name "${INTEGRATION_NAME}" \
    --event-source-arn "${SQS_QUEUE_ARN}" \
    --region "${AWS_REGION}" \
    --query 'EventSourceMappings[0].UUID' \
    --output text)
  if [[ -n "${MAPPING_UUID}" && "${MAPPING_UUID}" != "None" ]]; then
    aws lambda update-event-source-mapping \
      --uuid "${MAPPING_UUID}" \
      --batch-size "${SQS_BATCH_SIZE}" \
      --function-response-types ReportBatchItemFailures \
      --region "${AWS_REGION}" >/dev/null
  else
    aws lambda create-event-source-mapping \
      --function-name "${INTEGRATION_NAME}" \
      --event-source-arn "${SQS_QUEUE_ARN}" \
      --batch-size "${SQS_BATCH_SIZE}" \
      --function-response-types ReportBatchItemFailures \
      --region "${AWS_REGION}" >/dev/null
  fi
  echo "Connected ${INTEGRATION_NAME} to SQS event source ${SQS_QUEUE_ARN}"
else
  echo "Skipped SQS event source mapping. Set SQS_QUEUE_ARN to connect the queue to Lambda."
fi

echo "Created Lambda integration: ${INTEGRATION_NAME}"
