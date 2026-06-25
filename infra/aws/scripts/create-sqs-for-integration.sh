#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_NAME="${1:?Usage: create-sqs-for-integration.sh <integration-name>}"
: "${AWS_REGION:=eu-west-1}"

DLQ_NAME="${INTEGRATION_NAME}-dlq"
QUEUE_NAME="${INTEGRATION_NAME}-queue"

DLQ_URL=$(aws sqs create-queue --queue-name "${DLQ_NAME}" --region "${AWS_REGION}" --query QueueUrl --output text)
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "${DLQ_URL}" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

aws sqs create-queue \
  --queue-name "${QUEUE_NAME}" \
  --region "${AWS_REGION}" \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

echo "Created SQS queue ${QUEUE_NAME} with DLQ ${DLQ_NAME}"
