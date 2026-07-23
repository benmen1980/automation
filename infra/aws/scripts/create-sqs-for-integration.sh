#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-sqs-for-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"

DLQ_NAME="${INTEGRATION_NAME}-dlq"
QUEUE_NAME="${INTEGRATION_NAME}-queue"
ENV_SUFFIX="$(echo "${INTEGRATION_NAME}" | tr '[:lower:]-' '[:upper:]_')"
: "${API_QUEUE_ENV_SUFFIX:=${ENV_SUFFIX}}"
: "${VISIBILITY_TIMEOUT_SECONDS:=90}"
: "${MAX_RECEIVE_COUNT:=3}"

DLQ_URL=$(aws sqs create-queue --queue-name "${DLQ_NAME}" --region "${AWS_REGION}" --query QueueUrl --output text)
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "${DLQ_URL}" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

QUEUE_URL=$(aws sqs create-queue \
  --queue-name "${QUEUE_NAME}" \
  --region "${AWS_REGION}" \
  --attributes "{\"VisibilityTimeout\":\"${VISIBILITY_TIMEOUT_SECONDS}\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"${MAX_RECEIVE_COUNT}\\\"}\"}" \
  --query QueueUrl \
  --output text)
QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "${QUEUE_URL}" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

echo "Created SQS queue ${QUEUE_NAME} with DLQ ${DLQ_NAME}"
echo "Queue URL: ${QUEUE_URL}"
echo "Queue ARN: ${QUEUE_ARN}"
echo "Configure API with SQS_QUEUE_URL_${API_QUEUE_ENV_SUFFIX}=${QUEUE_URL}"
echo "Configure Lambda creation with SQS_QUEUE_ARN=${QUEUE_ARN}"
